import clsx from "clsx";

// Alternância "Meus" × "Compartilhados comigo" do Repositório pessoal. Deixa
// claro o que é seu (privado por padrão) e o que outras pessoas abriram para
// você — e que um não se mistura com o outro.

export type AbaRepositorio = "meus" | "recebidos";

export function AbasRepositorio({
  aba,
  onChange,
}: {
  aba: AbaRepositorio;
  onChange: (aba: AbaRepositorio) => void;
}) {
  return (
    <div
      role="tablist"
      className="dark:bg-dark-800 text-xs-plus mt-5 inline-flex rounded-lg bg-gray-100 p-1"
    >
      {(
        [
          ["meus", "Meus"],
          ["recebidos", "Compartilhados comigo"],
        ] as const
      ).map(([k, rotulo]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={aba === k}
          onClick={() => onChange(k)}
          className={clsx(
            "rounded-md px-3 py-1.5 font-medium transition-colors",
            aba === k
              ? "dark:bg-dark-600 dark:text-dark-50 bg-white text-gray-800 shadow-sm"
              : "dark:text-dark-300 text-gray-500 hover:text-gray-700",
          )}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}
