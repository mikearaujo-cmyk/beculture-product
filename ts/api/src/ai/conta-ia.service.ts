import { BadRequestException, Injectable } from '@nestjs/common';
import type { PlanoIaB2c } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { RolesService } from '@/acesso/roles.service';
import { ModalidadeService, type ModalidadeEfetiva } from './modalidade.service';
import { PlataformaIaService } from './plataforma.service';
import { FranquiaService } from './franquia.service';
import { AiCredentialsService } from './credentials.service';
import {
  PROTOTIPO_CHAVES_DA_CONTA_DEMONSTRATIVAS,
  PrototipoIaService,
} from './prototipo.service';

/**
 * Estados de prontidão da IA de uma conta. Cada um tem uma tela própria na
 * interface (o que acontece / o que configurar / ação / o que vem depois).
 */
export type ProntidaoIa =
  | 'pronta'
  /** B2C BeCulture: a plataforma não disponibilizou modelos para o plano. */
  | 'sem_modelos_plataforma'
  /** BYOK/B2B: nenhuma chave cadastrada. */
  | 'sem_chave'
  /** BYOK/B2B: há chaves, mas todas foram recusadas pelo provedor. */
  | 'chave_invalida'
  /** BYOK/B2B: há chaves, mas todas estão desativadas. */
  | 'chaves_desativadas'
  /** BYOK/B2B: chave conectada, mas nenhum modelo habilitado nas filas. */
  | 'sem_modelos_habilitados';

/** Regras de migração entre modalidades B2C (aplicadas no backend). */
const MIGRACOES_PERMITIDAS: Record<ModalidadeEfetiva, ModalidadeEfetiva[]> = {
  beculture: ['byok'],
  byok: ['beculture'],
  organizacao: [],
  legado: ['beculture', 'byok', 'organizacao'],
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
    private readonly prototipo: PrototipoIaService,
  ) {}

  async resumo(empresaId: string, usuarioId: string) {
    const ctx = await this.modalidade.contexto(empresaId);
    const temChaveOperacional =
      (await this.prototipo.chavesTexto()).length > 0;
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

    if (ctx.modalidade === 'beculture') {
      const plano = ctx.planoIa as PlanoIaB2c;
      modelosPlataforma = await this.plataforma.disponiveisNoPlano(plano);
      consumo = await this.franquia.consumo(usuarioId, plano);
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
      if (
        ctx.modalidade === 'legado' &&
        prontidao !== 'pronta' &&
        temChaveOperacional
      ) {
        // Conta legada não tem exigência de chave própria: roda pela chave
        // operacional do protótipo.
        prontidao = 'pronta';
      }
    }

    // Quem executa as chamadas de texto agora. BYOK/B2B sem chave própria
    // utilizável caem na chave operacional SÓ no protótipo — a prontidão da
    // conta continua refletindo a regra do produto ("sem chave").
    // No protótipo as chaves da conta são demonstrativas: quem executa é
    // sempre a chave operacional do Backoffice.
    const execucao: 'propria' | 'prototipo' | 'indisponivel' =
      !PROTOTIPO_CHAVES_DA_CONTA_DEMONSTRATIVAS &&
      ctx.modalidade !== 'beculture' &&
      filaTexto > 0
        ? 'propria'
        : temChaveOperacional
          ? 'prototipo'
          : 'indisponivel';

    return {
      modalidade: ctx.modalidade,
      modalidadeComercial: ctx.modalidadeComercial,
      planoIa: ctx.planoIa,
      origemCredenciais:
        ctx.modalidade === 'beculture'
          ? 'plataforma'
          : this.modalidade.origemPropria(ctx.modalidade),
      prontidao,
      execucao,
      onboarding: {
        etapas: ctx.onboardingEtapas,
        concluidoEm: ctx.onboardingConcluidoEm,
      },
      podeGerenciarChaves: ctx.modalidade !== 'beculture' && podeAdministrar,
      podeAdministrarIa: podeAdministrar,
      chavesProprias: {
        total: creds.length,
        utilizaveis: creds.filter((c) => c.ativa && c.status !== 'invalida')
          .length,
        /** Guardadas, mas sem uso enquanto o plano for BeCulture. */
        congeladas: ctx.modalidade === 'beculture' && creds.length > 0,
      },
      /**
       * Chaves de Backoffice → Modelos BeCulture disponíveis para o usuário
       * (ativas e com ao menos um modelo publicado no plano). O valor da chave
       * nunca sai: o usuário vê o provedor, o nome da conexão e os modelos.
       */
      chavesPlataforma:
        ctx.modalidade === 'beculture'
          ? (await this.plataforma.listarCredenciais())
              .filter((c) => c.ativa)
              .map((c) => ({
                id: c.id,
                provider: c.provider,
                providerNome: c.providerNome,
                nome: c.nome,
                modelos: modelosPlataforma.filter((m) => m.credencialId === c.id)
                  .length,
                kinds: [
                  ...new Set(
                    modelosPlataforma
                      .filter((m) => m.credencialId === c.id)
                      .map((m) => m.kind),
                  ),
                ],
              }))
              .filter((c) => c.modelos > 0)
          : [],
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
    const exigeConfiguracao =
      r.modalidade === 'byok' || r.modalidade === 'organizacao';
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
   * Migração de modalidade (Backoffice do protótipo).
   *  - BeCulture ↔ BYOK: permitido; credenciais próprias são PRESERVADAS. Em
   *    BeCulture ficam congeladas (sem uso nem edição); ao voltar para BYOK
   *    voltam a valer. Nunca há fallback entre os dois contextos.
   *  - B2C ↔ B2B: não permitido (contextos comerciais distintos).
   *  - Legado → qualquer uma (para demonstrar contas antigas).
   */
  async migrar(
    empresaId: string,
    usuarioId: string,
    destino: { modalidadeIa: 'beculture' | 'byok' | 'organizacao'; planoIa?: PlanoIaB2c },
    reiniciarOnboarding = false,
  ) {
    const ctx = await this.modalidade.contexto(empresaId);
    const mesma =
      ctx.modalidade === destino.modalidadeIa &&
      (destino.modalidadeIa !== 'beculture' ||
        (destino.planoIa ?? ctx.planoIa) === ctx.planoIa);
    if (
      !mesma &&
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
