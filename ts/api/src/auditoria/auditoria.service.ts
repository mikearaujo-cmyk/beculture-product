import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

/** Ações registradas. Texto estável: gravado na trilha. */
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
}
