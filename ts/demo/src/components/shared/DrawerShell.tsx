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
// Drawer lateral à direita, para ler um documento sem sair da tela — o mesmo
// lugar em que o grafo mostra o contexto de uma tag. Mesmo padrão de
// transição do NotaMemoriaModal e do MembroDrawer.
// ----------------------------------------------------------------------

export function DrawerShell({
  show,
  close,
  icon: Icon,
  title,
  description,
  children,
  footer,
}: {
  show: boolean;
  close: () => void;
  icon: ElementType;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Transition show={show}>
      <Dialog onClose={close} className="relative z-[80]">
        <TransitionChild
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm dark:bg-black/40" />
        </TransitionChild>

        <div className="fixed inset-0 flex justify-end sm:p-2">
          <TransitionChild
            enter="ease-out transform-gpu transition-transform duration-200"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="ease-in transform-gpu transition-transform duration-200"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <DialogPanel className="dark:bg-dark-700 flex h-[100dvh] w-screen flex-col bg-white shadow-xl sm:h-[calc(100dvh-1rem)] sm:w-[36rem] sm:rounded-xl">
              <div className="dark:border-dark-600 flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-3.5">
                <div className="min-w-0">
                  <DialogTitle className="dark:text-dark-50 flex items-center gap-2 text-base font-semibold text-gray-800">
                    <Icon className="text-primary-500 size-5 shrink-0" />
                    <span className="truncate">{title}</span>
                  </DialogTitle>
                  {description && (
                    <p className="dark:text-dark-300 text-tiny mt-0.5 truncate text-gray-500">
                      {description}
                    </p>
                  )}
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

              <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
                {children}
              </div>

              {footer && (
                <div className="dark:border-dark-600 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 py-3 pl-5 pr-5 sm:pr-24">
                  {footer}
                </div>
              )}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
