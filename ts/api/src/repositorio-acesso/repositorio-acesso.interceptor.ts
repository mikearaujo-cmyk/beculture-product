import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { from, Observable, switchMap } from 'rxjs';
import type { AuthenticatedUser } from '@/auth/jwt.strategy';
import { HEADER_REPOSITORIO } from '@/common/repositorio-atual.decorator';
import { HEADER_ORGANIZACAO } from '@/common/organizacao-atual.decorator';
import { RepositorioAcessoService } from './repositorio-acesso.service';

function header(
  headers: Record<string, string | string[] | undefined> | undefined,
  nome: string,
): string | null {
  const bruto = headers?.[nome];
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  return (valor ?? '').trim() || null;
}

/**
 * Interceptor GLOBAL: em toda requisição autenticada que traga
 * `X-Repositorio-Id`, confere que o repositório é do usuário antes de o
 * handler rodar. Também barra `X-Organizacao-Id` = `pessoal:<outra pessoa>`.
 *
 * Interceptor, e não guard, porque os guards globais rodam ANTES do
 * `JwtAuthGuard` de cada controller — ainda não haveria `request.user`. Os
 * interceptores rodam depois de todos os guards.
 *
 * O `repositorioId` que chega pelo CORPO (multipart do /ai/prompt) não é visto
 * aqui — o corpo multipart só é lido pelo interceptor da rota. Esse caso é
 * verificado explicitamente no próprio controller.
 */
@Injectable()
export class RepositorioAcessoInterceptor implements NestInterceptor {
  constructor(private readonly acesso: RepositorioAcessoService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const user = req.user;
    if (!user?.id || !user.empresaId) return next.handle();
    const repositorioId = header(req.headers, HEADER_REPOSITORIO);
    const organizacaoId = header(req.headers, HEADER_ORGANIZACAO);
    if (!repositorioId && !organizacaoId) return next.handle();
    return from(
      (async () => {
        await this.acesso.verificarOrganizacao(
          user.empresaId,
          user.id,
          organizacaoId,
        );
        await this.acesso.verificar(user.empresaId, user.id, repositorioId);
      })(),
    ).pipe(switchMap(() => next.handle()));
  }
}
