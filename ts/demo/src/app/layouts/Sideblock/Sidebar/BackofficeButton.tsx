// Import Dependencies
import { NavLink, useLocation } from "react-router";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

// Local Imports
import {
  getProductCodeFromPath,
  systemAreaPath,
} from "@/app/navigation/ceoOs";

// ----------------------------------------------------------------------
// Acesso permanente ao Backoffice do PROTÓTIPO, no rodapé da sidebar.
//
// Fica fora do menu do produto de propósito: não é funcionalidade comercial e
// não depende de plano, organização ou permissão — qualquer conta usada na
// demonstração entra. Mesmo visual da "Pasta local", que continua ao lado.

export function BackofficeButton() {
  const { pathname } = useLocation();
  const destino = systemAreaPath(getProductCodeFromPath(pathname), "backoffice");

  return (
    <NavLink
      to={destino}
      data-tooltip
      data-tooltip-content="Controle dos cenários do protótipo"
      data-tooltip-place="right"
      className={({ isActive }) =>
        clsx(
          "group dark:hover:bg-dark-300/10 dark:hover:text-dark-100 dark:focus:bg-dark-300/10 flex w-full min-w-0 items-center gap-2.5 rounded-md px-3 py-1.5 text-start text-xs font-medium tracking-wide outline-hidden transition-colors ease-in-out hover:bg-gray-100 hover:text-gray-800 focus:bg-gray-100",
          isActive
            ? "dark:text-dark-50 bg-gray-100 text-gray-800 dark:bg-dark-300/10"
            : "dark:text-dark-300 text-gray-500",
        )
      }
    >
      <WrenchScrewdriverIcon className="size-4.5 shrink-0 stroke-[1.5] opacity-80 group-hover:opacity-100" />
      <span className="truncate">Backoffice</span>
    </NavLink>
  );
}
