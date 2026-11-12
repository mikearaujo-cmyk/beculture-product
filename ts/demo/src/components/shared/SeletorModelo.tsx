// Seletor de modelo de IA das ações (Assistente, estúdio, apresentação...).
//
// Mesmo padrão de menu do "@ Agentes" (AgenteSelect). O valor é compartilhado
// entre todas as ações (ModeloIaProvider): escolher aqui deixa o mesmo modelo
// selecionado nas outras, até trocar de novo — estilo Adapta. "Automático" é
// o orquestrador, que escolhe o modelo de cada tarefa.
import { Fragment } from "react";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from "@headlessui/react";
import {
  CheckIcon,
  ChevronDownIcon,
  CpuChipIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";

import { useModeloIa } from "@/app/contexts/modelo-ia/context";
import type { KindModelo } from "@/services/api/modalidade";

const ITEM_CLASS =
  "flex w-full items-start gap-2 px-3 py-1.5 text-start text-xs-plus transition-colors";

export function SeletorModelo({
  kind = "text",
  disabled,
  className,
  /** Abre para cima (compositores no rodapé) ou para baixo (barras no topo). */
  abrirPara = "baixo",
}: {
  kind?: KindModelo;
  disabled?: boolean;
  className?: string;
  abrirPara?: "cima" | "baixo";
}) {
  const { opcoes, modelo, setModelo, carregando, recarregar } =
    useModeloIa(kind);
  const atual = opcoes.find((o) => o.id === modelo);
  const vazio = !carregando && opcoes.length === 0;

  return (
    <Menu as="div" className={clsx("relative min-w-0 shrink-0", className)}>
      <MenuButton
        disabled={disabled || vazio || carregando}
        // Relê as opções ao abrir: o catálogo pode ter mudado no Backoffice.
        onClick={recarregar}
        title={
          vazio
            ? "Nenhum modelo disponível para esta conta"
            : `Modelo: ${atual?.rotulo ?? "—"}`
        }
        aria-label={`Modelo de IA: ${atual?.rotulo ?? "nenhum"}`}
        className="dark:text-dark-300 dark:hover:bg-dark-600 dark:hover:text-dark-100 flex max-w-56 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
      >
        {atual?.id === "auto" ? (
          <SparklesIcon className="size-3.5 shrink-0" />
        ) : (
          <CpuChipIcon className="size-3.5 shrink-0" />
        )}
        <span className="truncate">
          {carregando
            ? "Modelo…"
            : vazio
              ? "Nenhum modelo disponível"
              : (atual?.rotulo ?? "Modelo")}
        </span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-70" />
      </MenuButton>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="opacity-0 translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-in duration-75"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-1"
      >
        <MenuItems
          anchor={{
            to: abrirPara === "cima" ? "top start" : "bottom start",
            gap: 6,
          }}
          className="dark:border-dark-500 dark:bg-dark-750 z-[120] max-h-80 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg shadow-gray-200/60 outline-hidden dark:shadow-none"
        >
          <p className="dark:text-dark-300 text-tiny px-3 pt-1.5 pb-1 font-semibold tracking-wide text-gray-400 uppercase">
            Modelo
          </p>
          {opcoes.map((o) => (
            <MenuItem key={o.id}>
              {({ focus }) => (
                <button
                  type="button"
                  onClick={() => setModelo(o.id)}
                  className={clsx(
                    ITEM_CLASS,
                    focus
                      ? "dark:bg-dark-600 dark:text-dark-50 bg-gray-100 text-gray-900"
                      : "dark:text-dark-100 text-gray-700",
                  )}
                >
                  {o.id === "auto" ? (
                    <SparklesIcon className="text-primary-600 dark:text-primary-400 mt-0.5 size-4 shrink-0" />
                  ) : (
                    <CpuChipIcon className="mt-0.5 size-4 shrink-0 opacity-70" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {o.rotulo}
                    </span>
                    <span className="dark:text-dark-300 text-tiny block text-gray-400">
                      {o.descricao ?? o.providerNome}
                    </span>
                  </span>
                  {o.id === modelo && (
                    <CheckIcon className="text-primary-600 dark:text-primary-400 mt-0.5 size-4 shrink-0" />
                  )}
                </button>
              )}
            </MenuItem>
          ))}
          <p className="dark:border-dark-500 dark:text-dark-300 text-tiny mt-1 border-t border-gray-100 px-3 pt-1.5 pb-1 text-gray-400">
            O modelo escolhido vale para todas as ações até você trocar.
          </p>
        </MenuItems>
      </Transition>
    </Menu>
  );
}
