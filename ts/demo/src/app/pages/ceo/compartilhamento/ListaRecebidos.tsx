// Import Dependencies
import { useMemo, useState } from "react";
import {
  DocumentTextIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

// Local Imports
import { Badge, Spinner } from "@/components/ui";
import type { Recebido } from "@/services/api/compartilhamentos";

// ----------------------------------------------------------------------
// "Compartilhados comigo": notas de OUTRAS pessoas que o servidor autoriza
// agora. Só metadados aqui; o conteúdo é buscado (e auditado) ao abrir.
// Filtros por proprietário e por tipo de acesso.
// ----------------------------------------------------------------------

function data(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ListaRecebidos({
  recebidos,
  onAbrir,
}: {
  recebidos: Recebido[] | null;
  onAbrir: (r: Recebido) => void;
}) {
  const [busca, setBusca] = useState("");
  const [dono, setDono] = useState("");
  const [acesso, setAcesso] = useState<"" | "ia" | "admin">("");

  const donos = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of recebidos ?? []) m.set(r.donoUsuarioId, r.donoNome);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [recebidos]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (recebidos ?? []).filter(
      (r) =>
        (!dono || r.donoUsuarioId === dono) &&
        (acesso !== "ia" || r.usarIa) &&
        (acesso !== "admin" || r.administrar) &&
        (!q ||
          r.titulo.toLowerCase().includes(q) ||
          r.donoNome.toLowerCase().includes(q)),
    );
  }, [recebidos, busca, dono, acesso]);

  if (recebidos === null) {
    return (
      <div className="dark:text-dark-200 mt-6 flex items-center justify-center gap-3 py-16 text-sm text-gray-600">
        <Spinner className="size-5" />
        Carregando…
      </div>
    );
  }

  if (recebidos.length === 0) {
    return (
      <div className="dark:border-dark-600 mt-4 grid place-items-center rounded-xl border border-gray-200 px-6 py-14 text-center">
        <div className="max-w-sm">
          <h3 className="dark:text-dark-50 text-base font-semibold text-gray-800">
            Nada compartilhado com você
          </h3>
          <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
            Quando alguém compartilhar uma nota com você, ela aparece aqui —
            somente leitura, e só enquanto o acesso estiver valendo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título ou pessoa…"
            className="form-input dark:bg-dark-700 dark:border-dark-450 dark:text-dark-100 focus:border-primary-500 h-10 w-full rounded-lg border border-gray-300 bg-white pr-3 pl-10 text-sm focus:ring-0"
          />
        </div>
        <select
          value={dono}
          onChange={(e) => setDono(e.target.value)}
          aria-label="Filtrar por proprietário"
          className="form-select dark:bg-dark-700 dark:border-dark-450 dark:text-dark-100 h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:ring-0"
        >
          <option value="">Todos os proprietários</option>
          {donos.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
        <select
          value={acesso}
          onChange={(e) => setAcesso(e.target.value as typeof acesso)}
          aria-label="Filtrar por tipo de acesso"
          className="form-select dark:bg-dark-700 dark:border-dark-450 dark:text-dark-100 h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:ring-0"
        >
          <option value="">Qualquer acesso</option>
          <option value="ia">Usadas pela minha IA</option>
          <option value="admin">Que eu administro</option>
        </select>
      </div>

      <div className="dark:border-dark-600 mt-4 overflow-hidden rounded-xl border border-gray-200">
        <ul className="dark:divide-dark-600 dark:bg-dark-700 divide-y divide-gray-100 bg-white">
          {visiveis.map((r) => (
            <li key={r.vaultNotaId}>
              <button
                type="button"
                onClick={() => onAbrir(r)}
                className="dark:hover:bg-dark-600 flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-gray-50"
              >
                <span className="dark:bg-dark-600 dark:text-dark-200 grid size-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-500">
                  <DocumentTextIcon className="size-5 stroke-[1.5]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="dark:text-dark-100 block truncate text-sm font-medium text-gray-800">
                    {r.titulo}
                  </span>
                  <span className="dark:text-dark-300 text-tiny mt-0.5 block text-gray-400">
                    de {r.donoNome}
                    {r.viaTags.length > 0
                      ? ` · pela tag ${r.viaTags.map((t) => `#${t}`).join(", ")}`
                      : ""}
                    {r.expiraEm ? ` · expira em ${data(r.expiraEm)}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Badge variant="soft" color="neutral" className="text-tiny">
                    Ver
                  </Badge>
                  {r.usarIa && (
                    <Badge variant="soft" color="info" className="text-tiny">
                      IA
                    </Badge>
                  )}
                  {r.administrar && (
                    <Badge variant="soft" color="warning" className="text-tiny">
                      Administra
                    </Badge>
                  )}
                </span>
                <span className="dark:text-dark-300 text-tiny hidden w-24 shrink-0 text-end text-gray-400 sm:block">
                  {data(r.atualizadoEm)}
                </span>
              </button>
            </li>
          ))}
          {visiveis.length === 0 && (
            <li className="dark:text-dark-300 px-4 py-8 text-center text-sm text-gray-500">
              Nenhuma nota com esses filtros.
            </li>
          )}
        </ul>
      </div>
    </>
  );
}
