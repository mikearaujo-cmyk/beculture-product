import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString, MaxLength } from 'class-validator';
import {
  RepositorioOrgService,
  type DocumentoOrg,
} from './repositorio-org.service';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { CurrentUser } from '@/common/current-user.decorator';
import { OrganizacaoAtual } from '@/common/organizacao-atual.decorator';
import type { AuthenticatedUser } from '@/auth/jwt.strategy';
import type { CapacidadesOrg } from '@/compartilhamento/capacidades-org.service';

// O multer (memoryStorage) entrega o arquivo com estes campos.
interface UploadedFileLike {
  originalname: string;
  buffer: Buffer;
  size: number;
}

class EditarDocumentoDto {
  @IsString()
  @MaxLength(200_000, { message: 'Documento muito grande (máx. 200k caracteres).' })
  conteudo!: string;
}

function exigirOrganizacao(organizacaoId: string | null): string {
  if (!organizacaoId) {
    throw new BadRequestException('Nenhuma organização ativa.');
  }
  return organizacaoId;
}

/**
 * Repositório da organização (Configurações → Repositório → Visualizar
 * arquivos). Escopado a empresa + organização (header X-Organizacao-Id).
 *
 * As permissões são conferidas NO SERVIDOR pelo service (`documentos.*`). A
 * interface usa `GET capacidades` só para esconder botões.
 */
@Controller('repositorio-org/documentos')
@UseGuards(JwtAuthGuard)
export class RepositorioOrgController {
  constructor(private readonly repositorio: RepositorioOrgService) {}

  /** GET /repositorio-org/documentos → documentos da organização ativa. */
  @Get()
  async listar(
    @CurrentUser() user: AuthenticatedUser,
    @OrganizacaoAtual() organizacaoId: string | null,
  ): Promise<{ documentos: DocumentoOrg[] }> {
    return {
      documentos: await this.repositorio.listar(user, organizacaoId),
    };
  }

  /** GET /repositorio-org/documentos/capacidades → o que eu posso fazer. */
  @Get('capacidades')
  async capacidades(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ capacidades: CapacidadesOrg }> {
    return { capacidades: await this.repositorio.capacidadesDe(user) };
  }

  /** GET /repositorio-org/documentos/:id → documento com o texto. */
  @Get(':id')
  obter(
    @CurrentUser() user: AuthenticatedUser,
    @OrganizacaoAtual() organizacaoId: string | null,
    @Param('id') id: string,
  ) {
    return this.repositorio.obter(
      user,
      exigirOrganizacao(organizacaoId),
      id.slice(0, 80),
    );
  }

  /** POST /repositorio-org/documentos (multipart `arquivo`) → documento criado. */
  @Post()
  @UseInterceptors(
    FileInterceptor('arquivo', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async enviar(
    @CurrentUser() user: AuthenticatedUser,
    @OrganizacaoAtual() organizacaoId: string | null,
    @UploadedFile() arquivo: UploadedFileLike | undefined,
  ): Promise<{ documento: DocumentoOrg }> {
    const org = exigirOrganizacao(organizacaoId);
    if (!arquivo) throw new BadRequestException('Envie um arquivo.');
    return { documento: await this.repositorio.enviar(user, org, arquivo) };
  }

  /** PATCH /repositorio-org/documentos/:id → edita o texto (md/txt). */
  @Patch(':id')
  async editar(
    @CurrentUser() user: AuthenticatedUser,
    @OrganizacaoAtual() organizacaoId: string | null,
    @Param('id') id: string,
    @Body() dto: EditarDocumentoDto,
  ): Promise<{ documento: DocumentoOrg }> {
    return {
      documento: await this.repositorio.editar(
        user,
        exigirOrganizacao(organizacaoId),
        id.slice(0, 80),
        dto.conteudo,
      ),
    };
  }

  /** DELETE /repositorio-org/documentos/:id */
  @Delete(':id')
  async remover(
    @CurrentUser() user: AuthenticatedUser,
    @OrganizacaoAtual() organizacaoId: string | null,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.repositorio.remover(
      user,
      exigirOrganizacao(organizacaoId),
      id.slice(0, 80),
    );
    return { ok: true };
  }
}
