/**
 * Stepper do fluxo de contas.
 *
 * Clone do `Stepper` de `@/app/pages/onboarding` (mesmas classes de círculo,
 * mesmos estados concluído/ativo/neutro). Sem `etapas`, mostra as duas etapas
 * originais (Conta → Organização). O onboarding de IA passa a própria lista,
 * que varia por modalidade; com muitas etapas ele fica mais compacto.
 */

import {
  BuildingOffice2Icon,
  CheckIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import type { ElementType } from "react";

export interface EtapaStepper {
  key: string;
  titulo: string;
  Icon: ElementType;
}

const STEPS_PADRAO: EtapaStepper[] = [
  { key: "conta", titulo: "Sua conta", Icon: UserIcon },
  { key: "organizacao", titulo: "Sua organização", Icon: BuildingOffice2Icon },
];

export function StepperConta({
  stepIndex,
  etapas = STEPS_PADRAO,
}: {
  stepIndex: number;
  etapas?: EtapaStepper[];
}) {
  const compacto = etapas.length > 4;
  return (
    // Colunas de mesma largura e conector alinhado ao centro do círculo: sem
    // isso os rótulos têm larguras diferentes e o eixo dos círculos sai do
    // centro da moldura.
    <div className="mt-6 flex items-start justify-center">
      {etapas.map((s, i) => {
        const concluido = i < stepIndex;
        const ativo = i === stepIndex;
        return (
          <div key={s.key} className="flex items-start">
            <div
              className={clsx(
                "flex w-9 flex-col items-center gap-1.5",
                compacto ? "sm:w-20" : "sm:w-28",
              )}
            >
              <span
                aria-current={ativo ? "step" : undefined}
                className={clsx(
                  "flex size-9 items-center justify-center rounded-full border-2 transition-colors",
                  concluido && "border-primary-500 bg-primary-500 text-slate-900",
                  ativo && "border-primary-500 text-primary-600 dark:text-primary-400",
                  !concluido &&
                    !ativo &&
                    "border-gray-200 text-gray-300 dark:border-dark-500 dark:text-dark-400",
                )}
              >
                {concluido ? (
                  <CheckIcon className="size-4" strokeWidth="2.5" />
                ) : (
                  <s.Icon className="size-4.5" strokeWidth="1.8" />
                )}
              </span>
              <span
                className={clsx(
                  "hidden text-center font-medium sm:block",
                  compacto ? "text-tiny leading-tight" : "text-xs",
                  ativo || concluido
                    ? "text-gray-700 dark:text-dark-100"
                    : "text-gray-400 dark:text-dark-300",
                )}
              >
                {s.titulo}
              </span>
            </div>
            {i < etapas.length - 1 && (
              <span
                className={clsx(
                  "mt-[17px] h-0.5 rounded",
                  compacto ? "mx-0.5 w-3 sm:w-4" : "mx-2 w-10 sm:w-16",
                  i < stepIndex ? "bg-primary-500" : "bg-gray-200 dark:bg-dark-500",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
