import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ModalidadeComercial,
  OrigemCredencial,
  PlanoIaB2c,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Modalidade de IA efetiva da conta.
 *   beculture   = B2C (unificado): cota de modelos BeCulture conforme o plano
 *                 + chaves próprias (BYOK) opcionais em IA & API. Contas
 *                 gravadas como `byok` (o antigo "B2C BYOK") também caem aqui.
 *   organizacao = B2B, chaves da organização
 *   legado      = conta criada antes da seleção de planos: mantém o
 *                 comportamento anterior (fila BYOK + IA gerenciada no trial)
 * `byok` continua no tipo só por compatibilidade com dados antigos.
 */
export type ModalidadeEfetiva = 'beculture' | 'byok' | 'organizacao' | 'legado';

export interface ContextoIa {
  empresaId: string;
  modalidade: ModalidadeEfetiva;
  modalidadeComercial: ModalidadeComercial | null;
  planoIa: PlanoIaB2c | null;
  onboardingEtapas: Record<string, string>;
  onboardingConcluidoEm: Date | null;
}

/**
 * Fonte única de "qual contexto de IA esta conta tem". Todas as regras que
 * dependem da modalidade (quem pode gerenciar chaves, de onde vêm os modelos,
 * se há fallback gerenciado) consultam este serviço — nunca a interface.
 */
@Injectable()
export class ModalidadeService {
  constructor(private readonly prisma: PrismaService) {}

  async contexto(empresaId: string): Promise<ContextoIa> {
    const e = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        modalidadeComercial: true,
        modalidadeIa: true,
        planoIa: true,
        onboardingEtapas: true,
        onboardingConcluidoEm: true,
      },
    });
    if (!e) throw new NotFoundException('Conta não encontrada.');
    // B2C unificado: o antigo "B2C BYOK" vira B2C (sem migrar dados).
    const b2c = e.modalidadeIa === 'beculture' || e.modalidadeIa === 'byok';
    return {
      empresaId,
      modalidade: b2c ? 'beculture' : (e.modalidadeIa ?? 'legado'),
      modalidadeComercial: e.modalidadeComercial,
      planoIa: b2c ? (e.planoIa ?? 'essencial') : null,
      onboardingEtapas: (e.onboardingEtapas ?? {}) as Record<string, string>,
      onboardingConcluidoEm: e.onboardingConcluidoEm,
    };
  }

  /** Dono das credenciais próprias da conta (para rótulo e registro de uso). */
  origemPropria(modalidade: ModalidadeEfetiva): OrigemCredencial {
    return modalidade === 'beculture' || modalidade === 'byok'
      ? 'usuario'
      : 'organizacao';
  }

  /**
   * Ponto único para regras de quem pode gerenciar chaves próprias por
   * modalidade. Hoje todas as modalidades podem (o B2C usa BYOK como
   * complemento da cota BeCulture); a permissão de role continua no guard.
   */
  async assertPodeGerenciarChaves(empresaId: string): Promise<void> {
    await this.contexto(empresaId);
  }

  async marcarEtapa(empresaId: string, etapa: string): Promise<ContextoIa> {
    const atual = await this.contexto(empresaId);
    await this.prisma.empresa.update({
      where: { id: empresaId },
      data: {
        onboardingEtapas: {
          ...atual.onboardingEtapas,
          [etapa]: new Date().toISOString(),
        },
      },
    });
    return this.contexto(empresaId);
  }

}
