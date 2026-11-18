import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { PlanoIaB2c } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { CryptoService } from "./crypto";
import { COTA_POR_PLANO } from "./franquia.service";
import {
  isKnownModelFor,
  isKnownProvider,
  modelsOf,
  providerName,
  providerServes,
  type AiModality,
} from "./catalogo";

export const PLANOS_IA: PlanoIaB2c[] = ["essencial", "pro"];

export interface PlataformaCredencialPublica {
  id: string;
  provider: string;
  providerNome: string;
  /** Provedor fora do catálogo do sistema (cadastro livre, só demonstrativo). */
  demonstrativo: boolean;
  nome: string | null;
  keyLast4: string;
  status: "ativa" | "invalida";
  validatedAt: Date | null;
  ativa: boolean;
  modelCount: number;
  aviso?: string;
}

export interface PlataformaModeloPublico {
  id: string;
  credencialId: string;
  kind: AiModality;
  provider: string;
  providerNome: string;
  model: string;
  rotulo: string;
  ativo: boolean;
  ordem: number;
  /** A credencial do catálogo que atende o modelo está ativa. */
  credencialOk: boolean;
  /** Fora do catálogo do sistema: demonstrativo, sem integração de execução. */
  demonstrativo: boolean;
  /** Ativo + credencial ativa + habilitado em ao menos um plano. */
  publicado: boolean;
  planos: { plano: PlanoIaB2c; limiteTokensCiclo: number | null }[];
}

/**
 * Modelos BeCulture (Backoffice): catálogo ADMINISTRATIVO DEMONSTRATIVO de
 * provedores, credenciais e modelos publicados nos planos B2C. Não tem
 * empresaId. As credenciais daqui ficam cifradas e podem ser validadas, mas
 * NÃO executam chamadas — a execução do protótipo é da chave operacional
 * (`PrototipoIaService`). O catálogo publicado define o que as contas B2C
 * BeCulture enxergam e pedem.
 */
@Injectable()
export class PlataformaIaService {
  private readonly logger = new Logger(PlataformaIaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  // ---------- Credenciais ----------

  async listarCredenciais(): Promise<PlataformaCredencialPublica[]> {
    const rows = await this.prisma.plataformaCredencial.findMany({
      orderBy: { criadoEm: "asc" },
      include: { _count: { select: { modelos: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      provider: c.provider,
      providerNome: c.nomeProvedor || providerName(c.provider),
      demonstrativo: !isKnownProvider(c.provider),
      nome: c.nome,
      keyLast4: c.keyLast4,
      status: c.status,
      validatedAt: c.validatedAt,
      ativa: c.ativa,
      modelCount: c._count.modelos,
    }));
  }

  /**
   * Provedor do catálogo (`provider` = id conhecido) ou livre (`nomeProvedor`
   * digitado; o slug é derivado do nome). Livre = demonstrativo.
   */
  async criarCredencial(input: {
    provider?: string;
    nomeProvedor?: string;
    apiKey: string;
    nome?: string;
  }): Promise<PlataformaCredencialPublica> {
    const nomeLivre = input.nomeProvedor?.trim() || null;
    const provider = (input.provider?.trim() || slug(nomeLivre ?? "")).slice(
      0,
      60,
    );
    if (!provider) {
      throw new BadRequestException("Escolha um provedor ou informe o nome.");
    }
    const apiKey = input.apiKey.trim();
    const { validatedAt, aviso } = await this.validar(provider, apiKey);
    const c = await this.prisma.plataformaCredencial.create({
      data: {
        provider,
        nomeProvedor: isKnownProvider(provider)
          ? null
          : (nomeLivre ?? provider),
        nome: input.nome?.trim() || null,
        apiKeyEncrypted: this.crypto.encrypt(apiKey),
        keyLast4: apiKey.slice(-4),
        status: "ativa",
        validatedAt,
      },
    });
    const [pub] = (await this.listarCredenciais()).filter((x) => x.id === c.id);
    return { ...pub, aviso };
  }

  async atualizarCredencial(
    id: string,
    input: {
      nome?: string;
      nomeProvedor?: string;
      apiKey?: string;
      ativa?: boolean;
    },
  ): Promise<PlataformaCredencialPublica> {
    const atual = await this.prisma.plataformaCredencial.findUnique({
      where: { id },
    });
    if (!atual) throw new NotFoundException("Credencial não encontrada.");
    const data: Record<string, unknown> = {};
    let aviso: string | undefined;
    if (input.nome !== undefined) data.nome = input.nome.trim() || null;
    if (input.ativa !== undefined) data.ativa = input.ativa;
    if (input.nomeProvedor !== undefined && !isKnownProvider(atual.provider)) {
      data.nomeProvedor = input.nomeProvedor.trim() || atual.provider;
    }
    if (input.apiKey) {
      const apiKey = input.apiKey.trim();
      const r = await this.validar(atual.provider, apiKey);
      aviso = r.aviso;
      Object.assign(data, {
        apiKeyEncrypted: this.crypto.encrypt(apiKey),
        keyLast4: apiKey.slice(-4),
        status: "ativa",
        validatedAt: r.validatedAt,
      });
    }
    await this.prisma.plataformaCredencial.update({ where: { id }, data });
    const [pub] = (await this.listarCredenciais()).filter((x) => x.id === id);
    return { ...pub, aviso };
  }

  /** Revalida a chave guardada junto ao provedor. */
  async revalidarCredencial(id: string): Promise<PlataformaCredencialPublica> {
    const atual = await this.prisma.plataformaCredencial.findUnique({
      where: { id },
    });
    if (!atual) throw new NotFoundException("Credencial não encontrada.");
    // Exemplo demonstrativo: sem chamada ao provedor (ver `validar`).
    const status = "ativa" as const;
    const validatedAt: Date | null = null;
    const aviso =
      "Chave de exemplo: no protótipo os modelos BeCulture não executam chamadas, então ela não é validada no provedor.";
    await this.prisma.plataformaCredencial.update({
      where: { id },
      data: { status, validatedAt },
    });
    const [pub] = (await this.listarCredenciais()).filter((x) => x.id === id);
    return { ...pub, aviso };
  }

  async removerCredencial(id: string): Promise<void> {
    const { count } = await this.prisma.plataformaCredencial.deleteMany({
      where: { id },
    });
    if (!count) throw new NotFoundException("Credencial não encontrada.");
  }

  async marcarInvalida(credencialId: string): Promise<void> {
    await this.prisma.plataformaCredencial
      .update({ where: { id: credencialId }, data: { status: "invalida" } })
      .catch(() => undefined);
  }

  // ---------- Modelos ----------

  async listarModelos(): Promise<PlataformaModeloPublico[]> {
    const rows = await this.prisma.plataformaModelo.findMany({
      orderBy: [{ kind: "asc" }, { ordem: "asc" }, { criadoEm: "asc" }],
      include: { credencial: true, planos: true },
    });
    return rows.map((m) => {
      const planos = PLANOS_IA.map((plano) => {
        const p = m.planos.find((x) => x.plano === plano);
        return p ? { plano, limiteTokensCiclo: p.limiteTokensCiclo } : null;
      }).filter((x): x is NonNullable<typeof x> => !!x);
      // Credenciais são demonstrativas: a validação no provedor NÃO bloqueia a
      // publicação; só a desativação manual da credencial bloqueia.
      const credencialOk = m.credencial.ativa;
      return {
        id: m.id,
        credencialId: m.credencialId,
        kind: m.kind as AiModality,
        provider: m.provider,
        providerNome: m.credencial.nomeProvedor || providerName(m.provider),
        model: m.model,
        rotulo:
          m.rotulo ||
          rotuloDoCatalogo(m.provider, m.kind as AiModality, m.model),
        ativo: m.ativo,
        ordem: m.ordem,
        credencialOk,
        demonstrativo: !isKnownModelFor(
          m.provider,
          m.kind as AiModality,
          m.model,
        ),
        publicado: m.ativo && credencialOk && planos.length > 0,
        planos,
      };
    });
  }

  async criarModelo(input: {
    credencialId: string;
    kind: AiModality;
    model: string;
    rotulo?: string;
    planos?: PlanoIaB2c[];
  }): Promise<PlataformaModeloPublico> {
    const cred = await this.prisma.plataformaCredencial.findUnique({
      where: { id: input.credencialId },
    });
    if (!cred) throw new BadRequestException("Credencial não encontrada.");
    // Provedor do catálogo: a modalidade precisa ser atendida por ele. Modelo
    // fora do catálogo é aceito como DEMONSTRATIVO (marcado na listagem).
    if (
      isKnownProvider(cred.provider) &&
      !providerServes(cred.provider, input.kind)
    ) {
      throw new BadRequestException(
        "Este provedor não oferece modelos para esta modalidade.",
      );
    }
    input.model = input.model.trim();
    if (!input.model) {
      throw new BadRequestException(
        "Informe a identificação técnica do modelo.",
      );
    }
    const maior = await this.prisma.plataformaModelo.aggregate({
      where: { kind: input.kind },
      _max: { ordem: true },
    });
    const m = await this.prisma.plataformaModelo.upsert({
      where: {
        credencialId_kind_model: {
          credencialId: cred.id,
          kind: input.kind,
          model: input.model,
        },
      },
      update: {},
      create: {
        credencialId: cred.id,
        kind: input.kind,
        provider: cred.provider,
        model: input.model,
        rotulo: input.rotulo?.trim() || null,
        ordem: (maior._max.ordem ?? -1) + 1,
        planos: {
          create: (input.planos ?? []).map((plano) => ({ plano })),
        },
      },
    });
    const [pub] = (await this.listarModelos()).filter((x) => x.id === m.id);
    return pub;
  }

  async atualizarModelo(
    id: string,
    input: {
      ativo?: boolean;
      rotulo?: string;
      ordem?: number;
      model?: string;
      kind?: AiModality;
    },
  ): Promise<PlataformaModeloPublico> {
    const data: Record<string, unknown> = {};
    if (input.model !== undefined) {
      const model = input.model.trim();
      if (!model) {
        throw new BadRequestException(
          "Informe a identificação técnica do modelo.",
        );
      }
      data.model = model;
    }
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.ativo !== undefined) data.ativo = input.ativo;
    if (input.rotulo !== undefined) data.rotulo = input.rotulo.trim() || null;
    if (input.ordem !== undefined) data.ordem = input.ordem;
    await this.prisma.plataformaModelo
      .update({ where: { id }, data })
      .catch(() => {
        throw new NotFoundException("Modelo não encontrado.");
      });
    const [pub] = (await this.listarModelos()).filter((x) => x.id === id);
    return pub;
  }

  async removerModelo(id: string): Promise<void> {
    await this.prisma.plataformaModelo.deleteMany({ where: { id } });
  }

  /** Liga/desliga um modelo num plano e define o limite individual. */
  async definirPlano(
    modeloId: string,
    plano: PlanoIaB2c,
    input: { habilitado: boolean; limiteTokensCiclo?: number | null },
  ): Promise<PlataformaModeloPublico> {
    if (!input.habilitado) {
      await this.prisma.plataformaModeloPlano.deleteMany({
        where: { modeloId, plano },
      });
    } else {
      await this.prisma.plataformaModeloPlano.upsert({
        where: { modeloId_plano: { modeloId, plano } },
        update: { limiteTokensCiclo: input.limiteTokensCiclo ?? null },
        create: {
          modeloId,
          plano,
          limiteTokensCiclo: input.limiteTokensCiclo ?? null,
        },
      });
    }
    const [pub] = (await this.listarModelos()).filter((x) => x.id === modeloId);
    if (!pub) throw new NotFoundException("Modelo não encontrado.");
    return pub;
  }

  // ---------- Planos (franquia) ----------

  /** Cota fixa de cada plano (só leitura — ver `COTA_POR_PLANO`). */
  listarPlanos() {
    return PLANOS_IA.map((plano) => ({
      plano,
      franquiaGlobalTokens: COTA_POR_PLANO[plano],
    }));
  }

  // ---------- Leitura para as contas B2C BeCulture ----------

  /**
   * Modelos utilizáveis num plano: modelo ativo + habilitado no plano +
   * credencial ativa e não recusada. É exatamente o que o usuário vê e usa.
   */
  async disponiveisNoPlano(
    plano: PlanoIaB2c,
    kind?: AiModality,
  ): Promise<PlataformaModeloPublico[]> {
    const todos = await this.listarModelos();
    return todos.filter(
      (m) =>
        m.ativo &&
        m.credencialOk &&
        (!kind || m.kind === kind) &&
        m.planos.some((p) => p.plano === plano),
    );
  }

  /** Checklist de prontidão da plataforma (Backoffice). */
  async status() {
    const [creds, modelos] = await Promise.all([
      this.listarCredenciais(),
      this.listarModelos(),
    ]);
    const credsOk = creds.filter((c) => c.ativa);
    const modelosOk = modelos.filter((m) => m.ativo && m.credencialOk);
    const porPlano = PLANOS_IA.map((plano) => ({
      plano,
      modelosTexto: modelosOk.filter(
        (m) => m.kind === "text" && m.planos.some((p) => p.plano === plano),
      ).length,
      modelos: modelosOk.filter((m) => m.planos.some((p) => p.plano === plano))
        .length,
    }));
    return {
      etapas: {
        provedor: creds.length > 0,
        credencialValida: credsOk.length > 0,
        modelo: modelosOk.length > 0,
        plano: porPlano.some((p) => p.modelos > 0),
      },
      porPlano,
      totais: {
        credenciais: creds.length,
        credenciaisValidas: credsOk.length,
        modelos: modelos.length,
        modelosAtivos: modelosOk.length,
      },
    };
  }

  private async validar(
    provider: string,
    apiKey: string,
  ): Promise<{ validatedAt: Date | null; aviso?: string }> {
    if (!apiKey || apiKey.length < 8) {
      throw new BadRequestException("A chave de API parece curta demais.");
    }
    // Chaves de Modelos BeCulture são EXEMPLOS no protótipo: não executam
    // chamadas (quem responde é a chave do usuário em IA & API), então não
    // são enviadas ao provedor para validação.
    void provider;
    return { validatedAt: null };
  }
}

function rotuloDoCatalogo(
  provider: string,
  kind: AiModality,
  model: string,
): string {
  return modelsOf(provider, kind).find((m) => m.id === model)?.name ?? model;
}

/** Slug simples para provedores digitados livremente. */
function slug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
