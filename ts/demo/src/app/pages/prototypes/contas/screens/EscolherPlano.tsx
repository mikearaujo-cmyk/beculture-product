/**
 * Seleção de planos — entre a confirmação de e-mail e a organização.
 *
 * Simula a escolha comercial que dirige o resto do cadastro. Não há cobrança
 * real: a escolha vai para o backend no `/registrar` e passa a determinar o
 * onboarding, a tela IA & API e de onde vêm os modelos.
 *
 * B2C (BeCulture / BYOK) e B2B são contextos comerciais distintos — os cards
 * mostram as regras de cada um lado a lado, e não variações de um mesmo plano.
 */

import {
  BuildingOffice2Icon,
  CheckCircleIcon,
  KeyIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useState, type ElementType } from "react";
import { Navigate, useNavigate } from "react-router";

import { Badge, Button } from "@/components/ui";
import type { ModalidadeIa, PlanoIa } from "@/services/api/modalidade";

import { MolduraAuth } from "../components/MolduraAuth";
import { useUsuario } from "../model/context";
import {
  lerPlanoEscolhido,
  MODALIDADES,
  PLANOS_B2C,
  salvarPlanoEscolhido,
} from "../model/planoEscolhido";

const ICONES: Record<ModalidadeIa, ElementType> = {
  beculture: SparklesIcon,
  byok: KeyIcon,
  organizacao: BuildingOffice2Icon,
};

export default function EscolherPlano() {
  const navigate = useNavigate();
  const usuario = useUsuario();
  const anterior = lerPlanoEscolhido();
  const [modalidade, setModalidade] = useState<ModalidadeIa | null>(
    anterior?.modalidadeIa ?? null,
  );
  const [plano, setPlano] = useState<PlanoIa>(anterior?.planoIa ?? "essencial");

  if (!usuario) return <Navigate to="../criar-conta" replace />;

  const continuar = () => {
    if (!modalidade) return;
    salvarPlanoEscolhido({
      modalidadeIa: modalidade,
      planoIa: modalidade === "beculture" ? plano : undefined,
    });
    navigate("../organizacao");
  };

  return (
    <MolduraAuth
      tituloPagina="Escolha seu plano"
      kicker="Seleção de plano"
      titulo="Como você vai contratar a beculture?"
      subtitulo="A modalidade define de onde vêm os modelos de IA e quem paga pelo uso"
      largura="max-w-[68rem]"
      depoisDoCard={
        <p className="dark:text-dark-300 mt-4 text-center text-xs text-gray-400">
          Protótipo: nenhuma cobrança é realizada. A escolha só direciona o
          fluxo e as regras da conta.
        </p>
      }
    >
      <div
        role="radiogroup"
        aria-label="Modalidade de contratação"
        className="grid gap-4 md:grid-cols-3"
      >
        {MODALIDADES.map((m) => {
          const selecionado = modalidade === m.id;
          const Icon = ICONES[m.id];
          return (
            <div
              key={m.id}
              role="radio"
              aria-checked={selecionado}
              tabIndex={0}
              onClick={() => setModalidade(m.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setModalidade(m.id);
                }
              }}
              className={clsx(
                "flex cursor-pointer flex-col rounded-lg border p-4 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                selecionado
                  ? "border-primary-600 bg-primary-600/5 dark:border-primary-400 dark:bg-primary-400/10"
                  : "dark:border-dark-600 dark:hover:border-dark-500 border-gray-200 hover:border-gray-300",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={clsx(
                    "grid size-10 place-items-center rounded-lg",
                    selecionado
                      ? "bg-primary-600/10 text-primary-600 dark:text-primary-400"
                      : "dark:bg-dark-700 dark:text-dark-300 bg-gray-100 text-gray-500",
                  )}
                >
                  <Icon className="size-5.5 stroke-[1.6]" />
                </span>
                <Badge
                  color={m.contexto === "B2B" ? "info" : "neutral"}
                  variant="soft"
                >
                  {m.contexto}
                </Badge>
              </div>
              <h3 className="dark:text-dark-50 mt-3 text-base font-semibold text-gray-800">
                {m.titulo}
              </h3>
              <p className="dark:text-dark-300 mt-0.5 text-xs-plus text-gray-500">
                {m.resumo}
              </p>

              <dl className="dark:border-dark-600 mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                {m.regras.map((r) => (
                  <div key={r.rotulo} className="text-xs">
                    <dt className="dark:text-dark-300 text-gray-400">{r.rotulo}</dt>
                    <dd className="dark:text-dark-100 font-medium text-gray-700">
                      {r.valor}
                    </dd>
                  </div>
                ))}
              </dl>

              <ul className="mt-3 space-y-1.5">
                {m.destaques.map((d) => (
                  <li
                    key={d}
                    className="dark:text-dark-200 flex gap-1.5 text-xs text-gray-600"
                  >
                    <CheckCircleIcon className="mt-px size-4 shrink-0 text-success" />
                    {d}
                  </li>
                ))}
              </ul>

              {m.id === "beculture" && selecionado && (
                <div
                  className="mt-4 grid grid-cols-2 gap-2"
                  role="radiogroup"
                  aria-label="Plano B2C"
                  onClick={(e) => e.stopPropagation()}
                >
                  {PLANOS_B2C.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={plano === p.id}
                      onClick={() => setPlano(p.id)}
                      className={clsx(
                        "rounded-md border px-2.5 py-2 text-start",
                        plano === p.id
                          ? "border-primary-600 bg-primary-600/10 ring-1 ring-primary-600 dark:border-primary-400 dark:ring-primary-400"
                          : "dark:border-dark-500 border-gray-200 bg-transparent",
                      )}
                    >
                      <span className="dark:text-dark-50 block text-sm font-semibold text-gray-800">
                        {p.titulo}
                      </span>
                      <span className="dark:text-dark-300 block text-tiny text-gray-500">
                        {p.descricao}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="flat"
          onClick={() => navigate("../confirmar-email")}
        >
          Voltar
        </Button>
        <Button
          type="button"
          color="primary"
          disabled={!modalidade}
          onClick={continuar}
        >
          {modalidade === "organizacao"
            ? "Continuar com a organização"
            : "Continuar"}
        </Button>
      </div>
    </MolduraAuth>
  );
}
