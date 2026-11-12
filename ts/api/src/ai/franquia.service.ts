import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { PlanoIaB2c } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Ciclo de apuração da franquia. REGRA PROVISÓRIA: mês calendário. A política
 * definitiva (renovação, global vs. híbrida, excedentes) ainda não foi decidida
 * — quando for, a mudança fica concentrada aqui.
 */
export function inicioDoCiclo(agora = new Date()): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

export interface ConsumoPlano {
  ciclo: { inicio: Date; regra: 'mes_calendario_provisorio' };
  total: number;
  franquiaGlobalTokens: number | null;
  porModelo: { model: string; total: number }[];
}

/**
 * Franquia e limites — SÓ para B2C com modelos BeCulture (origem = plataforma).
 * BYOK e B2B nunca passam por aqui: o consumo deles é registrado apenas para
 * transparência e não gera cobrança nem bloqueio da BeCulture. Também não se
 * mistura com a licença SaaS B2B.
 */
@Injectable()
export class FranquiaService {
  constructor(private readonly prisma: PrismaService) {}

  async consumo(usuarioId: string, plano: PlanoIaB2c): Promise<ConsumoPlano> {
    const inicio = inicioDoCiclo();
    const [porModelo, cfg] = await Promise.all([
      this.prisma.aiUsage.groupBy({
        by: ['model'],
        where: { usuarioId, origem: 'plataforma', criadoEm: { gte: inicio } },
        _sum: { entrada: true, saida: true },
      }),
      this.prisma.plataformaPlanoIa.findUnique({ where: { plano } }),
    ]);
    const linhas = porModelo.map((r) => ({
      model: r.model ?? '(desconhecido)',
      total: (r._sum.entrada ?? 0) + (r._sum.saida ?? 0),
    }));
    return {
      ciclo: { inicio, regra: 'mes_calendario_provisorio' },
      total: linhas.reduce((s, l) => s + l.total, 0),
      franquiaGlobalTokens: cfg?.franquiaGlobalTokens ?? null,
      porModelo: linhas,
    };
  }

  /**
   * Filtra os candidatos que ainda têm saldo. Estourou a franquia global ou
   * todos os limites individuais → 429 com mensagem clara (sem fallback para
   * chaves próprias).
   */
  async filtrarComSaldo<T extends { model: string; limiteTokensCiclo: number | null }>(
    usuarioId: string,
    plano: PlanoIaB2c,
    candidatos: T[],
  ): Promise<T[]> {
    const c = await this.consumo(usuarioId, plano);
    if (c.franquiaGlobalTokens !== null && c.total >= c.franquiaGlobalTokens) {
      throw new HttpException(
        {
          statusCode: 429,
          codigo: 'franquia_esgotada',
          message:
            'A franquia de IA do seu plano foi atingida neste ciclo. O uso volta a ser liberado na renovação do ciclo.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const usado = (model: string) =>
      c.porModelo.find((p) => p.model === model)?.total ?? 0;
    const comSaldo = candidatos.filter(
      (k) => k.limiteTokensCiclo === null || usado(k.model) < k.limiteTokensCiclo,
    );
    if (candidatos.length > 0 && comSaldo.length === 0) {
      throw new HttpException(
        {
          statusCode: 429,
          codigo: 'limite_modelo_atingido',
          message:
            'Você atingiu o limite de uso dos modelos disponíveis no seu plano neste ciclo.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return comSaldo;
  }
}
