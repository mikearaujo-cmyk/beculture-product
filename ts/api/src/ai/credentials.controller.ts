import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AiCredentialsService } from './credentials.service';
import { CreateCredentialDto, UpdateCredentialDto } from './dto/credential.dto';
import { UNIFIED_CATALOG } from './catalogo';
import { ModalidadeService } from './modalidade.service';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { CurrentUser } from '@/common/current-user.decorator';
import type { AuthenticatedUser } from '@/auth/jwt.strategy';
import {
  PermissoesGuard,
  RequerPermissao,
} from '@/acesso/permissoes.guard';

/**
 * Chaves próprias da conta (BYOK do usuário B2C ou da organização B2B).
 *
 * Escrita: exige `configuracoes.gerenciar` (owner/admin passam; membros só com
 * role que conceda) e é BLOQUEADA quando a conta usa modelos BeCulture.
 * Leitura: qualquer membro autenticado da própria conta (isolada por empresaId).
 */
@Controller('ai')
@UseGuards(JwtAuthGuard, PermissoesGuard)
export class AiCredentialsController {
  constructor(
    private readonly credentials: AiCredentialsService,
    private readonly modalidade: ModalidadeService,
  ) {}

  /**
   * GET /ai/providers → catálogo unificado (texto + imagem + vídeo), com
   * `modalities` e `models[].modality` para o front filtrar por seção.
   */
  @Get('providers')
  catalog() {
    return UNIFIED_CATALOG;
  }

  /** GET /ai/credentials → chaves do tenant (sem o valor cru). */
  @Get('credentials')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.credentials.listPublic(user.empresaId);
  }

  /** POST /ai/credentials → cadastra uma chave (provedor + chave + nome). */
  @Post('credentials')
  @RequerPermissao('configuracoes.gerenciar')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCredentialDto,
  ) {
    await this.modalidade.assertPodeGerenciarChaves(user.empresaId);
    return this.credentials.create(user.empresaId, dto);
  }

  /** PATCH /ai/credentials/:id → renomear, trocar a chave, ativar/desativar. */
  @Patch('credentials/:id')
  @RequerPermissao('configuracoes.gerenciar')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCredentialDto,
  ) {
    await this.modalidade.assertPodeGerenciarChaves(user.empresaId);
    return this.credentials.update(user.empresaId, id, dto);
  }

  /** POST /ai/credentials/:id/validar → confere a chave de novo no provedor. */
  @Post('credentials/:id/validar')
  @RequerPermissao('configuracoes.gerenciar')
  async revalidar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.modalidade.assertPodeGerenciarChaves(user.empresaId);
    return this.credentials.revalidar(user.empresaId, id);
  }

  /** DELETE /ai/credentials/:id → remove a chave e os modelos das filas. */
  @Delete('credentials/:id')
  @RequerPermissao('configuracoes.gerenciar')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.modalidade.assertPodeGerenciarChaves(user.empresaId);
    await this.credentials.remove(user.empresaId, id);
    return { ok: true };
  }
}
