/**
 * Provider do protótipo. Hidrata de `sessionStorage` no initializer do
 * `useReducer` e escreve a cada mudança de estado.
 */

import { useEffect, useMemo, useReducer, type ReactNode } from "react";

import { definirRepositorioPastaAtivo } from "@/app/pages/ceo/memoria-inventario";
import {
  definirEscopoIa,
  definirOrganizacaoAtiva,
  donoDoRepositorio,
} from "@/app/pages/ceo/repositorio-org/escopo";

import { PrototipoContasContext } from "./context";
import { carregar, salvar } from "./persistencia";
import { reducer } from "./reducer";
import { classificarCobranca } from "./regras";
import {
  organizacaoAtiva,
  pagadorDaOrganizacaoAtiva,
  repositorioAtivo,
  usuarioDaSessao,
} from "./selectors";

export function PrototipoContasProvider({ children }: { children: ReactNode }) {
  const [estado, despachar] = useReducer(reducer, undefined, carregar);

  useEffect(() => {
    salvar(estado);
  }, [estado]);

  // Isola a pasta do Repositório (IndexedDB) pelo repositório ativo.
  useEffect(() => {
    definirRepositorioPastaAtivo(repositorioAtivo(estado)?.id ?? null);
  }, [estado]);

  // Isola o Repositório da organização (servidor) pela organização ativa.
  useEffect(() => {
    definirOrganizacaoAtiva(
      donoDoRepositorio(
        organizacaoAtiva(estado)?.id ?? null,
        usuarioDaSessao(estado)?.id ?? null,
      ),
    );
    // Escopo de IA: organização pessoal (sem organização ou pagador PF) usa
    // as telas e regras B2C; organização empresarial (PJ), as antigas.
    const pagador = pagadorDaOrganizacaoAtiva(estado);
    definirEscopoIa(
      organizacaoAtiva(estado) &&
        pagador &&
        classificarCobranca(pagador) === "b2b"
        ? "organizacao"
        : "pessoal",
    );
  }, [estado]);

  const valor = useMemo(() => ({ estado, despachar }), [estado]);

  return (
    <PrototipoContasContext value={valor}>{children}</PrototipoContasContext>
  );
}
