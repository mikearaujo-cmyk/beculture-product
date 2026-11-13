/**
 * Planos (B2C) — apresentação neutra dos planos, destino do "Fazer upgrade"
 * do aviso de cota esgotada.
 *
 * Sem preços nem condições comerciais (ainda não definidos): mostra o que
 * cada plano inclui e marca o atual. O CTA só registra o interesse; a troca
 * de plano no protótipo é feita em Backoffice → Conta em demonstração.
 */

import { CheckCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { toast } from "sonner";

import { Page } from "@/components/shared/Page";
import { PageTitle } from "@/components/shared/PageTitle";
import { Badge, Button } from "@/components/ui";
import { PLANOS_B2C } from "@/app/pages/prototypes/contas/model/planoEscolhido";
import { useResumoContaIa, type PlanoIa } from "@/services/api/modalidade";

const INCLUI: Record<PlanoIa, string[]> = {
  essencial: [
    "Todos os modelos BeCulture e o Automático no seletor do topo",
    "Cota de tokens de entrada por ciclo",
    "Chaves próprias opcionais em IA & API",
  ],
  pro: [
    "Todos os modelos BeCulture e o Automático no seletor do topo",
    "Cota de tokens maior que a do Essencial",
    "Chaves próprias opcionais em IA & API",
  ],
};

export default function PlanosIa() {
  const { resumo, carregando } = useResumoContaIa();
  const b2c = resumo?.modalidade === "beculture";
  const atual = b2c ? resumo?.planoIa : null;

  return (
    <Page title="Planos">
      <div className="transition-content w-full px-(--margin-x) py-6">
        <PageTitle>Planos</PageTitle>
        <p className="dark:text-dark-300 mt-1 max-w-2xl text-sm text-gray-500">
          Os planos B2C diferem na cota de uso dos modelos BeCulture. Em todos,
          você pode cadastrar suas próprias chaves de API para continuar quando
          a cota acabar.
        </p>

        {!carregando && resumo && !b2c ? (
          <p className="dark:border-dark-500 dark:text-dark-200 mt-6 max-w-2xl rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600">
            Sua conta não é B2C: os planos com cota de modelos BeCulture não se
            aplicam a ela.
          </p>
        ) : (
          <div className="mt-6 grid max-w-3xl gap-4 md:grid-cols-2">
            {PLANOS_B2C.map((p) => {
              const ehAtual = atual === p.id;
              return (
                <div
                  key={p.id}
                  className={clsx(
                    "flex flex-col rounded-lg border p-5",
                    ehAtual
                      ? "border-primary-600 bg-primary-600/5 dark:border-primary-400 dark:bg-primary-400/10"
                      : "dark:border-dark-500 border-gray-200",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="bg-primary-600/10 text-primary-600 dark:text-primary-400 grid size-10 place-items-center rounded-lg">
                      <SparklesIcon className="size-5.5 stroke-[1.6]" />
                    </span>
                    {ehAtual && (
                      <Badge color="primary" variant="soft">
                        Plano atual
                      </Badge>
                    )}
                  </div>
                  <h3 className="dark:text-dark-50 mt-3 text-base font-semibold text-gray-800">
                    {p.titulo}
                  </h3>
                  <p className="dark:text-dark-300 mt-0.5 text-sm text-gray-500">
                    {p.descricao}
                  </p>
                  <ul className="mt-4 flex-1 space-y-1.5">
                    {INCLUI[p.id].map((d) => (
                      <li
                        key={d}
                        className="dark:text-dark-200 flex gap-1.5 text-xs text-gray-600"
                      >
                        <CheckCircleIcon className="text-success mt-px size-4 shrink-0" />
                        {d}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-5"
                    color={ehAtual ? "neutral" : "primary"}
                    disabled={ehAtual}
                    onClick={() =>
                      toast.success(
                        `Interesse no plano ${p.titulo} registrado. As condições de upgrade ainda serão definidas pela BeCulture.`,
                      )
                    }
                  >
                    {ehAtual ? "Seu plano" : "Quero este plano"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <p className="dark:text-dark-300 mt-4 max-w-2xl text-xs text-gray-400">
          Protótipo: valores de cota, preços e condições de upgrade ainda não
          foram definidos. Para simular a troca de plano, use Backoffice →
          Conta em demonstração.
        </p>
      </div>
    </Page>
  );
}
