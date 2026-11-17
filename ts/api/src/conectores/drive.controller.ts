import {
  Controller,
  Get,
  HttpException,
  Logger,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { OauthProviderService } from './oauth-provider.service';
import {
  DriveApiService,
  type DriveArquivo,
  type DriveConteudo,
  type DriveVisao,
} from './drive-api.service';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { CurrentUser } from '@/common/current-user.decorator';
import type { AuthenticatedUser } from '@/auth/jwt.strategy';
import { oauthRetorno } from './oauth-retorno';

const VISOES: DriveVisao[] = ['meu-drive', 'compartilhados', 'recentes'];

/**
 * Fluxo OAuth e leitura dos conectores de arquivos (`google-drive`). Rotas
 * espelhadas do AgendaController/EmailController — mesma mecânica:
 *
 * `GET /conectores/arquivos/:provedor/autorizar` (JWT) → `{url}` de consentimento.
 * `GET /conectores/arquivos/:provedor/callback` (público) → grava os tokens e
 * devolve o usuário à página de Conectores.
 * `GET /conectores/arquivos/:provedor/conta` (JWT) → health check da conexão.
 * `GET /conectores/arquivos/:provedor/arquivos` (JWT) → uma página de arquivos
 * (`pasta`, `busca`, `visao`, `pageToken`, `limite`).
 * `GET /conectores/arquivos/:provedor/arquivos/:id/caminho` → breadcrumb.
 * `GET /conectores/arquivos/:provedor/arquivos/:id/conteudo` → texto p/ prévia.
 * `GET /conectores/arquivos/:provedor/arquivos/:id/original` → bytes do arquivo.
 */
@Controller('conectores/arquivos/:provedor')
export class DriveController {
  private readonly logger = new Logger(DriveController.name);

  constructor(
    private readonly oauth: OauthProviderService,
    private readonly driveApi: DriveApiService,
  ) {}

  @Get('autorizar')
  @UseGuards(JwtAuthGuard)
  authorize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provedor') provedor: string,
  ): { url: string } {
    return {
      url: this.oauth.buildAuthorizeUrl(user.empresaId, provedor, 'arquivos'),
    };
  }

  @Get('conta')
  @UseGuards(JwtAuthGuard)
  async account(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provedor') provedor: string,
  ): Promise<{ conta: string }> {
    return {
      conta: await this.oauth.checkAccount(
        user.empresaId,
        provedor,
        'arquivos',
      ),
    };
  }

  @Get('arquivos')
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provedor') provedor: string,
    @Query('pasta') pasta?: string,
    @Query('busca') busca?: string,
    @Query('visao') visao?: string,
    @Query('pageToken') pageToken?: string,
    @Query('limite') limite?: string,
  ): Promise<{
    conta: string | null;
    arquivos: DriveArquivo[];
    proximaPagina?: string;
  }> {
    const pagina = await this.driveApi.listar(user.empresaId, provedor, {
      pasta: pasta || undefined,
      busca: busca || undefined,
      visao: VISOES.includes(visao as DriveVisao)
        ? (visao as DriveVisao)
        : 'meu-drive',
      pageToken: pageToken || undefined,
      limite: Number(limite) || undefined,
    });
    // A conta só rotula a tela; não precisa ser relida a cada página.
    const conta = pageToken
      ? null
      : await this.contaSilenciosa(user.empresaId, provedor);
    return { conta, ...pagina };
  }

  @Get('arquivos/:id/caminho')
  @UseGuards(JwtAuthGuard)
  async path(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provedor') provedor: string,
    @Param('id') id: string,
  ): Promise<{ caminho: { id: string; nome: string }[] }> {
    return {
      caminho: await this.driveApi.caminho(user.empresaId, provedor, id),
    };
  }

  @Get('arquivos/:id/conteudo')
  @UseGuards(JwtAuthGuard)
  content(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provedor') provedor: string,
    @Param('id') id: string,
  ): Promise<DriveConteudo> {
    return this.driveApi.conteudo(user.empresaId, provedor, id);
  }

  @Get('arquivos/:id/original')
  @UseGuards(JwtAuthGuard)
  async original(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provedor') provedor: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, contentType, nome } = await this.driveApi.original(
      user.empresaId,
      provedor,
      id,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  }

  /** Conta autorizada só para rotular a tela — nunca derruba a listagem. */
  private async contaSilenciosa(
    empresaId: string,
    provedor: string,
  ): Promise<string | null> {
    try {
      return await this.oauth.checkAccount(empresaId, provedor, 'arquivos');
    } catch {
      return null;
    }
  }

  @Get('callback')
  async callback(
    @Param('provedor') provedor: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const front = this.oauth.frontConectoresUrl;
    // Usuário negou na tela do provedor (ou o provedor reportou erro).
    if (error || !code || !state) {
      res.redirect(
        oauthRetorno(front, provedor, {
          motivo: error ?? 'autorizacao_cancelada',
        }),
      );
      return;
    }
    try {
      const conta = await this.oauth.handleCallback(code, state, 'arquivos');
      res.redirect(oauthRetorno(front, provedor, { conta }));
    } catch (err) {
      this.logger.error(err);
      const motivo =
        err instanceof HttpException
          ? String(
              (err.getResponse() as { message?: string }).message ??
                err.message,
            )
          : 'Erro inesperado ao concluir a autorização.';
      res.redirect(oauthRetorno(front, provedor, { motivo }));
    }
  }
}
