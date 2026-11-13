import { BadRequestException, Injectable } from '@nestjs/common';
import type { PlanoIaB2c } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { RolesService } from '@/acesso/roles.service';
import { ModalidadeService, type ModalidadeEfetiva } from './modalidade.service';
import { PlataformaIaService } from './plataforma.service';
import { FranquiaService } from './franquia.service';
import { AiCredentialsService } from './credentials.service';

/**
 * Estados de prontidão da IA de uma conta. Cada um tem uma tela própria na
 * interface (o que acontece / o que configurar / ação / o que vem depois).
 */
export type ProntidaoIa =
  | 'pronta'
  /** B2C: a plataforma não disponibilizou modelos BeCulture. */
  | 'sem_modelos_plataforma'
  /** B2B: nenhuma chave cadastrada. */
  | 'sem_chave'
  /** BYOK/B2B: há chaves, mas todas foram recusadas pelo provedor. */
  | 'chave_invalida'
  /** BYOK/B2B: há chaves, mas todas estão desativadas. */
  | 'chaves_desativadas'
  /** BYOK/B2B: chave conectada, mas nenhum modelo habilitado nas filas. */
  | 'sem_modelos_habilitados';

/**
 * Regras de migração (aplicadas no backend). B2C é unificado: a única troca é
 * de plano (Essencial ↔ Pro), feita dentro da própria modalidade.
 */
const MIGRACOES_PERMITIDAS: Record<ModalidadeEfetiva, ModalidadeEfetiva[]> = {
  beculture: [],
  byok: [],
  organizacao: [],
  legado: ['beculture', 'organizacao'],
};

@Injectable()
export class ContaIaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
    private readonly modalidade: ModalidadeService,
    private readonly plataforma: PlataformaIaService,
    private readonly franquia: FranquiaService,
    private readonly credentials: AiCredentialsService,
  ) {}

  async resumo(empresaId: string, usuarioId: string) {
    const ctx = await this.modalidade.contexto(empresaId);
    const [creds, filaTexto, filaMidia, podeAdministrar] = await Promise.all([
      this.credentials.listPublic(empresaId),
      this.prisma.aiConnection.count({
        where: {
          empresaId,
          credential: { ativa: true, status: { not: 'invalida' } },
        },
      }),
      this.prisma.aiMediaConnection.count({
        where: {
          empresaId,
          credential: { ativa: true, status: { not: 'invalida' } },
        },
      }),
      this.podeAdministrarIa(empresaId, usuarioId),
    ]);

    let prontidao: ProntidaoIa = 'pronta';
    let modelosPlataforma: Awaited<
      ReturnType<PlataformaIaService['disponiveisNoPlano']>
    > = [];
    let consumo: Awaited<ReturnType<FranquiaService['consumo']>> | null = null;

    let cota: Awaited<ReturnType<FranquiaService['estado']>> | null = null;
    let byokAposCota: Awaited<ReturnType<FranquiaService['byokAutorizado']>> | null =
      null;

    if (ctx.modalidade === 'beculture') {
      const plano = ctx.planoIa as PlanoIaB2c;
      [modelosPlataforma, consumo, cota, byokAposCota] = await Promise.all([
        this.plataforma.disponiveisNoPlano(plano),
        this.franquia.consumo(usuarioId, plano),
        this.franquia.estado(usuarioId, plano),
        this.franquia.byokAutorizado(usuarioId),
      ]);
      if (!modelosPlataforma.some((m) => m.kind === 'text')) {
        prontidao = 'sem_modelos_plataforma';
      }
    } else {
      const utilizaveis = creds.filter(
        (c) => c.ativa && c.status !== 'invalida',
      );
      if (creds.length === 0) prontidao = 'sem_chave';
      else if (utilizaveis.length === 0) {
        prontidao = creds.some((c) => c.status === 'invalida')
          ? 'chave_invalida'
          : 'chaves_desativadas';
      } else if (filaTexto + filaMidia === 0) {
        prontidao = 'sem_modelos_habilitados';
      }
      if (ctx.modalidade === 'legado' && prontidao !== 'pronta') {
        // Conta legada não tem exigência de chave própria (trial gerenciado).
        prontidao = 'pronta';
      }
    }

    // Quem executa as chamadas de texto agora. No protótipo, o B2C também
    // responde pelas chaves próprias de IA & API (modelos BeCulture são
    // demonstrativos), então sem fila própria não há resposta real.
    const execucao: 'propria' | 'indisponivel' =
      filaTexto > 0 ? 'propria' : 'indisponivel';
    const temChavePropria = filaTexto > 0;

    return {
      modalidade: ctx.modalidade,
      modalidadeComercial: ctx.modalidadeComercial,
      planoIa: ctx.planoIa,
      // Dono das chaves cadastradas em IA & API (B2C: o usuário).
      origemCredenciais: this.modalidade.origemPropria(ctx.modalidade),
      prontidao,
      execucao,
      onboarding: {
        etapas: ctx.onboardingEtapas,
        concluidoEm: ctx.onboardingConcluidoEm,
      },
      podeGerenciarChaves: podeAdministrar,
      podeAdministrarIa: podeAdministrar,
      chavesProprias: {
        total: creds.length,
        utilizaveis: creds.filter((c) => c.ativa && c.status !== 'invalida')
          .length,
        /** Mantido por compatibilidade: no B2C unificado nada fica congelado. */
        congeladas: false,
      },
      temChavePropria,
      /** B2C: cota BeCulture do plano no ciclo (tokens). */
      cota,
      /** B2C: autorização para usar as chaves próprias após a cota. */
      byokAposCota,
      modelosPlataforma: modelosPlataforma.map((m) => ({
        id: m.id,
        credencialId: m.credencialId,
        kind: m.kind,
        provider: m.provider,
        providerNome: m.providerNome,
        model: m.model,
        rotulo: m.rotulo,
        limiteTokensCiclo:
          m.planos.find((p) => p.plano === ctx.planoIa)?.limiteTokensCiclo ??
          null,
      })),
      consumo,
    };
  }

  async concluirOnboarding(empresaId: string, usuarioId: string) {
    const r = await this.resumo(empresaId, usuarioId);
    const exigeConfiguracao = r.modalidade === 'organizacao';
    if (exigeConfiguracao && r.prontidao !== 'pronta') {
      throw new BadRequestException({
        statusCode: 400,
        codigo: r.prontidao,
        message:
          'Conecte ao menos uma chave válida e habilite um modelo antes de concluir.',
      });
    }
    await this.modalidade.marcarEtapa(empresaId, 'concluido');
    await this.prisma.empresa.update({
      where: { id: empresaId },
      data: { onboardingConcluidoEm: new Date() },
    });
    return this.resumo(empresaId, usuarioId);
  }


  /**
   * Migração (Backoffice do protótipo → Conta em demonstração).
   *  - B2C: troca de plano Essencial ↔ Pro (simula o upgrade). Chaves próprias
   *    e a autorização de uso após a cota são preservadas.
   *  - B2C ↔ B2B: não permitido (contextos comerciais distintos).
   *  - Legado → B2C ou B2B (para demonstrar contas antigas).
   */
  async migrar(
    empresaId: string,
    usuarioId: string,
    destino: { modalidadeIa: 'beculture' | 'organizacao'; planoIa?: PlanoIaB2c },
    reiniciarOnboarding = false,
  ) {
    const ctx = await this.modalidade.contexto(empresaId);
    if (
      ctx.modalidade !== destino.modalidadeIa &&
      !MIGRACOES_PERMITIDAS[ctx.modalidade].includes(destino.modalidadeIa)
    ) {
      throw new BadRequestException(
        ctx.modalidade === 'organizacao' || destino.modalidadeIa === 'organizacao'
          ? 'B2C e B2B são contextos comerciais diferentes: não há migração direta entre eles. Crie uma nova conta para o outro contexto.'
          : 'Migração não permitida.',
      );
    }
    const b2b = destino.modalidadeIa === 'organizacao';
    const etapas = reiniciarOnboarding
      ? {
          conta: ctx.onboardingEtapas.conta ?? new Date().toISOString(),
          plano: new Date().toISOString(),
        }
      : ctx.onboardingEtapas;
    await this.prisma.empresa.update({
      where: { id: empresaId },
      data: {
        modalidadeComercial: b2b ? 'b2b' : 'b2c',
        modalidadeIa: destino.modalidadeIa,
        planoIa:
          destino.modalidadeIa === 'beculture'
            ? (destino.planoIa ?? ctx.planoIa ?? 'essencial')
            : null,
        onboardingEtapas: etapas,
        ...(reiniciarOnboarding ? { onboardingConcluidoEm: null } : {}),
      },
    });
    return this.resumo(empresaId, usuarioId);
  }

  /** Mesmo critério do PermissoesGuard para `configuracoes.gerenciar`. */
  private async podeAdministrarIa(
    empresaId: string,
    usuarioId: string,
  ): Promise<boolean> {
    const [usuario, ctx] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { role: true },
      }),
      this.roles.contextoDeAutorizacao(empresaId, usuarioId),
    ]);
    if (!ctx.convidado && (usuario?.role === 'owner' || usuario?.role === 'admin')) {
      return true;
    }
    return ctx.permissoes.includes('configuracoes.gerenciar');
  }
}
