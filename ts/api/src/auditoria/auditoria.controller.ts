import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { CurrentUser } from '@/common/current-user.decorator';
import { PermissoesGuard, RequerPermissao } from '@/acesso/permissoes.guard';
import type { AuthenticatedUser } from '@/auth/jwt.strategy';
import { AuditoriaService } from './auditoria.service';

function data(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Consulta da trilha de auditoria da empresa. Exige `auditoria.consultar`
 * (Owner/Admin pelo bypass do guard). Devolve só metadados: consultar a
 * auditoria não dá acesso ao conteúdo de ninguém.
 */
@Controller('auditoria')
@UseGuards(JwtAuthGuard, PermissoesGuard)
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  @RequerPermissao('auditoria.consultar')
  listar(
    @CurrentUser() user: AuthenticatedUser,
    @Query('acao') acao?: string,
    @Query('ator') ator?: string,
    @Query('recurso') recurso?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('antesDe') antesDe?: string,
    @Query('limite') limite?: string,
  ) {
    return this.auditoria.listar(user.empresaId, {
      acao: acao?.slice(0, 80) || undefined,
      atorUsuarioId: ator?.slice(0, 80) || undefined,
      recursoId: recurso?.slice(0, 80) || undefined,
      de: data(de),
      ate: data(ate),
      antesDe: data(antesDe),
      limite: limite ? Number(limite) || undefined : undefined,
    });
  }
}
