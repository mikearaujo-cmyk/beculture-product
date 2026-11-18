import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { CurrentUser } from '@/common/current-user.decorator';
import { RepositorioAtual } from '@/common/repositorio-atual.decorator';
import type { AuthenticatedUser } from '@/auth/jwt.strategy';
import { CompartilhamentoService } from './compartilhamento.service';
import {
  AlterarCompartilhamentoDto,
  CriarCompartilhamentoDto,
  SincronizarTagDto,
} from './dto/compartilhamento.dto';

function limpo(v?: string, max = 1024): string | undefined {
  const s = (v ?? '').trim();
  return s ? s.slice(0, max) : undefined;
}

/**
 * Compartilhamento explícito de conteúdo pessoal entre membros da Empresa.
 *
 * O `X-Repositorio-Id` destas rotas já chega verificado como do usuário (ver
 * `RepositorioAcessoInterceptor`). Ids de compartilhamento e de nota alheios
 * respondem 404 — não confirmam a existência de nada.
 */
@Controller('compartilhamentos')
@UseGuards(JwtAuthGuard)
export class CompartilhamentoController {
  constructor(
    private readonly servico: CompartilhamentoService,
  ) {}

  /** POST /compartilhamentos → concede acesso a uma nota. */
  @Post()
  criar(
    @CurrentUser() user: AuthenticatedUser,
    @RepositorioAtual() repositorioId: string | null,
    @Body() dto: CriarCompartilhamentoDto,
  ) {
    return this.servico
      .criar(user, repositorioId, dto)
      .then((compartilhamentos) => ({ compartilhamentos }));
  }

  /** GET /compartilhamentos/concedidos → o que eu compartilhei (repositório ativo). */
  @Get('concedidos')
  async concedidos(
    @CurrentUser() user: AuthenticatedUser,
    @RepositorioAtual() repositorioId: string | null,
  ) {
    return {
      compartilhamentos: await this.servico.concedidos(user, repositorioId),
    };
  }

  /** GET /compartilhamentos/nota?path= | ?vaultNotaId= → concessões de uma nota. */
  @Get('nota')
  daNota(
    @CurrentUser() user: AuthenticatedUser,
    @RepositorioAtual() repositorioId: string | null,
    @Query('path') path?: string,
    @Query('vaultNotaId') vaultNotaId?: string,
    @Query('tag') tag?: string,
  ) {
    return this.servico.daNota(user, repositorioId, {
      path: limpo(path),
      vaultNotaId: limpo(vaultNotaId, 80),
      tag: limpo(tag, 300),
    });
  }

  /** GET /compartilhamentos/tags → tags compartilhadas do repositório ativo. */
  @Get('tags')
  async tags(
    @CurrentUser() user: AuthenticatedUser,
    @RepositorioAtual() repositorioId: string | null,
  ) {
    return { tags: await this.servico.tags(user, repositorioId) };
  }

  /** PUT /compartilhamentos/tags/notas → atualiza os arquivos de uma tag sincronizada. */
  @Put('tags/notas')
  sincronizarTag(
    @CurrentUser() user: AuthenticatedUser,
    @RepositorioAtual() repositorioId: string | null,
    @Body() dto: SincronizarTagDto,
  ) {
    return this.servico.sincronizarTag(user, repositorioId, dto.chave, dto.paths);
  }

  /** GET /compartilhamentos/nota/historico → auditoria daquela nota. */
  @Get('nota/historico')
  historico(
    @CurrentUser() user: AuthenticatedUser,
    @RepositorioAtual() repositorioId: string | null,
    @Query('path') path?: string,
    @Query('vaultNotaId') vaultNotaId?: string,
    @Query('tag') tag?: string,
  ) {
    return this.servico.historico(user, repositorioId, {
      path: limpo(path),
      vaultNotaId: limpo(vaultNotaId, 80),
      tag: limpo(tag, 300),
    });
  }

  /** GET /compartilhamentos/recebidos → compartilhados comigo (metadados). */
  @Get('recebidos')
  async recebidos(@CurrentUser() user: AuthenticatedUser) {
    return { recebidos: await this.servico.recebidos(user) };
  }

  /** GET /compartilhamentos/recebidos/:vaultNotaId → conteúdo (auditado). */
  @Get('recebidos/:vaultNotaId')
  conteudo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vaultNotaId') vaultNotaId: string,
  ) {
    return this.servico.conteudoRecebido(user, vaultNotaId.slice(0, 80));
  }

  /** GET /compartilhamentos/destinatarios → pessoas, áreas e sugestões. */
  @Get('destinatarios')
  destinatarios(@CurrentUser() user: AuthenticatedUser) {
    return this.servico.destinatarios(user);
  }

  /** GET /compartilhamentos/politica → política vigente + o que eu posso. */
  @Get('politica')
  async politica(@CurrentUser() user: AuthenticatedUser) {
    const [politica, capacidades] = await Promise.all([
      this.servico.politica(user.empresaId),
      this.servico.capacidadesOrg(user),
    ]);
    return { politica, capacidades };
  }

  /** PATCH /compartilhamentos/:id → permissões e expiração. */
  @Patch(':id')
  async alterar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AlterarCompartilhamentoDto,
  ) {
    return { compartilhamento: await this.servico.alterar(user, id.slice(0, 80), dto) };
  }

  /** DELETE /compartilhamentos/:id → revoga. */
  @Delete(':id')
  async revogar(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.servico.revogar(user, id.slice(0, 80));
    return { ok: true as const };
  }
}
