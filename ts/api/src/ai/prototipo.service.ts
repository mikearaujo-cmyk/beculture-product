import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProvider } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CryptoService } from './crypto';
import { isKnownModelFor, isLlmProvider, providerName } from './catalogo';
import { getProvider } from './providers';

/**
 * FORA DO FLUXO: a área "Backoffice → Configuração de API" foi removida e
 * nenhuma chamada usa mais esta chave — no protótipo, quem executa é a chave
 * cadastrada pelo usuário em Configurações → IA & API. A tabela
 * `prototipo_credenciais` foi mantida (sem apagar dados); este serviço segue
 * registrado só por causa da constante abaixo e para reuso futuro.
 *
 * Configuração de API do PROTÓTIPO — a chave operacional real que executa as
 * chamadas de IA da infraestrutura atual.
 *
 * Contexto próprio, separado de:
 *   - Modelos BeCulture (catálogo administrativo demonstrativo, `plataforma_*`)
 *   - chaves BYOK do usuário e da organização B2B (`ai_credentials`)
 * Nada aqui é copiado para lá, nem o contrário.
 *
 * Precedência: chave salva no Backoffice → variável de ambiente do servidor
 * (o `.env` continua valendo como piso, preservando a infraestrutura atual).
 */

/** Provedores com execução implementada no protótipo. */
export const PROVEDORES_OPERACIONAIS = ['anthropic', 'openai', 'heygen'] as const;
export type ProvedorOperacional = (typeof PROVEDORES_OPERACIONAIS)[number];

const ENV_DO_PROVEDOR: Record<ProvedorOperacional, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  heygen: 'HEYGEN_API_KEY',
};

/** Para que cada provedor é usado pela infraestrutura atual. */
const USOS: Record<ProvedorOperacional, string[]> = {
  anthropic: ['Texto (chat, assistente, documentos)'],
  openai: ['Texto', 'Imagem', 'Transcrição de áudio'],
  heygen: ['Vídeo'],
};

const MODELO_PADRAO: Record<'anthropic' | 'openai', string> = {
  anthropic: 'claude-opus-4-8',
  openai: 'gpt-4o',
};

export type FonteChave = 'backoffice' | 'ambiente' | 'nenhuma';

export interface ChaveOperacionalPublica {
  provider: ProvedorOperacional;
  providerNome: string;
  usos: string[];
  /** De onde vem a chave em uso agora. */
  fonte: FonteChave;
  /** Só quando fonte = backoffice. */
  keyLast4: string | null;
  status: 'ativa' | 'invalida' | null;
  validatedAt: Date | null;
  modeloPadrao: string | null;
  atualizadoEm: Date | null;
  aviso?: string;
}

export interface ChaveOperacional {
  provider: ProvedorOperacional;
  apiKey: string;
  /** Modelo padrão (texto) desta chave. */
  model: string;
  fonte: Exclude<FonteChave, 'nenhuma'>;
}

export function ehProvedorOperacional(p: string): p is ProvedorOperacional {
  return (PROVEDORES_OPERACIONAIS as readonly string[]).includes(p);
}

@Injectable()
export class PrototipoIaService {
  private readonly logger = new Logger(PrototipoIaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  // ---------- Backoffice ----------

  async listar(): Promise<ChaveOperacionalPublica[]> {
    const rows = await this.prisma.prototipoCredencial.findMany();
    return PROVEDORES_OPERACIONAIS.map((provider) => {
      const r = rows.find((x) => x.provider === provider);
      const env = this.config.get<string>(ENV_DO_PROVEDOR[provider]);
      return {
        provider,
        providerNome: providerName(provider),
        usos: USOS[provider],
        fonte: r ? 'backoffice' : env ? 'ambiente' : 'nenhuma',
        keyLast4: r?.keyLast4 ?? null,
        status: r?.status ?? null,
        validatedAt: r?.validatedAt ?? null,
        modeloPadrao: r?.modeloPadrao ?? this.modeloPadraoDeAmbiente(provider),
        atualizadoEm: r?.atualizadoEm ?? null,
      };
    });
  }

  /** Cadastra ou substitui a chave do provedor (e/ou o modelo padrão). */
  async salvar(
    provider: string,
    input: { apiKey?: string; modeloPadrao?: string | null },
  ): Promise<ChaveOperacionalPublica> {
    if (!ehProvedorOperacional(provider)) {
      throw new BadRequestException('Provedor sem execução no protótipo.');
    }
    if (input.modeloPadrao && !isKnownModelFor(provider, 'text', input.modeloPadrao)) {
      throw new BadRequestException('Modelo padrão inválido para o provedor.');
    }
    const atual = await this.prisma.prototipoCredencial.findUnique({
      where: { provider },
    });
    let aviso: string | undefined;

    if (input.apiKey) {
      const apiKey = input.apiKey.trim();
      const check = await this.verificar(provider, apiKey);
      if (check.status === 'invalida') {
        throw new BadRequestException(
          `O provedor recusou esta chave: ${check.detalhe}`,
        );
      }
      aviso = check.aviso;
      const dados = {
        apiKeyEncrypted: this.crypto.encrypt(apiKey),
        keyLast4: apiKey.slice(-4),
        status: 'ativa' as const,
        validatedAt: check.status === 'valida' ? new Date() : null,
        ...(input.modeloPadrao !== undefined
          ? { modeloPadrao: input.modeloPadrao }
          : {}),
      };
      await this.prisma.prototipoCredencial.upsert({
        where: { provider },
        update: dados,
        create: { provider, ...dados },
      });
      this.logger.log(`Chave operacional de ${provider} atualizada (••••${dados.keyLast4}).`);
    } else {
      if (!atual) {
        throw new BadRequestException('Informe a chave de API.');
      }
      await this.prisma.prototipoCredencial.update({
        where: { provider },
        data: { modeloPadrao: input.modeloPadrao ?? null },
      });
    }
    return { ...(await this.publica(provider)), aviso };
  }

  /** Confere a chave guardada no provedor (botão "Testar conexão"). */
  async testar(provider: string): Promise<ChaveOperacionalPublica> {
    if (!ehProvedorOperacional(provider)) {
      throw new BadRequestException('Provedor sem execução no protótipo.');
    }
    const r = await this.prisma.prototipoCredencial.findUnique({
      where: { provider },
    });
    const apiKey = r
      ? this.crypto.decrypt(r.apiKeyEncrypted)
      : this.config.get<string>(ENV_DO_PROVEDOR[provider]);
    if (!apiKey) throw new NotFoundException('Nenhuma chave configurada.');
    const check = await this.verificar(provider, apiKey);
    if (r) {
      await this.prisma.prototipoCredencial.update({
        where: { provider },
        data: {
          status: check.status === 'invalida' ? 'invalida' : 'ativa',
          validatedAt: check.status === 'valida' ? new Date() : null,
        },
      });
    }
    const aviso =
      check.status === 'invalida'
        ? `O provedor recusou a chave: ${check.detalhe}`
        : check.aviso;
    return { ...(await this.publica(provider)), aviso };
  }

  async remover(provider: string): Promise<ChaveOperacionalPublica> {
    if (!ehProvedorOperacional(provider)) {
      throw new BadRequestException('Provedor sem execução no protótipo.');
    }
    await this.prisma.prototipoCredencial.deleteMany({ where: { provider } });
    return this.publica(provider);
  }

  // ---------- Uso interno (execução) ----------

  /** Chave operacional de um provedor (Backoffice → env). */
  async chave(provider: ProvedorOperacional): Promise<ChaveOperacional | null> {
    const r = await this.prisma.prototipoCredencial.findUnique({
      where: { provider },
    });
    if (r && r.status !== 'invalida') {
      try {
        return {
          provider,
          apiKey: this.crypto.decrypt(r.apiKeyEncrypted),
          model: r.modeloPadrao ?? this.modeloPadraoDeAmbiente(provider) ?? '',
          fonte: 'backoffice',
        };
      } catch {
        this.logger.warn(`Chave operacional de ${provider} ilegível; usando o ambiente.`);
      }
    }
    const env = this.config.get<string>(ENV_DO_PROVEDOR[provider]);
    if (!env) return null;
    return {
      provider,
      apiKey: env,
      model: this.modeloPadraoDeAmbiente(provider) ?? '',
      fonte: 'ambiente',
    };
  }

  /** Candidatos de TEXTO em ordem (Anthropic, depois OpenAI). */
  async chavesTexto(): Promise<ChaveOperacional[]> {
    const out: ChaveOperacional[] = [];
    for (const p of ['anthropic', 'openai'] as const) {
      const c = await this.chave(p);
      if (c) out.push(c);
    }
    return out;
  }

  /** Marca como recusada quando o provedor rejeita a chave em uso. */
  async marcarInvalida(provider: string): Promise<void> {
    await this.prisma.prototipoCredencial
      .updateMany({ where: { provider }, data: { status: 'invalida' } })
      .catch(() => undefined);
  }

  private modeloPadraoDeAmbiente(provider: ProvedorOperacional): string | null {
    if (provider === 'anthropic') {
      return this.config.get<string>('AI_MODEL') || MODELO_PADRAO.anthropic;
    }
    if (provider === 'openai') return MODELO_PADRAO.openai;
    return null;
  }

  private async publica(
    provider: ProvedorOperacional,
  ): Promise<ChaveOperacionalPublica> {
    const [p] = (await this.listar()).filter((x) => x.provider === provider);
    return p;
  }

  private async verificar(
    provider: ProvedorOperacional,
    apiKey: string,
  ): Promise<
    | { status: 'valida'; aviso?: undefined }
    | { status: 'invalida'; detalhe: string; aviso?: undefined }
    | { status: 'indeterminada'; aviso: string }
  > {
    if (apiKey.length < 8) {
      throw new BadRequestException('A chave de API parece curta demais.');
    }
    if (!isLlmProvider(provider)) {
      return {
        status: 'indeterminada',
        aviso:
          'Validação automática ainda não está disponível para este provedor: a chave foi salva sem confirmação.',
      };
    }
    const check = await getProvider(provider as AiProvider).validateKey(apiKey);
    if (check.status === 'valida') return { status: 'valida' };
    if (check.status === 'invalida') {
      return { status: 'invalida', detalhe: check.detalhe };
    }
    return {
      status: 'indeterminada',
      aviso: `O provedor não confirmou a chave: ${check.detalhe}`,
    };
  }
}

/**
 * Chave de comportamento do PROTÓTIPO: as chaves que contas BYOK, B2B e
 * legadas cadastram em Configurações → IA & API são só demonstrativas — não
 * são validadas no provedor nem executam chamadas. Todo processamento real usa
 * a chave operacional do Backoffice. Para o comportamento de produto (chaves
 * da conta executando de verdade), troque para `false`.
 */
export const PROTOTIPO_CHAVES_DA_CONTA_DEMONSTRATIVAS = false;
