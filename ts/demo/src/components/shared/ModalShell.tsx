// Import Dependencies
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { ElementType, ReactNode } from "react";

// Local Imports
import { Button } from "@/components/ui";

// ----------------------------------------------------------------------
// Moldura de modal com ícone, título, descrição, corpo e rodapé — a mesma da
// tela de Notas e dos modais "Salvar no Repositório / no Grupo". Extraída de
// pages/ceo/SalvarConteudo.tsx para ser reaproveitada (ex.: Compartilhar).
// ----------------------------------------------------------------------

export function ModalShell({
  show,
  close,
  icon: Icon,
  title,
  description,
  children,
  footer,
  largura = "max-w-lg",
}: {
  show: boolean;
  close: () => void;
  icon: ElementType;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  /** Classe de largura máxima do painel. */
  largura?: string;
}) {
  return (
    <Transition show={show}>
      <Dialog onClose={close} className="relative z-[90]">
        <TransitionChild
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity dark:bg-black/40" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
          <TransitionChild
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel
              className={`dark:bg-dark-750 my-4 w-full ${largura} rounded-2xl bg-white p-6 shadow-xl`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="dark:bg-primary-500/15 bg-primary-50 grid size-10 shrink-0 place-items-center rounded-xl">
                    <Icon className="text-primary-600 dark:text-primary-400 size-5.5" />
                  </span>
                  <div>
                    <DialogTitle className="dark:text-dark-50 text-base font-semibold text-gray-800">
                      {title}
                    </DialogTitle>
                    <p className="dark:text-dark-300 text-xs-plus text-gray-500">
                      {description}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={close}
                  variant="flat"
                  isIcon
                  className="size-8 shrink-0 rounded-lg"
                  aria-label="Fechar"
                >
                  <XMarkIcon className="size-5" />
                </Button>
              </div>

              <div className="mt-5">{children}</div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                {footer}
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
