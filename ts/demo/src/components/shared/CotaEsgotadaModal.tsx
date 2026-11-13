/**
 * Aviso de cota BeCulture esgotada (B2C), aberto por `avisarCotaEsgotada`
 * (interceptor do axios e chat em streaming). Montado uma vez nos providers
 * da conta, fora do RouterProvider — por isso navega pelo `router`.
 *
 * Alternativas, sempre explícitas (a plataforma NUNCA passa sozinha para as
 * chaves do usuário):
 *   - Fazer upgrade → página de apresentação dos planos
 *   - Sem chave própria → ir para IA & API cadastrar uma
 *   - Com chave própria → autorizar o uso dela até a cota renovar
 */

import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  ArrowUpCircleIcon,
  ExclamationTriangleIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState, type ElementType, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui";
import { getProductCodeFromPath } from "@/app/navigation/ceoOs";
import router from "@/app/router/router";
import {
  autorizarByokAposCota,
  mensagemDeErro,
} from "@/services/api/modalidade";
import {
  EVENTO_CONTA_IA_ALTERADA,
  EVENTO_COTA_ESGOTADA,
  type DetalheCotaEsgotada,
} from "@/utils/cotaEsgotada";

export function CotaEsgotadaModal() {
  const [aviso, setAviso] = useState<DetalheCotaEsgotada | null>(null);
  const [autorizando, setAutorizando] = useState(false);

  useEffect(() => {
    const ouvir = (e: Event) =>
      setAviso((e as CustomEvent<DetalheCotaEsgotada>).detail);
    window.addEventListener(EVENTO_COTA_ESGOTADA, ouvir);
    return () => window.removeEventListener(EVENTO_COTA_ESGOTADA, ouvir);
  }, []);

  const fechar = () => {
    if (!autorizando) setAviso(null);
  };
  const ir = (destino: string) => {
    const produto = getProductCodeFromPath(router.state.location.pathname);
    setAviso(null);
    void router.navigate(`/${produto}/${destino}`);
  };
  const renova = aviso?.renovaEm
    ? new Date(aviso.renovaEm).toLocaleDateString("pt-BR")
    : null;

  const autorizar = async () => {
    setAutorizando(true);
    try {
      const r = await autorizarByokAposCota();
      const ate = r.byokAposCota?.ate
        ? new Date(r.byokAposCota.ate).toLocaleDateString("pt-BR")
        : renova;
      window.dispatchEvent(new Event(EVENTO_CONTA_IA_ALTERADA));
      toast.success(
        `Pronto: até ${ate ?? "a cota renovar"}, o uso segue pelas suas chaves. Envie de novo o que você pediu.`,
      );
      setAviso(null);
    } catch (err) {
      toast.error(mensagemDeErro(err));
    } finally {
      setAutorizando(false);
    }
  };

  return (
    <Transition
      appear
      show={!!aviso}
      as={Dialog}
      onClose={fechar}
      className="fixed inset-0 z-100 flex flex-col items-center justify-center overflow-hidden px-4 py-6 sm:px-5"
    >
      <TransitionChild
        as="div"
        enter="ease-out duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="ease-in duration-200"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        className="absolute inset-0 bg-gray-900/50 transition-opacity dark:bg-black/40"
      />
      <TransitionChild
        as={DialogPanel}
        enter="ease-out duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="ease-in duration-200"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        className="scrollbar-sm dark:bg-dark-700 relative flex w-full max-w-lg flex-col overflow-y-auto rounded-lg bg-white px-5 py-6 transition-opacity duration-300"
      >
        <div className="flex items-start gap-3">
          <span className="bg-warning/10 text-warning grid size-10 shrink-0 place-items-center rounded-lg">
            <ExclamationTriangleIcon className="size-5.5" />
          </span>
          <div className="min-w-0">
            <DialogTitle
              as="h3"
              className="dark:text-dark-100 text-base font-semibold text-gray-800"
            >
              A cota de IA do seu plano acabou
            </DialogTitle>
            <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
              Você usou toda a cota de modelos BeCulture deste ciclo
              {renova ? `; ela renova em ${renova}` : ""}. Para continuar
              agora, escolha uma opção:
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <Opcao
            icon={ArrowUpCircleIcon}
            titulo="Fazer upgrade do plano"
            descricao="Conheça os planos com cota maior de modelos BeCulture."
            acao={
              <Button
                color="primary"
                className="h-8 text-xs"
                onClick={() => ir("planos")}
              >
                Ver planos
              </Button>
            }
          />
          {aviso?.temChavePropria ? (
            <Opcao
              icon={KeyIcon}
              titulo="Usar minhas chaves até a cota renovar"
              descricao="Você já tem chaves em IA & API. Ao autorizar, o consumo passa a ser cobrado pelo provedor na sua chave — não na cota. Dá para revogar em Configurações."
              acao={
                <Button
                  variant="outlined"
                  className="h-8 text-xs"
                  disabled={autorizando}
                  onClick={() => void autorizar()}
                >
                  {autorizando ? "Autorizando…" : "Autorizar"}
                </Button>
              }
            />
          ) : (
            <Opcao
              icon={KeyIcon}
              titulo="Usar minha própria chave de API"
              descricao="Em IA & API você cadastra sua chave (OpenAI, Anthropic…). O consumo nela é cobrado pelo provedor, direto a você. Depois, autorize o uso dela quando a cota acabar."
              acao={
                <Button
                  variant="outlined"
                  className="h-8 text-xs"
                  onClick={() => ir("configuracoes?secao=ia")}
                >
                  Ir para IA & API
                </Button>
              }
            />
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="flat" disabled={autorizando} onClick={fechar}>
            Agora não
          </Button>
        </div>
      </TransitionChild>
    </Transition>
  );
}

function Opcao({
  icon: Icon,
  titulo,
  descricao,
  acao,
}: {
  icon: ElementType;
  titulo: string;
  descricao: string;
  acao: ReactNode;
}) {
  return (
    <div className="dark:border-dark-500 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 sm:flex-nowrap">
      <Icon className="text-primary-600 dark:text-primary-400 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="dark:text-dark-100 text-sm font-medium text-gray-800">
          {titulo}
        </p>
        <p className="dark:text-dark-300 mt-0.5 text-xs text-gray-500">
          {descricao}
        </p>
      </div>
      <div className="shrink-0">{acao}</div>
    </div>
  );
}
