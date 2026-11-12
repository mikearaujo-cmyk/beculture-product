import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '@/auth/jwt.strategy';

/**
 * Ponto ÚNICO de autorização do Backoffice.
 *
 * Protótipo: qualquer conta autenticada entra (não depende de plano,
 * modalidade, organização nem role) — é o que permite configurar e demonstrar
 * os cenários.
 *
 * Versão comercial: o Backoffice é uma área interna da BeCulture. Para
 * restringir, defina `BACKOFFICE_RESTRITO=true` e liste os e-mails da equipe
 * em `BACKOFFICE_EMAILS` (separados por vírgula). No produto real isto vira
 * autenticação própria do console interno; o acesso irrestrito de hoje NÃO é
 * uma regra de autorização do produto.
 */
@Injectable()
export class BackofficeGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get<string>('BACKOFFICE_RESTRITO') !== 'true') return true;

    const user = context.switchToHttp().getRequest().user as
      | AuthenticatedUser
      | undefined;
    const permitidos = (this.config.get<string>('BACKOFFICE_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (user && permitidos.includes(user.email.toLowerCase())) return true;
    throw new ForbiddenException('Backoffice restrito à equipe BeCulture.');
  }
}
