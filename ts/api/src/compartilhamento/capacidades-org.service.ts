import { Injectable } from '@nestjs/common';
import { MembroStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { RolesService } from '@/acesso/roles.service';
import type { AuthenticatedUser } from '@/auth/jwt.strategy';

/** O que o usuário pode fazer no Repositório da organização. */
export interface CapacidadesOrg {
  visualizar: boolean;
  usarIa: boolean;
  enviar: boolean;
  editar: boolean;
  excluir: boolean;
}

const NENHUMA: CapacidadesOrg = {
  visualizar: false,
  usarIa: false,
  enviar: false,
  editar: false,
  excluir: false,
};

/**
 * Permissões sobre conteúdo INSTITUCIONAL (Repositório da organização). Nada aqui alcança conteúdo pessoal — isso é só
 * `AcessoConteudoService`, por concessão explícita.
 *
 * Regras:
 *   • membro inativo → nada;
 *   • Owner/Admin (não convidado) → tudo (mesmo bypass do PermissoesGuard);
 *   • conta sem nenhuma role atribuída (o caso comum hoje: a conta que criou a
 *     empresa e quem nunca recebeu role) → ler e usar na IA, como antes desta
 *     versão; sem escrita;
 *   • demais → os códigos `documentos.*` das roles.
 */
@Injectable()
export class CapacidadesOrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  async de(user: AuthenticatedUser): Promise<CapacidadesOrg> {
    const membro = await this.prisma.membro.findUnique({
      where: {
        empresaId_usuarioId: { empresaId: user.empresaId, usuarioId: user.id },
      },
      select: { status: true },
    });
    if (membro && membro.status !== MembroStatus.ativo) return NENHUMA;

    const ctx = await this.roles.contextoDeAutorizacao(user.empresaId, user.id);
    if (!ctx.convidado && (user.role === 'owner' || user.role === 'admin')) {
      return {
        visualizar: true,
        usarIa: true,
        enviar: true,
        editar: true,
        excluir: true,
      };
    }
    const p = new Set(ctx.permissoes);
    if (!ctx.convidado && p.size === 0) {
      return { ...NENHUMA, visualizar: true, usarIa: true };
    }
    return {
      visualizar: p.has('documentos.visualizar'),
      usarIa: p.has('documentos.usar_ia'),
      enviar: p.has('documentos.enviar'),
      editar: p.has('documentos.editar'),
      excluir: p.has('documentos.excluir'),
    };
  }
}
