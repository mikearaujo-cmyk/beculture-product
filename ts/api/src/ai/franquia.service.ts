import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { PlanoIaB2c } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Ciclo de apuração da cota. REGRA PROVISÓRIA: mês calendário. A política
 * definitiva (renovação, excedentes) ainda não foi decidida — quando for, a
 * mudança fica concentrada aqui.
 */
export function inicioDoCiclo(agora = new Date()): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

/** Quando a cota volta a ser liberada (início do próximo ciclo). */
export function renovacaoDoCiclo(agora = new Date()): Date {
  return new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
}

export interface ConsumoPlano {
  ciclo: { inicio: Date; renovaEm: Date; regra: 'mes_calendario_provisorio' };
  total: number;
  /** Cota do plano em tokens por ciclo. Null = sem limite definido. */
  franquiaGlobalTokens: number | null;
  porModelo: { model: string; total: number }[];
}

export interface EstadoCota {
  total: number;
  limite: number | null;
  esgotada: boolean;
  renovaEm: Date;
}

/**
 * Cota BeCulture do B2C — consumo com origem = plataforma (modelos BeCulture
 * pedidos no seletor do Navbar). Consumo nas chaves próprias (origem =
 * usuario/organizacao) é registrado só para transparência e NUNCA conta aqui.
 *
 * Só existe a cota global por plano (tokens por ciclo, configurável no
 * Backoffice). Limites por modelo não são aplicados por enquanto. Sem valor
 * configurado = sem limite (nenhum número fictício é assumido).
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
      ciclo: {
        inicio,
        renovaEm: renovacaoDoCiclo(),
        regra: 'mes_calendario_provisorio',
      },
      total: linhas.reduce((s, l) => s + l.total, 0),
      franquiaGlobalTokens: cfg?.franquiaGlobalTokens ?? null,
      porModelo: linhas,
    };
  }

  async estado(usuarioId: string, plano: PlanoIaB2c): Promise<EstadoCota> {
    const c = await this.consumo(usuarioId, plano);
    const limite = c.franquiaGlobalTokens;
    return {
      total: c.total,
      limite,
      esgotada: limite !== null && c.total >= limite,
      renovaEm: c.ciclo.renovaEm,
    };
  }

  // ---------- Autorização para usar chaves próprias após a cota ----------

  /** Autorizado se a autorização foi dada dentro do ciclo atual. */
  async byokAutorizado(usuarioId: string): Promise<{
    autorizado: boolean;
    ate: Date | null;
  }> {
    const u = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { byokAposCotaEm: true },
    });
    const autorizado =
      !!u?.byokAposCotaEm && u.byokAposCotaEm >= inicioDoCiclo();
    return { autorizado, ate: autorizado ? renovacaoDoCiclo() : null };
  }

  async autorizarByok(usuarioId: string): Promise<void> {
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { byokAposCotaEm: new Date() },
    });
  }

  async revogarByok(usuarioId: string): Promise<void> {
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { byokAposCotaEm: null },
    });
  }

  /**
   * 429 de cota esgotada. Leva o que a interface precisa para oferecer as
   * alternativas (upgrade, cadastrar chave, autorizar as chaves existentes).
   */
  erroEsgotada(estado: EstadoCota, temChavePropria: boolean): HttpException {
    return new HttpException(
      {
        statusCode: 429,
        codigo: 'franquia_esgotada',
        temChavePropria,
        renovaEm: estado.renovaEm.toISOString(),
        message: temChavePropria
          ? 'A cota de IA do seu plano acabou neste ciclo. Faça upgrade do plano ou autorize o uso das suas chaves de API até a cota renovar.'
          : 'A cota de IA do seu plano acabou neste ciclo. Faça upgrade do plano ou cadastre sua própria chave em Configurações → IA & API.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
