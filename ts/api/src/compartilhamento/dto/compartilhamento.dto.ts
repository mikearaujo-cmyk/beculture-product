import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Tipos que existem nos registros. Concessões NOVAS só aceitam `membro`
 * (pessoa da mesma organização); os demais ficam para ler/revogar as antigas.
 */
export const TIPOS_DESTINATARIO = [
  'membro',
  'equipe',
  'area',
  'empresa',
] as const;
export type TipoDestinatario = (typeof TIPOS_DESTINATARIO)[number];

export class DestinatarioDto {
  @IsIn(TIPOS_DESTINATARIO as unknown as string[])
  tipo!: TipoDestinatario;

  /** Membro.id (membro), Membro.id do gestor (equipe), Area.id (area). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  id?: string;
}

/**
 * Uma TAG do grafo (agrupamento de arquivos). Os `paths` são os arquivos que
 * o navegador do dono calculou para a tag; o servidor só aceita os que estão
 * no repositório verificado dele.
 */
export class TagDto {
  /** Id do nó no grafo (ex.: "tag::onboarding"). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  chave!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  rotulo!: string;

  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  paths!: string[];

  /** `true` = manter sincronizado com a tag (arquivos futuros entram). */
  @IsBoolean()
  sincronizada!: boolean;
}

export class SincronizarTagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  chave!: string;

  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  paths!: string[];
}

/**
 * Nova concessão. A nota é identificada pelo `path` no repositório ATIVO do
 * usuário (header, já verificado como dele) — ou, para quem administra o
 * compartilhamento de uma nota alheia, pelo `vaultNotaId`.
 */
export class CriarCompartilhamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vaultNotaId?: string;

  /** Compartilhar uma tag inteira (coleção) em vez de uma nota. */
  @IsOptional()
  @ValidateNested()
  @Type(() => TagDto)
  tag?: TagDto;

  @IsArray()
  @ArrayMinSize(1, { message: 'Escolha pelo menos um destinatário.' })
  @ArrayMaxSize(100, { message: 'No máximo 100 destinatários por vez.' })
  @ValidateNested({ each: true })
  @Type(() => DestinatarioDto)
  destinatarios!: DestinatarioDto[];

  /**
   * Legado: grupos recebem sempre só os membros de agora (`fixa`). O campo
   * segue aceito para não quebrar clientes antigos, mas o serviço o ignora.
   */
  @IsOptional()
  @IsIn(['fixa', 'dinamica'])
  abrangencia?: 'fixa' | 'dinamica';

  @IsBoolean()
  podeUsarIa!: boolean;

  @IsBoolean()
  podeAdministrar!: boolean;

  @IsOptional()
  @IsDateString()
  expiraEm?: string;
}

export class AlterarCompartilhamentoDto {
  @IsOptional()
  @IsBoolean()
  podeUsarIa?: boolean;

  @IsOptional()
  @IsBoolean()
  podeAdministrar?: boolean;

  /** `null` remove a expiração. */
  @IsOptional()
  @IsDateString()
  expiraEm?: string | null;

  @IsOptional()
  @IsBoolean()
  semExpiracao?: boolean;
}
