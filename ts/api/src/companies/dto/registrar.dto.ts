import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Cadastro mínimo (nome, e-mail, senha, organização).
 *
 * O funil completo (`POST /cadastro`) pede cobrança/documento/módulos. Este
 * endpoint existe para o fluxo novo de contas criar a empresa + owner no
 * backend sem repetir aquele formulário — os defaults de trial/plano são
 * aplicados no service.
 */
export class RegistrarDto {
  @IsString()
  @MinLength(2, { message: 'Informe o seu nome.' })
  @MaxLength(120)
  nome!: string;

  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(160)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'A senha deve ter ao menos 8 caracteres.' })
  @MaxLength(72)
  senha!: string;

  /** Nome da organização. Se omitido, usa o nome da pessoa. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  organizacaoNome?: string;

  /**
   * Modalidade escolhida na seleção de planos. Opcional para manter
   * compatibilidade: sem ela a conta nasce "legada" (comportamento anterior).
   *   beculture   → B2C com modelos BeCulture (usa planoIa)
   *   byok        → B2C com chaves próprias
   *   organizacao → B2B SaaS (chaves da organização)
   */
  @IsOptional()
  @IsIn(['beculture', 'byok', 'organizacao'])
  modalidadeIa?: 'beculture' | 'byok' | 'organizacao';

  @IsOptional()
  @IsIn(['essencial', 'pro'])
  planoIa?: 'essencial' | 'pro';
}
