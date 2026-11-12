import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { PlanoIaB2c } from '@prisma/client';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { CurrentUser } from '@/common/current-user.decorator';
import type { AuthenticatedUser } from '@/auth/jwt.strategy';
import { PlataformaIaService, PLANOS_IA } from './plataforma.service';
import { ContaIaService } from './conta-ia.service';
import { PrototipoIaService } from './prototipo.service';
import { BackofficeGuard } from './backoffice.guard';
import { UNIFIED_CATALOG, type AiModality } from './catalogo';

class CriarCredencialDto {
  /** Id do catálogo. Omitido quando o provedor é livre (`nomeProvedor`). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nomeProvedor?: string;

  @IsString()
  @MinLength(8, { message: 'A chave de API parece curta demais.' })
  apiKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nome?: string;
}

class AtualizarCredencialDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nomeProvedor?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  ativa?: boolean;
}

class CriarModeloDto {
  @IsString()
  credencialId!: string;

  @IsIn(['text', 'image', 'video'])
  kind!: AiModality;

  @IsString()
  model!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  rotulo?: string;

  @IsOptional()
  @IsArray()
  @IsIn(PLANOS_IA, { each: true })
  planos?: PlanoIaB2c[];
}

class AtualizarModeloDto {
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  rotulo?: string;

  @IsOptional()
  @IsInt()
  ordem?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsIn(['text', 'image', 'video'])
  kind?: AiModality;
}

class ChaveOperacionalDto {
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'A chave de API parece curta demais.' })
  apiKey?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  modeloPadrao?: string | null;
}

class ModeloPlanoDto {
  @IsBoolean()
  habilitado!: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  limiteTokensCiclo?: number | null;
}

class FranquiaDto {
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  franquiaGlobalTokens!: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  observacao?: string;
}

class MigrarDto {
  @IsIn(['beculture', 'byok', 'organizacao'])
  modalidadeIa!: 'beculture' | 'byok' | 'organizacao';

  @IsOptional()
  @IsIn(PLANOS_IA)
  planoIa?: PlanoIaB2c;

  @IsOptional()
  @IsBoolean()
  reiniciarOnboarding?: boolean;
}

function parsePlano(plano: string): PlanoIaB2c {
  if ((PLANOS_IA as string[]).includes(plano)) return plano as PlanoIaB2c;
  throw new BadRequestException('Plano inválido (use essencial ou pro).');
}

/**
 * Backoffice do PROTÓTIPO, com três contextos separados:
 *   - Configuração de API: chave operacional real (`prototipo_credenciais`)
 *   - Modelos BeCulture: catálogo demonstrativo (`plataforma_*`)
 *   - Conta em demonstração: cenário da conta logada
 * Nenhum deles se mistura com as chaves BYOK/B2B (`ai_credentials`).
 *
 * Acesso: `BackofficeGuard` (hoje, qualquer conta autenticada — ver o guard).
 * RISCO CONHECIDO no deploy público: qualquer conta altera estas chaves.
 */
@Controller('backoffice')
@UseGuards(JwtAuthGuard, BackofficeGuard)
export class BackofficeController {
  constructor(
    private readonly plataforma: PlataformaIaService,
    private readonly contaIa: ContaIaService,
    private readonly prototipo: PrototipoIaService,
  ) {}

  // ---------- Configuração de API (chave operacional do protótipo) ----------

  @Get('api-operacional')
  chavesOperacionais() {
    return this.prototipo.listar();
  }

  @Put('api-operacional/:provider')
  salvarChaveOperacional(
    @Param('provider') provider: string,
    @Body() dto: ChaveOperacionalDto,
  ) {
    return this.prototipo.salvar(provider, dto);
  }

  @Post('api-operacional/:provider/testar')
  testarChaveOperacional(@Param('provider') provider: string) {
    return this.prototipo.testar(provider);
  }

  @Delete('api-operacional/:provider')
  removerChaveOperacional(@Param('provider') provider: string) {
    return this.prototipo.remover(provider);
  }

  // ---------- Modelos BeCulture (catálogo demonstrativo) ----------

  @Get('status')
  status() {
    return this.plataforma.status();
  }

  @Get('ia/catalogo')
  catalogo() {
    return UNIFIED_CATALOG;
  }

  // ---------- Credenciais da plataforma ----------

  @Get('ia/credenciais')
  credenciais() {
    return this.plataforma.listarCredenciais();
  }

  @Post('ia/credenciais')
  criarCredencial(@Body() dto: CriarCredencialDto) {
    return this.plataforma.criarCredencial(dto);
  }

  @Patch('ia/credenciais/:id')
  atualizarCredencial(
    @Param('id') id: string,
    @Body() dto: AtualizarCredencialDto,
  ) {
    return this.plataforma.atualizarCredencial(id, dto);
  }

  @Post('ia/credenciais/:id/validar')
  revalidarCredencial(@Param('id') id: string) {
    return this.plataforma.revalidarCredencial(id);
  }

  @Delete('ia/credenciais/:id')
  async removerCredencial(@Param('id') id: string) {
    await this.plataforma.removerCredencial(id);
    return { ok: true };
  }

  // ---------- Modelos da plataforma ----------

  @Get('ia/modelos')
  modelos() {
    return this.plataforma.listarModelos();
  }

  @Post('ia/modelos')
  criarModelo(@Body() dto: CriarModeloDto) {
    return this.plataforma.criarModelo(dto);
  }

  @Patch('ia/modelos/:id')
  atualizarModelo(@Param('id') id: string, @Body() dto: AtualizarModeloDto) {
    return this.plataforma.atualizarModelo(id, dto);
  }

  @Delete('ia/modelos/:id')
  async removerModelo(@Param('id') id: string) {
    await this.plataforma.removerModelo(id);
    return { ok: true };
  }

  @Put('ia/modelos/:id/planos/:plano')
  definirPlano(
    @Param('id') id: string,
    @Param('plano') plano: string,
    @Body() dto: ModeloPlanoDto,
  ) {
    return this.plataforma.definirPlano(id, parsePlano(plano), dto);
  }

  // ---------- Planos (franquia provisória) ----------

  @Get('ia/planos')
  planos() {
    return this.plataforma.listarPlanos();
  }

  @Put('ia/planos/:plano')
  definirFranquia(@Param('plano') plano: string, @Body() dto: FranquiaDto) {
    return this.plataforma.definirFranquia(parsePlano(plano), dto);
  }

  // ---------- Conta em demonstração ----------

  @Get('conta-demo')
  contaDemo(@CurrentUser() user: AuthenticatedUser) {
    return this.contaIa.resumo(user.empresaId, user.id);
  }

  @Put('conta-demo/modalidade')
  migrar(@CurrentUser() user: AuthenticatedUser, @Body() dto: MigrarDto) {
    return this.contaIa.migrar(
      user.empresaId,
      user.id,
      { modalidadeIa: dto.modalidadeIa, planoIa: dto.planoIa },
      dto.reiniciarOnboarding ?? false,
    );
  }
}
