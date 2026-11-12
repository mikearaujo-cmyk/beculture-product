import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ModalidadeComercial,
  OrigemCredencial,
  PlanoIaB2c,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Modalidade de IA efetiva da conta.
 *   beculture   = B2C com modelos BeCulture (credenciais da plataforma)
 *   byok        = B2C com chaves do próprio usuário
 *   organizacao = B2B, chaves da organização
 *   legado      = conta criada antes da seleção de planos: mantém o
 *                 comportamento anterior (fila BYOK + IA gerenciada no trial)
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
    return {
      empresaId,
      modalidade: e.modalidadeIa ?? 'legado',
      modalidadeComercial: e.modalidadeComercial,
      planoIa: e.modalidadeIa === 'beculture' ? (e.planoIa ?? 'essencial') : null,
      onboardingEtapas: (e.onboardingEtapas ?? {}) as Record<string, string>,
      onboardingConcluidoEm: e.onboardingConcluidoEm,
    };
  }

  /** Dono das credenciais próprias da conta (para rótulo e registro de uso). */
  origemPropria(modalidade: ModalidadeEfetiva): OrigemCredencial {
    return modalidade === 'byok' ? 'usuario' : 'organizacao';
  }

  /**
   * Bloqueia a gestão de chaves/filas próprias quando a conta usa modelos
   * BeCulture. As credenciais já cadastradas continuam guardadas (migração
   * BYOK → BeCulture preserva), só não podem ser alteradas nem usadas.
   */
  async assertPodeGerenciarChaves(empresaId: string): Promise<void> {
    const { modalidade } = await this.contexto(empresaId);
    if (modalidade === 'beculture') {
      throw new ForbiddenException(
        'Seu plano usa modelos gerenciados pela BeCulture: não é possível cadastrar ou alterar chaves próprias. Para usar suas chaves, migre para um plano BYOK.',
      );
    }
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
