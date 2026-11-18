import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { extname } from 'node:path';
import { OauthProviderService } from './oauth-provider.service';
import { getProviderBinary, getProviderJson } from './provider-fetch';
import { extrairTexto } from '@/ai/analise/extrair-texto';
import { caminhoDemo, itemDemo, listarDemo } from './drive-demo';

/**
 * Um arquivo (ou pasta) do Drive, já normalizado — mesmo contrato para
 * qualquer provedor de arquivos (hoje só o Google Drive).
 */
export interface DriveArquivo {
  id: string;
  nome: string;
  mimeType: string;
  pasta: boolean;
  /** Bytes; ausente nos nativos do Google (Docs/Sheets/Slides) e em pastas. */
  tamanho?: number;
  modificadoEm?: string;
  dono?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  /** Docs/Sheets/Slides etc.: não têm bytes próprios, só exportação. */
  nativoGoogle: boolean;
  /** Extensão com que o arquivo é salvo no Repositório (ex.: ".pdf"). */
  extensao: string;
}

export type DriveVisao = 'meu-drive' | 'compartilhados' | 'recentes';

export interface DriveConteudo {
  arquivo: DriveArquivo;
  /** Texto extraído para prévia e para a nota; null quando não suportado. */
  texto: string | null;
  suportado: boolean;
  truncado: boolean;
  /** Por que não há texto (tipo sem extração, arquivo grande demais…). */
  motivo?: string;
}

/**
 * Teto de download: a resposta de uma função na Vercel não passa de ~4,5 MB,
 * e o original é devolvido ao navegador pela API.
 */
export const DRIVE_LIMITE_BYTES = 4 * 1024 * 1024;
/** Mesmo teto de caracteres por nota do vault sync (dto/sync-vault.dto.ts). */
const LIMITE_TEXTO = 200_000;
const LIMITE_PADRAO = 50;
const LIMITE_MAX = 100;
const PROFUNDIDADE_MAX = 12;

const API = 'https://www.googleapis.com/drive/v3/files';
const FIELDS_ARQUIVO =
  'id,name,mimeType,size,modifiedTime,owners(displayName,emailAddress),' +
  'webViewLink,thumbnailLink,iconLink,parents';

const MIME_PASTA = 'application/vnd.google-apps.folder';

/**
 * Nativos do Google: como exportar para TEXTO (prévia/nota) e para o
 * ORIGINAL guardado ao lado da nota. Docs saem em markdown, que o
 * MarkdownView e a IA leem bem.
 */
const NATIVOS: Record<
  string,
  { texto: string; original: string; extensao: string }
> = {
  'application/vnd.google-apps.document': {
    texto: 'text/markdown',
    original:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensao: '.docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    texto: 'text/csv',
    original:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensao: '.xlsx',
  },
  'application/vnd.google-apps.presentation': {
    texto: 'text/plain',
    original: 'application/pdf',
    extensao: '.pdf',
  },
};

/** Extensões cujo texto o `extrairTexto` sabe ler. */
const EXTRAIVEIS = new Set([
  '.pdf',
  '.docx',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.log',
]);

/** MIME → extensão, para binários cujo nome veio sem extensão. */
const EXT_POR_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'application/json': '.json',
};

interface GoogleFile {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  owners?: { displayName?: string; emailAddress?: string }[];
  webViewLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  parents?: string[];
}

/**
 * Leitura do Google Drive do tenant, com o token OAuth guardado pelo
 * OauthProviderService (que renova sozinho). Mesmo desenho do
 * AgendaApiService/EmailApiService — REST v3 por `fetch`, sem SDK.
 */
@Injectable()
export class DriveApiService {
  private readonly logger = new Logger(DriveApiService.name);
  private readonly ctx = {
    logger: this.logger,
    label: 'Google Drive',
    recurso: 'aos arquivos',
  };

  constructor(private readonly oauth: OauthProviderService) {}

  /** Uma página de arquivos de uma pasta, de uma visão ou de uma busca. */
  async listar(
    empresaId: string,
    provedor: string,
    opts: {
      pasta?: string;
      busca?: string;
      visao?: DriveVisao;
      pageToken?: string;
      limite?: number;
    },
  ): Promise<{ arquivos: DriveArquivo[]; proximaPagina?: string }> {
    if (await this.ehDemo(empresaId, provedor)) return listarDemo(opts);
    const token = await this.token(empresaId, provedor);
    const max = Math.min(
      Math.max(1, Math.trunc(opts.limite ?? LIMITE_PADRAO) || LIMITE_PADRAO),
      LIMITE_MAX,
    );

    const filtros = ['trashed = false'];
    const busca = opts.busca?.trim();
    let orderBy = 'folder,name';
    if (busca) {
      const termo = this.escapar(busca);
      filtros.push(`(name contains '${termo}' or fullText contains '${termo}')`);
      // `fullText` não aceita orderBy; o Drive ordena por relevância.
      orderBy = '';
    } else if (opts.pasta) {
      filtros.push(`'${this.escapar(opts.pasta)}' in parents`);
    } else if (opts.visao === 'compartilhados') {
      filtros.push('sharedWithMe = true');
      orderBy = 'folder,modifiedTime desc';
    } else if (opts.visao === 'recentes') {
      filtros.push(`mimeType != '${MIME_PASTA}'`);
      orderBy = 'viewedByMeTime desc';
    } else {
      filtros.push(`'root' in parents`);
    }

    const params = new URLSearchParams({
      q: filtros.join(' and '),
      pageSize: String(max),
      fields: `nextPageToken,files(${FIELDS_ARQUIVO})`,
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (orderBy) params.set('orderBy', orderBy);
    if (opts.pageToken) params.set('pageToken', opts.pageToken);

    const data = await getProviderJson<{
      files?: GoogleFile[];
      nextPageToken?: string;
    }>(this.ctx, `${API}?${params.toString()}`, token);
    return {
      arquivos: (data.files ?? []).map((f) => this.mapear(f)),
      proximaPagina: data.nextPageToken || undefined,
    };
  }

  /**
   * Caminho da pasta/arquivo até a raiz (do mais alto ao próprio item), para
   * o breadcrumb. Pára no "Meu Drive" ou quando o pai não é acessível
   * (arquivo compartilhado de outra pessoa).
   */
  async caminho(
    empresaId: string,
    provedor: string,
    id: string,
  ): Promise<{ id: string; nome: string }[]> {
    if (await this.ehDemo(empresaId, provedor)) return caminhoDemo(id);
    const token = await this.token(empresaId, provedor);
    const trilha: { id: string; nome: string }[] = [];
    let atual: string | undefined = id;
    for (let i = 0; atual && i < PROFUNDIDADE_MAX; i++) {
      let f: GoogleFile;
      try {
        f = await this.metadados(token, atual);
      } catch {
        break;
      }
      // A raiz do Meu Drive não tem pai: a UI já mostra "Meu Drive".
      if (!f.parents?.length) break;
      trilha.unshift({ id: f.id, nome: f.name ?? 'Sem nome' });
      atual = f.parents[0];
    }
    return trilha;
  }

  /** Metadados + texto extraído do arquivo, para prévia e para a nota. */
  async conteudo(
    empresaId: string,
    provedor: string,
    id: string,
  ): Promise<DriveConteudo> {
    if (await this.ehDemo(empresaId, provedor)) {
      const { arquivo, texto } = this.demo(id);
      if (arquivo.pasta) {
        throw new BadRequestException('Pastas não têm conteúdo para prévia.');
      }
      return texto
        ? { arquivo, texto, suportado: true, truncado: false }
        : {
            arquivo,
            texto: null,
            suportado: false,
            truncado: false,
            motivo: 'Prévia de texto indisponível para este tipo de arquivo.',
          };
    }
    const token = await this.token(empresaId, provedor);
    const arquivo = this.mapear(await this.metadados(token, id));
    if (arquivo.pasta) {
      throw new BadRequestException('Pastas não têm conteúdo para prévia.');
    }

    const semTexto = (motivo: string): DriveConteudo => ({
      arquivo,
      texto: null,
      suportado: false,
      truncado: false,
      motivo,
    });

    const nativo = NATIVOS[arquivo.mimeType];
    let texto: string;
    try {
      if (nativo) {
        texto = await this.exportarTexto(token, id, nativo.texto);
      } else if (arquivo.mimeType.startsWith('application/vnd.google-apps')) {
        return semTexto('Este tipo de arquivo do Google não tem prévia.');
      } else {
        if (!EXTRAIVEIS.has(arquivo.extensao)) {
          return semTexto(
            'Prévia de texto indisponível para este tipo de arquivo.',
          );
        }
        if ((arquivo.tamanho ?? 0) > DRIVE_LIMITE_BYTES) {
          return semTexto(this.avisoTamanho());
        }
        const { buffer } = await getProviderBinary(
          this.ctx,
          `${API}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
          token,
          DRIVE_LIMITE_BYTES,
        );
        texto = await extrairTexto(buffer, `arquivo${arquivo.extensao}`);
      }
    } catch (err) {
      if (err instanceof BadRequestException) {
        const msg = String(
          (err.getResponse() as { message?: string }).message ?? err.message,
        );
        // Falta de autorização tem que chegar à UI como erro (reconectar);
        // limite de tamanho vira só "sem prévia".
        if (/recusou o acesso/.test(msg)) throw err;
        return semTexto(msg);
      }
      if (err instanceof Error && !('getStatus' in err)) {
        this.logger.warn(`Extração falhou para ${id}: ${err.message}`);
        return semTexto('Não foi possível extrair o texto deste arquivo.');
      }
      throw err;
    }

    const truncado = texto.length > LIMITE_TEXTO;
    return {
      arquivo,
      texto: truncado ? texto.slice(0, LIMITE_TEXTO) : texto,
      suportado: true,
      truncado,
    };
  }

  /**
   * Bytes do arquivo para guardar ao lado da nota no Repositório. Nativos do
   * Google saem exportados (Docs → .docx, Sheets → .xlsx, Slides → .pdf).
   */
  async original(
    empresaId: string,
    provedor: string,
    id: string,
  ): Promise<{ buffer: Buffer; contentType: string; nome: string }> {
    if (await this.ehDemo(empresaId, provedor)) {
      // A demo não tem bytes reais: o "original" é o próprio texto. Sem
      // texto (imagem, vídeo, .xlsx) não há o que baixar — a tela salva só a
      // nota, como faz quando o download falha.
      const { arquivo, texto } = this.demo(id);
      if (arquivo.pasta || !texto) {
        throw new BadRequestException(
          'Arquivo de demonstração sem original para baixar.',
        );
      }
      return {
        buffer: Buffer.from(texto, 'utf8'),
        contentType:
          arquivo.extensao === '.csv'
            ? 'text/csv; charset=utf-8'
            : 'text/plain; charset=utf-8',
        nome: this.nomeComExtensao(arquivo),
      };
    }
    const token = await this.token(empresaId, provedor);
    const arquivo = this.mapear(await this.metadados(token, id));
    if (arquivo.pasta) {
      throw new BadRequestException('Pastas não podem ser baixadas.');
    }
    const nativo = NATIVOS[arquivo.mimeType];
    if (!nativo && arquivo.mimeType.startsWith('application/vnd.google-apps')) {
      throw new BadRequestException(
        'Este tipo de arquivo do Google não pode ser baixado.',
      );
    }
    if (!nativo && (arquivo.tamanho ?? 0) > DRIVE_LIMITE_BYTES) {
      throw new BadRequestException(this.avisoTamanho());
    }
    const url = nativo
      ? `${API}/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(nativo.original)}`
      : `${API}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`;
    const { buffer, contentType } = await getProviderBinary(
      this.ctx,
      url,
      token,
      DRIVE_LIMITE_BYTES,
    );
    return {
      buffer,
      contentType: nativo ? nativo.original : contentType,
      nome: this.nomeComExtensao(arquivo),
    };
  }

  // ---------- infra ----------

  /** Conexão de demonstração (origem "demo"): responde de `drive-demo.ts`. */
  private async ehDemo(empresaId: string, provedor: string): Promise<boolean> {
    if (provedor !== 'google-drive') return false;
    return Boolean(await this.oauth.conexaoDemo(empresaId, provedor));
  }

  private demo(id: string): { arquivo: DriveArquivo; texto: string | null } {
    const item = itemDemo(id);
    if (!item) throw new NotFoundException('Arquivo não encontrado.');
    return item;
  }

  private token(empresaId: string, provedor: string): Promise<string> {
    if (provedor !== 'google-drive') {
      throw new BadRequestException(`Provedor "${provedor}" não lê arquivos.`);
    }
    return this.oauth.getAccessToken(empresaId, provedor, 'arquivos');
  }

  private metadados(token: string, id: string): Promise<GoogleFile> {
    const params = new URLSearchParams({
      fields: FIELDS_ARQUIVO,
      supportsAllDrives: 'true',
    });
    return getProviderJson<GoogleFile>(
      this.ctx,
      `${API}/${encodeURIComponent(id)}?${params.toString()}`,
      token,
    );
  }

  private async exportarTexto(
    token: string,
    id: string,
    mime: string,
  ): Promise<string> {
    const url = (m: string) =>
      `${API}/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(m)}`;
    try {
      const { buffer } = await getProviderBinary(
        this.ctx,
        url(mime),
        token,
        DRIVE_LIMITE_BYTES,
      );
      return buffer.toString('utf8').trim();
    } catch (err) {
      // Markdown é recente na API de exportação; texto puro é o reserva.
      if (mime !== 'text/markdown') throw err;
      const { buffer } = await getProviderBinary(
        this.ctx,
        url('text/plain'),
        token,
        DRIVE_LIMITE_BYTES,
      );
      return buffer.toString('utf8').trim();
    }
  }

  private mapear(f: GoogleFile): DriveArquivo {
    const mimeType = f.mimeType ?? 'application/octet-stream';
    const nome = f.name ?? 'Sem nome';
    const nativo = NATIVOS[mimeType];
    const extNome = extname(nome).toLowerCase();
    const extensao = nativo
      ? nativo.extensao
      : extNome || EXT_POR_MIME[mimeType] || '';
    const dono = f.owners?.[0];
    return {
      id: f.id,
      nome,
      mimeType,
      pasta: mimeType === MIME_PASTA,
      tamanho: f.size ? Number(f.size) : undefined,
      modificadoEm: f.modifiedTime,
      dono: dono?.displayName || dono?.emailAddress || undefined,
      webViewLink: f.webViewLink,
      thumbnailLink: f.thumbnailLink,
      iconLink: f.iconLink,
      nativoGoogle: mimeType.startsWith('application/vnd.google-apps'),
      extensao,
    };
  }

  private nomeComExtensao(a: DriveArquivo): string {
    if (!a.extensao || a.nome.toLowerCase().endsWith(a.extensao)) return a.nome;
    return `${a.nome}${a.extensao}`;
  }

  private avisoTamanho(): string {
    return `Arquivo acima de ${DRIVE_LIMITE_BYTES / 1024 / 1024} MB — abra no Drive.`;
  }

  /** Aspas simples e barras escapadas na query do Drive. */
  private escapar(v: string): string {
    return v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }
}
