/**
 * Automático (Orquestrador) — seleção automática de modelo (protótipo).
 *
 * É uma das opções do seletor de modelos de cada ação. O orquestrador escolhe,
 * entre os modelos que a conta TEM DIREITO de usar, o mais adequado para a
 * tarefa. Não tem credenciais próprias: opera sobre os candidatos que o
 * resolvedor da modalidade já entregou —
 *   B2C BeCulture → modelos publicados no plano
 *   B2C BYOK      → modelos da conta
 *   B2B           → modelos da organização (nunca credencial BeCulture)
 *
 * LIMITAÇÃO: o roteamento real (decomposição em etapas, avaliação de custo e
 * qualidade) ainda não existe. Aqui a regra é simples e determinística:
 * pedidos curtos vão para o modelo mais leve disponível; pedidos longos ficam
 * com o principal da fila. O modelo efetivamente usado é sempre registrado em
 * `ai_usage` (`solicitadoComo = 'auto'`), o que já prepara a auditoria.
 */

/** Id do Automático no seletor de modelos e em `ai_usage.solicitadoComo`. */
export const ORQUESTRADOR_ID = 'auto';

export const ORQUESTRADOR_ROTULO = 'Automático';
export const ORQUESTRADOR_DESCRICAO =
  'O orquestrador escolhe o melhor modelo para cada tarefa.';

const MODELOS_LEVES = /haiku|mini|flash|small|lite/i;

/** Limite (em caracteres de entrada) abaixo do qual a tarefa é "curta". */
export const LIMITE_TAREFA_CURTA = 1200;

export function rotearAutomatico<T extends { model: string }>(
  candidatos: T[],
  tamanhoEntrada: number,
): T[] {
  if (candidatos.length < 2) return candidatos;
  if (tamanhoEntrada >= LIMITE_TAREFA_CURTA) return candidatos;
  const leve = candidatos.findIndex((c) => MODELOS_LEVES.test(c.model));
  if (leve <= 0) return candidatos;
  // O leve assume a frente; os demais seguem como reserva do failover.
  return [candidatos[leve], ...candidatos.filter((_, i) => i !== leve)];
}
