/**
 * Aviso global de cota BeCulture esgotada (B2C).
 *
 * O backend responde 429 `codigo: "franquia_esgotada"` (HTTP) ou um evento
 * SSE `error` com o mesmo código (chat). Quem detecta (interceptor do axios,
 * `streamSquadChat`) dispara este evento; o `CotaEsgotadaModal`, montado uma
 * vez nos providers da conta, abre o aviso com as alternativas.
 */

export const EVENTO_COTA_ESGOTADA = "beculture:cota-esgotada";

/** Avisa as telas que leem o resumo da conta de IA para recarregá-lo. */
export const EVENTO_CONTA_IA_ALTERADA = "beculture:conta-ia-alterada";

export interface DetalheCotaEsgotada {
  /** A conta já tem chave própria utilizável em IA & API. */
  temChavePropria: boolean;
  /** Quando a cota volta a ser liberada (ISO). */
  renovaEm?: string;
}

export function ehCotaEsgotada(corpo: unknown): corpo is {
  codigo: "franquia_esgotada";
  temChavePropria?: boolean;
  renovaEm?: string;
} {
  return (
    !!corpo &&
    typeof corpo === "object" &&
    (corpo as { codigo?: unknown }).codigo === "franquia_esgotada"
  );
}

export function avisarCotaEsgotada(corpo: {
  temChavePropria?: boolean;
  renovaEm?: string;
}): void {
  window.dispatchEvent(
    new CustomEvent<DetalheCotaEsgotada>(EVENTO_COTA_ESGOTADA, {
      detail: {
        temChavePropria: !!corpo.temChavePropria,
        renovaEm: corpo.renovaEm,
      },
    }),
  );
}
