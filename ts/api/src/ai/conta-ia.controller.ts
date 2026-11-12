import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { CurrentUser } from '@/common/current-user.decorator';
import type { AuthenticatedUser } from '@/auth/jwt.strategy';
import { PermissoesGuard, RequerPermissao } from '@/acesso/permissoes.guard';
import { PrismaService } from '@/prisma/prisma.service';
import { ContaIaService } from './conta-ia.service';
import { ModalidadeService } from './modalidade.service';
import { ModelosContaService } from './modelos-conta.service';

class DefinirModalidadeDto {
  @IsIn(['beculture', 'byok', 'organizacao'])
  modalidadeIa!: 'beculture' | 'byok' | 'organizacao';

  @IsOptional()
  @IsIn(['essencial', 'pro'])
  planoIa?: 'essencial' | 'pro';
}

class EtapaDto {
  @IsString()
  etapa!: string;
}

class UltimoModeloDto {
  @IsIn(['text', 'image', 'video'])
  kind!: 'text' | 'image' | 'video';

  @IsString()
  @MaxLength(120)
  modelo!: string;
}

/**
 * Contexto de IA da conta logada: modalidade, plano, prontidão (estados sem
 * configuração), modelos disponíveis e etapas do onboarding.
 */
@Controller('conta')
@UseGuards(JwtAuthGuard, PermissoesGuard)
export class ContaIaController {
  constructor(
    private readonly contaIa: ContaIaService,
    private readonly modalidade: ModalidadeService,
    private readonly prisma: PrismaService,
    private readonly modelos: ModelosContaService,
  ) {}

  /**
   * GET /conta/modelos → opções do seletor de modelos das ações (por
   * modalidade) e o último modelo usado pelo usuário.
   */
  @Get('modelos')
  modelosDisponiveis(@CurrentUser() user: AuthenticatedUser) {
    return this.modelos.listar(user.empresaId, user.id);
  }

  /**
   * PUT /conta/modelos/ultimo → grava o modelo escolhido num seletor; ele
   * passa a vir selecionado em todas as ações (estilo Adapta).
   */
  @Put('modelos/ultimo')
  salvarUltimoModelo(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UltimoModeloDto,
  ) {
    return this.modelos.salvarUltimo(
      user.empresaId,
      user.id,
      dto.kind,
      dto.modelo,
    );
  }

  /** GET /conta/modalidade → contexto + prontidão + modelos visíveis. */
  @Get('modalidade')
  resumo(@CurrentUser() user: AuthenticatedUser) {
    return this.contaIa.resumo(user.empresaId, user.id);
  }

  /**
   * PUT /conta/modalidade → grava a escolha da seleção de planos. Só enquanto o
   * onboarding não foi concluído; depois disso a troca é uma migração (feita no
   * Backoffice do protótipo, que aplica as regras de migração).
   */
  @Put('modalidade')
  @RequerPermissao('configuracoes.gerenciar')
  async definir(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DefinirModalidadeDto,
  ) {
    const ctx = await this.modalidade.contexto(user.empresaId);
    if (ctx.onboardingConcluidoEm) {
      throw new BadRequestException(
        'A modalidade já foi definida. Mudanças de plano são feitas como migração.',
      );
    }
    const b2b = dto.modalidadeIa === 'organizacao';
    await this.prisma.empresa.update({
      where: { id: user.empresaId },
      data: {
        modalidadeComercial: b2b ? 'b2b' : 'b2c',
        modalidadeIa: dto.modalidadeIa,
        planoIa:
          dto.modalidadeIa === 'beculture'
            ? (dto.planoIa ?? 'essencial')
            : null,
      },
    });
    await this.modalidade.marcarEtapa(user.empresaId, 'plano');
    return this.contaIa.resumo(user.empresaId, user.id);
  }

  /** POST /conta/onboarding/etapa → registra uma etapa concluída. */
  @Post('onboarding/etapa')
  async etapa(@CurrentUser() user: AuthenticatedUser, @Body() dto: EtapaDto) {
    await this.modalidade.marcarEtapa(user.empresaId, dto.etapa);
    return this.contaIa.resumo(user.empresaId, user.id);
  }

  /**
   * POST /conta/onboarding/concluir → conclui o onboarding de IA. BYOK e B2B
   * exigem IA pronta (chave válida + modelo). No B2C BeCulture a ausência de
   * modelos é um problema da plataforma, não do usuário: conclui com aviso.
   */
  @Post('onboarding/concluir')
  concluir(@CurrentUser() user: AuthenticatedUser) {
    return this.contaIa.concluirOnboarding(user.empresaId, user.id);
  }
}
