import { createContext, useContext } from "react";

import type {
  KindModelo,
  ModelosConta,
  OpcaoModelo,
} from "@/services/api/modalidade";

export interface ModeloIaValue {
  modelos: ModelosConta | null;
  carregando: boolean;
  escolher: (kind: KindModelo, id: string) => void;
  recarregar: () => void;
}

export const ModeloIaContext = createContext<ModeloIaValue | null>(null);

/**
 * Seletor de uma modalidade. `modelo` é o id selecionado (o último usado em
 * qualquer ação) ou `undefined` quando a conta não tem opções.
 */
export function useModeloIa(kind: KindModelo = "text"): {
  /** Seletor de modelos disponível (só no B2C com modelos BeCulture). */
  habilitado: boolean;
  opcoes: OpcaoModelo[];
  modelo: string | undefined;
  setModelo: (id: string) => void;
  carregando: boolean;
  recarregar: () => void;
} {
  const ctx = useContext(ModeloIaContext);
  const daKind = ctx?.modelos?.[kind];
  return {
    habilitado: ctx?.modelos?.habilitado ?? false,
    opcoes: daKind?.opcoes ?? [],
    modelo: daKind?.selecionado ?? undefined,
    setModelo: (id: string) => ctx?.escolher(kind, id),
    carregando: ctx?.carregando ?? false,
    recarregar: () => ctx?.recarregar(),
  };
}
