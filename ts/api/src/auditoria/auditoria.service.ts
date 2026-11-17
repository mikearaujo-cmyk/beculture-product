import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

/** Ações registradas. Texto estável — é o que a tela de auditoria filtra. */
export type AcaoAuditoria =
  | 'compartilhamento.criado'
  | 'compartilhamento.alterado'
  | 'compartilhamento.revogado'
  | 'compartilhamento.origem_removida'
  | 'conteudo.visualizado'
  | 'conteudo.usado_ia'
  | 'repositorio_org.publicado'
  | 'repositorio_org.enviado'
  | 'repositorio_org.editado'
  | 'repositorio_org.excluido'
  | 'politica.alterada'
  | 'membro.desativado'
  | 'membro.reativado'
  | 'membro.removido'
  | 'membro.gestor_alterado'
  | 'membro.area_alterada'
  | 'repositorio.reivindicado'
  | 'colecao.atualizada';

export interface EventoAuditoria {
  empresaId: string;
  atorUsuarioId?: string | null;
  acao: AcaoAuditoria;
  recursoTipo?: string | null;
  recursoId?: string | null;
  recursoTitulo?: string | null;
  donoUsuarioId?: string | null;
  alvoTipo?: string | null;
  alvoId?: string | null;
  /** Só metadados (ids, flags, contagens). NUNCA conteúdo. */
  metadados?: Prisma.InputJsonValue;
}

export interface FiltroAuditoria {
  acao?: string;
  atorUsuarioId?: string;
  recursoId?: string;
  donoUsuarioId?: string;
  de?: Date;
  ate?: Date;
  limite?: number;
  antesDe?: Date;
}

/**
 * Trilha de auditoria de operações sensíveis (compartilhamento, acesso a
 * conteúdo de terceiros, uso pela IA, governança).
 *
 * Grava só metadados. Uma falha ao auditar é LOGADA e não derruba a operação
 * de quem chamou, exceto onde o chamador decide gravar dentro da transação
 * (`dados()` devolve o payload para isso).
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Payload pronto para `createMany`/`create` dentro de uma transação. */
  async dados(
    evento: EventoAuditoria,
  ): Promise<Prisma.AuditoriaEventoCreateManyInput> {
    let atorNome: string | null = null;
    if (evento.atorUsuarioId) {
      const u = await this.prisma.usuario.findUnique({
        where: { id: evento.atorUsuarioId },
        select: { nome: true, email: true },
      });
      atorNome = u?.nome || u?.email || null;
    }
    return {
      empresaId: evento.empresaId,
      atorUsuarioId: evento.atorUsuarioId ?? null,
      atorNome,
      acao: evento.acao,
      recursoTipo: evento.recursoTipo ?? null,
      recursoId: evento.recursoId ?? null,
      // Título de nota PESSOAL é conteúdo ("PIP – João"): não vai para a
      // trilha, que admins consultam. Fica só o id; o dono resolve o título.
      recursoTitulo:
        evento.recursoTipo === 'nota_vault' || evento.recursoTipo === 'colecao'
          ? null
          : (evento.recursoTitulo?.slice(0, 300) ?? null),
      donoUsuarioId: evento.donoUsuarioId ?? null,
      alvoTipo: evento.alvoTipo ?? null,
      alvoId: evento.alvoId ?? null,
      metadados: evento.metadados ?? Prisma.JsonNull,
    };
  }

  /** Registra fora de transação; nunca lança. */
  async registrar(...eventos: EventoAuditoria[]): Promise<void> {
    if (!eventos.length) return;
    try {
      const data = await Promise.all(eventos.map((e) => this.dados(e)));
      await this.prisma.auditoriaEvento.createMany({ data });
    } catch (err) {
      this.logger.error(`Falha ao registrar auditoria: ${String(err)}`);
    }
  }

  async listar(empresaId: string, f: FiltroAuditoria) {
    await this.expurgar(empresaId);
    const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
    const criadoEm: Prisma.DateTimeFilter = {};
    if (f.de) criadoEm.gte = f.de;
    if (f.ate) criadoEm.lte = f.ate;
    if (f.antesDe) criadoEm.lt = f.antesDe;
    const eventos = await this.prisma.auditoriaEvento.findMany({
      where: {
        empresaId,
        ...(f.acao ? { acao: f.acao } : {}),
        ...(f.atorUsuarioId ? { atorUsuarioId: f.atorUsuarioId } : {}),
        ...(f.recursoId ? { recursoId: f.recursoId } : {}),
        ...(f.donoUsuarioId ? { donoUsuarioId: f.donoUsuarioId } : {}),
        ...(Object.keys(criadoEm).length ? { criadoEm } : {}),
      },
      orderBy: { criadoEm: 'desc' },
      take: limite + 1,
    });
    const temMais = eventos.length > limite;
    return { eventos: eventos.slice(0, limite), temMais };
  }

  /**
   * Aplica a retenção da política (`retencaoAuditoriaDias`): apaga eventos
   * mais antigos que o prazo. Roda na consulta — sem job agendado nesta versão.
   */
  async expurgar(empresaId: string): Promise<number> {
    const p = await this.prisma.politicaCompartilhamento.findUnique({
      where: { empresaId },
      select: { retencaoAuditoriaDias: true },
    });
    if (!p?.retencaoAuditoriaDias) return 0;
    const limite = new Date(Date.now() - p.retencaoAuditoriaDias * 86_400_000);
    const { count } = await this.prisma.auditoriaEvento.deleteMany({
      where: { empresaId, criadoEm: { lt: limite } },
    });
    return count;
  }
}
