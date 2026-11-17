import { extname } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { extrairTexto } from '@/ai/analise/extrair-texto';
import type { VaultNotaHit } from '@/vault/vault.service';
import type { AuthenticatedUser } from '@/auth/jwt.strategy';
import {
  CapacidadesOrgService,
  type CapacidadesOrg,
} from '@/compartilhamento/capacidades-org.service';
import { AuditoriaService } from '@/auditoria/auditoria.service';

export type StatusDocumentoOrg = 'processando' | 'disponivel' | 'erro';

/** Linha da tabela do Repositório — sem o conteúdo. */
export interface DocumentoOrg {
  id: string;
  nome: string;
  tipo: string;
  tamanho: number;
  status: StatusDocumentoOrg;
  erro: string | null;
  adicionadoPorNome: string;
  criadoEm: Date;
  /** `upload` ou `copia_nota` (cópia publicada de uma nota pessoal). */
  origemTipo: string;
  origemDonoNome: string | null;
  editadoEm: Date | null;
}

const SELECT_LINHA = {
  id: true,
  nome: true,
  tipo: true,
  tamanho: true,
  status: true,
  erro: true,
  adicionadoPorNome: true,
  criadoEm: true,
  origemTipo: true,
  origemDonoNome: true,
  editadoEm: true,
} as const;

/** Tipos de arquivo cujo texto pode ser editado na plataforma. */
const EDITAVEIS = new Set(['md', 'markdown', 'txt']);

/**
 * Prefixo do `path` com que um documento da organização entra no contexto da
 * IA. Distingue-o de uma nota do vault (cujo path é um caminho de pasta) e não
 * colide com nenhum caminho real.
 */
export const PREFIXO_PATH_ORG = 'repositorio:';

/**
 * Repositório da organização: a base de conhecimento INSTITUCIONAL.
 *
 * Escopado por empresa (tenant, do JWT) **e** organização (header
 * `X-Organizacao-Id`; `pessoal:<outro>` é barrado pelo interceptor global).
 *
 * Quem pode o quê é decidido NO SERVIDOR (`CapacidadesOrgService`): ver
 * (`documentos.visualizar`), usar como contexto da IA (`documentos.usar_ia`),
 * enviar, editar e excluir. Ver não implica usar na IA. Este repositório não
 * dá acesso a nada pessoal de ninguém.
 */
@Injectable()
export class RepositorioOrgService {
  private readonly logger = new Logger(RepositorioOrgService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly capacidades: CapacidadesOrgService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Capacidades do usuário (para o controller e a interface). */
  capacidadesDe(user: AuthenticatedUser): Promise<CapacidadesOrg> {
    return this.capacidades.de(user);
  }

  private async exigir(
    user: AuthenticatedUser,
    cap: keyof CapacidadesOrg,
    mensagem: string,
  ): Promise<void> {
    const c = await this.capacidades.de(user);
    if (!c[cap]) throw new ForbiddenException(mensagem);
  }

  async listar(
    user: AuthenticatedUser,
    organizacaoId: string | null,
  ): Promise<DocumentoOrg[]> {
    if (!organizacaoId) return [];
    await this.exigir(
      user,
      'visualizar',
      'A sua role não permite visualizar os documentos da organização.',
    );
    const linhas = await this.prisma.repositorioOrgDocumento.findMany({
      where: { empresaId: user.empresaId, organizacaoId },
      orderBy: { criadoEm: 'desc' },
      select: SELECT_LINHA,
    });
    return linhas as DocumentoOrg[];
  }

  /** Conteúdo (texto) de um documento — para visualizar/editar. Auditado. */
  async obter(
    user: AuthenticatedUser,
    organizacaoId: string,
    id: string,
  ): Promise<DocumentoOrg & { conteudo: string; editavel: boolean }> {
    await this.exigir(
      user,
      'visualizar',
      'A sua role não permite visualizar os documentos da organização.',
    );
    const doc = await this.prisma.repositorioOrgDocumento.findFirst({
      where: { id, empresaId: user.empresaId, organizacaoId },
      select: { ...SELECT_LINHA, conteudo: true },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    await this.auditoria.registrar({
      empresaId: user.empresaId,
      atorUsuarioId: user.id,
      acao: 'conteudo.visualizado',
      recursoTipo: 'documento_org',
      recursoId: doc.id,
      recursoTitulo: doc.nome,
    });
    return {
      ...(doc as DocumentoOrg & { conteudo: string }),
      editavel: EDITAVEIS.has(doc.tipo),
    };
  }

  /**
   * Grava o documento e extrai o texto. A linha nasce `processando` e termina
   * `disponivel` ou `erro` — é o estado que a tabela mostra, e um documento em
   * `erro` fica visível (com a causa) em vez de sumir.
   */
  async enviar(
    user: AuthenticatedUser,
    organizacaoId: string,
    arquivo: { originalname: string; buffer: Buffer; size: number },
  ): Promise<DocumentoOrg> {
    await this.exigir(
      user,
      'enviar',
      'A sua role não permite enviar documentos ao Repositório da organização.',
    );
    const empresaId = user.empresaId;
    const nome = nomeDoArquivo(arquivo.originalname);
    const tipo = extname(nome).replace('.', '').toLowerCase() || 'txt';

    const autor = await this.prisma.usuario.findUnique({
      where: { id: user.id },
      select: { nome: true, email: true },
    });

    const criado = await this.prisma.repositorioOrgDocumento.create({
      data: {
        empresaId,
        organizacaoId,
        nome,
        tipo,
        tamanho: arquivo.size,
        adicionadoPorId: user.id,
        adicionadoPorNome: autor?.nome || autor?.email || 'Usuário',
      },
      select: { id: true },
    });

    let conteudo = '';
    let erro: string | null = null;
    try {
      conteudo = (await extrairTexto(arquivo.buffer, nome)).trim();
      if (!conteudo) erro = 'Não foi possível extrair texto do arquivo.';
    } catch (err) {
      erro =
        err instanceof Error ? err.message : 'Não foi possível ler o arquivo.';
      this.logger.warn(`Falha ao extrair "${nome}": ${String(err)}`);
    }

    const atualizado = await this.prisma.repositorioOrgDocumento.update({
      where: { id: criado.id },
      data: erro
        ? { status: 'erro', erro }
        : { status: 'disponivel', conteudo },
      select: SELECT_LINHA,
    });
    await this.auditoria.registrar({
      empresaId,
      atorUsuarioId: user.id,
      acao: 'repositorio_org.enviado',
      recursoTipo: 'documento_org',
      recursoId: criado.id,
      recursoTitulo: nome,
      alvoTipo: 'organizacao',
      alvoId: organizacaoId,
    });
    return atualizado as DocumentoOrg;
  }

  /** Edita o texto de um documento de texto (md/txt). */
  async editar(
    user: AuthenticatedUser,
    organizacaoId: string,
    id: string,
    conteudo: string,
  ): Promise<DocumentoOrg> {
    await this.exigir(
      user,
      'editar',
      'A sua role não permite editar documentos da organização.',
    );
    const doc = await this.prisma.repositorioOrgDocumento.findFirst({
      where: { id, empresaId: user.empresaId, organizacaoId },
      select: { id: true, nome: true, tipo: true },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    if (!EDITAVEIS.has(doc.tipo)) {
      throw new BadRequestException(
        'Só documentos de texto (.md, .txt) podem ser editados na plataforma.',
      );
    }
    const atualizado = await this.prisma.repositorioOrgDocumento.update({
      where: { id: doc.id },
      data: {
        conteudo,
        tamanho: Buffer.byteLength(conteudo, 'utf8'),
        status: 'disponivel',
        erro: null,
        editadoPorId: user.id,
        editadoEm: new Date(),
      },
      select: SELECT_LINHA,
    });
    await this.auditoria.registrar({
      empresaId: user.empresaId,
      atorUsuarioId: user.id,
      acao: 'repositorio_org.editado',
      recursoTipo: 'documento_org',
      recursoId: doc.id,
      recursoTitulo: doc.nome,
    });
    return atualizado as DocumentoOrg;
  }

  async remover(
    user: AuthenticatedUser,
    organizacaoId: string,
    id: string,
  ): Promise<void> {
    await this.exigir(
      user,
      'excluir',
      'A sua role não permite excluir documentos da organização.',
    );
    const doc = await this.prisma.repositorioOrgDocumento.findFirst({
      where: { id, empresaId: user.empresaId, organizacaoId },
      select: { id: true, nome: true },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    await this.prisma.repositorioOrgDocumento.delete({ where: { id: doc.id } });
    await this.auditoria.registrar({
      empresaId: user.empresaId,
      atorUsuarioId: user.id,
      acao: 'repositorio_org.excluido',
      recursoTipo: 'documento_org',
      recursoId: doc.id,
      recursoTitulo: doc.nome,
    });
  }

  /**
   * Os documentos disponíveis mais recentes da organização, com conteúdo —
   * matéria-prima da geração manual de insights. Exige `documentos.usar_ia`;
   * sem ela devolve vazio (a IA simplesmente não os vê).
   */
  async recentes(
    user: AuthenticatedUser,
    organizacaoId: string | null,
    k = 8,
  ): Promise<VaultNotaHit[]> {
    if (!organizacaoId) return [];
    if (!(await this.capacidades.de(user)).usarIa) return [];
    const docs = await this.prisma.repositorioOrgDocumento.findMany({
      where: { empresaId: user.empresaId, organizacaoId, status: 'disponivel' },
      orderBy: { criadoEm: 'desc' },
      take: k,
      select: { nome: true, conteudo: true },
    });
    return docs.map((d) => ({
      path: `${PREFIXO_PATH_ORG}${d.nome}`,
      titulo: tituloDoNome(d.nome),
      conteudo: d.conteudo,
    }));
  }

  /**
   * Documentos mais relevantes à pergunta, no mesmo formato das notas do vault
   * — para entrarem no MESMO bloco de contexto. Exige `documentos.usar_ia`
   * (visualizar não basta); sem ela, devolve vazio.
   *
   * Sem casamento, devolve vazio (não há fallback de "mais recentes"): quem
   * chama já recebe o fallback do vault, e documento da organização fora de
   * assunto só competiria com ele pelo orçamento do prompt.
   */
  async search(
    user: AuthenticatedUser,
    organizacaoId: string | null,
    query: string,
    k = 4,
  ): Promise<VaultNotaHit[]> {
    const q = query.trim();
    if (!organizacaoId || !q) return [];
    if (!(await this.capacidades.de(user)).usarIa) return [];
    const rows = await this.prisma.$queryRaw<
      { nome: string; conteudo: string }[]
    >`
      SELECT "nome", "conteudo"
      FROM "repositorio_org_documentos"
      WHERE "empresaId" = ${user.empresaId}
        AND "organizacaoId" = ${organizacaoId}
        AND "status" = 'disponivel'
        AND to_tsvector('portuguese', coalesce("nome", '') || ' ' || coalesce("conteudo", ''))
            @@ websearch_to_tsquery('portuguese', ${q})
      ORDER BY ts_rank(
        to_tsvector('portuguese', coalesce("nome", '') || ' ' || coalesce("conteudo", '')),
        websearch_to_tsquery('portuguese', ${q})
      ) DESC
      LIMIT ${k}
    `;
    return rows.map((r) => ({
      path: `${PREFIXO_PATH_ORG}${r.nome}`,
      titulo: tituloDoNome(r.nome),
      conteudo: r.conteudo,
    }));
  }
}

/**
 * O multer entrega `originalname` decodificado como latin1; um "Relatório.pdf"
 * chegaria como "RelatÃ³rio.pdf". Reinterpreta como UTF-8 só quando isso
 * produz texto válido — um nome ASCII passa igual.
 */
function nomeDoArquivo(original: string): string {
  const utf8 = Buffer.from(original, 'latin1').toString('utf8');
  const nome = utf8.includes('�') ? original : utf8;
  return nome.trim().slice(0, 255) || 'documento';
}

/** "Plano Estratégico 2026.pdf" → "Plano Estratégico 2026". */
function tituloDoNome(nome: string): string {
  return nome.replace(/\.[^.]+$/, '') || nome;
}
