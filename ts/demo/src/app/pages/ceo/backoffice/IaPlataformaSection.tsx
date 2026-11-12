/**
 * Backoffice → Modelos BeCulture.
 *
 * Catálogo ADMINISTRATIVO DEMONSTRATIVO: as chaves e os modelos que a BeCulture
 * disponibiliza aos usuários do B2C com modelos BeCulture. O que é cadastrado
 * aqui aparece para esses usuários em IA & API e no seletor de modelos.
 *
 * Visual: mesma anatomia da tela IA & API do BYOK — "Chaves de API" (lista
 * cinza, menu ⋮, modal de cadastro) e "Modelos e Prioridades" (uma seção por
 * modalidade, linhas "1 · Principal"). Especificações de plano ficam fora da
 * tela por ora: todo modelo ativo vale para todos os planos.
 *
 * As chaves daqui NÃO executam chamadas no protótipo — quem executa é a chave
 * de Backoffice → Configuração de API. Não se misturam com as chaves de
 * usuários (BYOK) ou de organizações (B2B).
 */

import {
  ArrowPathIcon,
  CheckCircleIcon,
  CpuChipIcon,
  EllipsisVerticalIcon,
  ExclamationTriangleIcon,
  PauseCircleIcon,
  PencilSquareIcon,
  PhotoIcon,
  PlayCircleIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import clsx from "clsx";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useModeloIa } from "@/app/contexts/modelo-ia/context";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Button } from "@/components/ui";
import type { AiModality, CatalogProvider } from "@/services/api/aiCredential";
import {
  backoffice,
  mensagemDeErro,
  type PlanoIa,
  type PlataformaCredencial,
  type PlataformaModelo,
} from "@/services/api/modalidade";

import { SectionCard } from "../configuracoes-ui";

/** Todo modelo vale para todos os planos (especificação por plano: depois). */
const TODOS_OS_PLANOS: PlanoIa[] = ["essencial", "pro"];

const MODALIDADES: {
  id: AiModality;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: "text", label: "Texto", icon: CpuChipIcon },
  { id: "image", label: "Imagem", icon: PhotoIcon },
  { id: "video", label: "Vídeo", icon: VideoCameraIcon },
];

const fieldCls =
  "dark:border-dark-450 dark:bg-dark-700 dark:text-dark-100 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm";

type Agir = (fn: () => Promise<unknown>, sucesso?: string) => Promise<boolean>;

export function IaPlataformaSection() {
  const [catalogo, setCatalogo] = useState<CatalogProvider[]>([]);
  const [creds, setCreds] = useState<PlataformaCredencial[] | null>(null);
  const [modelos, setModelos] = useState<PlataformaModelo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { recarregar: recarregarSeletor } = useModeloIa();

  const carregar = useCallback(
    () =>
      Promise.all([
        backoffice.catalogo(),
        backoffice.credenciais(),
        backoffice.modelos(),
      ])
        .then(([cat, c, m]) => {
          setCatalogo(cat);
          setCreds(c);
          setModelos(m);
          setErro(null);
        })
        .catch((e) => setErro(mensagemDeErro(e))),
    [],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Executa, recarrega tudo e atualiza o seletor de modelos do topo. */
  const agir: Agir = useCallback(
    async (fn, sucesso) => {
      let ok = true;
      try {
        const r = await fn();
        const a = (r as { aviso?: string } | undefined)?.aviso;
        setAviso(a ?? null);
        if (!a && sucesso) toast.success(sucesso);
      } catch (e) {
        ok = false;
        setAviso(mensagemDeErro(e));
      }
      await carregar();
      recarregarSeletor();
      return ok;
    },
    [carregar, recarregarSeletor],
  );

  return (
    <SectionCard
      titulo="Modelos BeCulture"
      descricao="Chaves e modelos que a BeCulture disponibiliza aos usuários dos planos B2C com modelos BeCulture. O que estiver ativo aqui aparece para esses usuários em IA & API e no seletor de modelos."
    >
      {erro ? (
        <div className="bg-error/10 flex items-start gap-2 rounded-xl px-4 py-3">
          <ExclamationTriangleIcon className="text-error mt-0.5 size-4 shrink-0" />
          <p className="dark:text-dark-200 flex-1 text-xs text-gray-600">
            {erro}
          </p>
          <button
            type="button"
            onClick={() => void carregar()}
            className="text-primary-600 dark:text-primary-400 shrink-0 text-xs hover:underline"
          >
            Tentar de novo
          </button>
        </div>
      ) : !creds ? (
        <p className="dark:text-dark-300 text-sm text-gray-400">Carregando…</p>
      ) : (
        <>
          <ChavesDaPlataforma
            creds={creds}
            catalogo={catalogo}
            agir={agir}
            aviso={aviso}
            onFecharAviso={() => setAviso(null)}
          />
          <ModelosEPrioridades
            modelos={modelos}
            creds={creds}
            catalogo={catalogo}
            agir={agir}
          />
        </>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Chaves de API

function ChavesDaPlataforma({
  creds,
  catalogo,
  agir,
  aviso,
  onFecharAviso,
}: {
  creds: PlataformaCredencial[];
  catalogo: CatalogProvider[];
  agir: Agir;
  aviso: string | null;
  onFecharAviso: () => void;
}) {
  const [modal, setModal] = useState<{ editar?: PlataformaCredencial } | null>(
    null,
  );
  const [remover, setRemover] = useState<PlataformaCredencial | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const executar = async (
    id: string,
    fn: () => Promise<unknown>,
    ok?: string,
  ) => {
    setOcupado(id);
    await agir(fn, ok);
    setOcupado(null);
  };

  return (
    <section>
      <h4 className="dark:text-dark-100 text-sm font-semibold text-gray-800">
        Chaves de API
      </h4>
      <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
        Conecte os provedores de IA que a BeCulture oferece aos usuários. As
        chaves são armazenadas de forma segura e nunca são exibidas por
        completo.
      </p>

      {aviso && (
        <div className="bg-warning/10 mt-4 flex items-start gap-2 rounded-xl px-4 py-3">
          <ExclamationTriangleIcon className="text-warning mt-0.5 size-4 shrink-0" />
          <p className="dark:text-dark-200 flex-1 text-xs text-gray-600">
            {aviso}
          </p>
          <button
            type="button"
            onClick={onFecharAviso}
            className="dark:text-dark-300 shrink-0 text-xs text-gray-400 hover:underline"
          >
            Ok
          </button>
        </div>
      )}

      {creds.length === 0 ? (
        <Button
          variant="outlined"
          color="primary"
          className="mt-4 gap-1.5"
          onClick={() => setModal({})}
        >
          <PlusIcon className="size-4" />
          Adicionar chave de API
        </Button>
      ) : (
        <>
          <ul className="dark:divide-dark-500 dark:border-dark-500 dark:bg-dark-600 mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50">
            {creds.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="dark:text-dark-100 text-sm font-medium text-gray-800">
                    {c.providerNome}
                    {c.nome && (
                      <span className="dark:text-dark-300 font-normal text-gray-500">
                        {" "}
                        · {c.nome}
                      </span>
                    )}
                  </p>
                  <p className="dark:text-dark-300 mt-0.5 text-xs text-gray-400">
                    ••••{c.keyLast4}
                    <span className="mx-1.5">·</span>
                    {c.modelCount === 0
                      ? "nenhum modelo conectado"
                      : `${c.modelCount} ${c.modelCount === 1 ? "modelo conectado" : "modelos conectados"}`}
                  </p>
                </div>
                {c.status === "invalida" ? (
                  <span className="bg-warning/10 text-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                    <ExclamationTriangleIcon className="size-3.5" />
                    chave recusada
                  </span>
                ) : (
                  !c.validatedAt && (
                    <span
                      title="A chave foi salva, mas o provedor não confirmou que ela funciona."
                      className="dark:bg-dark-500 dark:text-dark-200 inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500"
                    >
                      não verificada
                    </span>
                  )
                )}
                {!c.ativa && (
                  <span className="dark:bg-dark-500 dark:text-dark-200 inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">
                    desativada
                  </span>
                )}
                <MenuAcoes
                  rotulo="Ações da chave"
                  ocupado={ocupado === c.id}
                  itens={[
                    {
                      label: "Editar",
                      icon: PencilSquareIcon,
                      onClick: () => setModal({ editar: c }),
                    },
                    {
                      label: "Revalidar",
                      icon: ArrowPathIcon,
                      onClick: () =>
                        void executar(
                          c.id,
                          () => backoffice.revalidarCredencial(c.id),
                          "Chave confirmada pelo provedor.",
                        ),
                    },
                    {
                      label: c.ativa ? "Desativar" : "Ativar",
                      icon: c.ativa ? PauseCircleIcon : PlayCircleIcon,
                      onClick: () =>
                        void executar(c.id, () =>
                          backoffice.atualizarCredencial(c.id, {
                            ativa: !c.ativa,
                          }),
                        ),
                    },
                    {
                      label: "Remover",
                      icon: TrashIcon,
                      perigo: true,
                      onClick: () => setRemover(c),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
          <Button
            variant="outlined"
            color="primary"
            className="mt-3 h-8 gap-1.5 text-xs"
            onClick={() => setModal({})}
          >
            <PlusIcon className="size-4" />
            Adicionar chave
          </Button>
        </>
      )}

      <ModalChave
        key={modal ? (modal.editar?.id ?? "nova") : "fechado"}
        aberto={!!modal}
        editar={modal?.editar}
        catalogo={catalogo}
        onClose={() => setModal(null)}
        onSalvar={async (fn) => {
          const ok = await agir(fn, "Chave salva.");
          if (ok) setModal(null);
          return ok;
        }}
      />

      <ConfirmModal
        show={!!remover}
        onClose={() => {
          if (!removendo) setRemover(null);
        }}
        onOk={async () => {
          if (!remover) return;
          setRemovendo(true);
          await agir(
            () => backoffice.removerCredencial(remover.id),
            "Chave removida.",
          );
          setRemovendo(false);
          setRemover(null);
        }}
        confirmLoading={removendo}
        state="pending"
        messages={{
          pending: {
            title: "Remover esta chave?",
            description:
              "Os modelos que usam esta chave deixam de aparecer para os usuários.",
            actionText: "Remover",
          },
        }}
      />
    </section>
  );
}

/** Mesmo modal "Adicionar chave de API" do BYOK, com provedor livre. */
function ModalChave({
  aberto,
  editar,
  catalogo,
  onClose,
  onSalvar,
}: {
  aberto: boolean;
  editar?: PlataformaCredencial;
  catalogo: CatalogProvider[];
  onClose: () => void;
  onSalvar: (fn: () => Promise<unknown>) => Promise<boolean>;
}) {
  const OUTRO = "__outro__";
  const [provider, setProvider] = useState(catalogo[0]?.id ?? "");
  const [nomeProvedor, setNomeProvedor] = useState(
    editar?.demonstrativo ? editar.providerNome : "",
  );
  const [nome, setNome] = useState(editar?.nome ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerAtual = provider || catalogo[0]?.id || "";
  const livre = providerAtual === OUTRO;

  const salvar = async () => {
    setError(null);
    if (!editar && apiKey.trim().length < 8) {
      setError("Cole a chave de API do provedor.");
      return;
    }
    if (!editar && livre && nomeProvedor.trim().length < 2) {
      setError("Informe o nome do provedor.");
      return;
    }
    setSaving(true);
    await onSalvar(() =>
      editar
        ? backoffice.atualizarCredencial(editar.id, {
            nome,
            nomeProvedor: editar.demonstrativo ? nomeProvedor : undefined,
            apiKey: apiKey.trim() || undefined,
          })
        : backoffice.criarCredencial({
            ...(livre
              ? { nomeProvedor: nomeProvedor.trim() }
              : { provider: providerAtual }),
            apiKey: apiKey.trim(),
            nome: nome.trim() || undefined,
          }),
    );
    setSaving(false);
  };

  return (
    <Transition appear show={aberto} as={Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-100 flex flex-col items-center justify-center overflow-hidden px-4 py-6 sm:px-5"
        onClose={() => {
          if (!saving) onClose();
        }}
      >
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="absolute inset-0 bg-gray-900/50 transition-opacity dark:bg-black/40" />
        </TransitionChild>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <DialogPanel className="scrollbar-sm dark:bg-dark-700 relative w-full max-w-md overflow-y-auto rounded-lg bg-white px-5 py-6">
            <DialogTitle className="dark:text-dark-100 text-base font-semibold text-gray-800">
              {editar ? "Editar chave de API" : "Adicionar chave de API"}
            </DialogTitle>
            <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
              A chave é criptografada no servidor e nunca é exibida por completo
              depois de salva.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
                  Provedor
                </span>
                {editar ? (
                  <input
                    className={clsx("form-input", fieldCls)}
                    value={editar.providerNome}
                    disabled
                  />
                ) : (
                  <select
                    value={providerAtual}
                    onChange={(e) => setProvider(e.target.value)}
                    className={clsx("form-select", fieldCls)}
                  >
                    {catalogo.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value={OUTRO}>Outro provedor…</option>
                  </select>
                )}
              </label>
              {(livre || editar?.demonstrativo) && (
                <label className="block text-sm">
                  <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
                    Nome do provedor
                  </span>
                  <input
                    value={nomeProvedor}
                    onChange={(e) => setNomeProvedor(e.target.value)}
                    maxLength={80}
                    placeholder="Ex.: Mistral"
                    className={clsx("form-input", fieldCls)}
                  />
                </label>
              )}
              <label className="block text-sm">
                <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
                  Nome da conexão
                  <span className="ml-1 font-normal text-gray-400">
                    (opcional)
                  </span>
                </span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={80}
                  placeholder="Produção"
                  className={clsx("form-input", fieldCls)}
                />
              </label>
              <label className="block text-sm">
                <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
                  {editar ? "Nova chave de API" : "Chave de API"}
                  {editar && (
                    <span className="ml-1 font-normal text-gray-400">
                      (deixe vazio para manter a atual)
                    </span>
                  )}
                </span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-••••••••••••"
                  autoComplete="off"
                  className={clsx("form-input", fieldCls)}
                />
              </label>
            </div>

            {error && <p className="text-error mt-3 text-sm">{error}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="outlined" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button
                color="primary"
                onClick={() => void salvar()}
                disabled={saving}
              >
                {saving ? "Salvando…" : editar ? "Salvar" : "Adicionar chave"}
              </Button>
            </div>
            <p className="dark:text-dark-300 mt-3 inline-flex items-center gap-1 text-xs text-gray-400">
              <ShieldCheckIcon className="size-4" />
              Chave criptografada no servidor
            </p>
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}

// ---------------------------------------------------------------------------
// Modelos e Prioridades

function ModelosEPrioridades({
  modelos,
  creds,
  catalogo,
  agir,
}: {
  modelos: PlataformaModelo[];
  creds: PlataformaCredencial[];
  catalogo: CatalogProvider[];
  agir: Agir;
}) {
  return (
    <div className="mt-12">
      <h4 className="dark:text-dark-100 text-sm font-semibold text-gray-800">
        Modelos e Prioridades
      </h4>
      <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
        Escolha quais modelos os usuários terão em cada modalidade e em que
        ordem devem ser usados.
        {creds.length === 0 &&
          " Adicione uma chave de API para começar a configurar os modelos."}
      </p>
      <div className="dark:divide-dark-500 mt-4 divide-y divide-gray-200">
        {MODALIDADES.map((m) => (
          <section key={m.id} className="py-5 first:pt-0 last:pb-0">
            <PainelModalidade
              modalidade={m}
              modelos={modelos.filter((x) => x.kind === m.id)}
              creds={creds}
              catalogo={catalogo}
              agir={agir}
            />
          </section>
        ))}
      </div>
    </div>
  );
}

function PainelModalidade({
  modalidade,
  modelos,
  creds,
  catalogo,
  agir,
}: {
  modalidade: (typeof MODALIDADES)[number];
  modelos: PlataformaModelo[];
  creds: PlataformaCredencial[];
  catalogo: CatalogProvider[];
  agir: Agir;
}) {
  const [formAberto, setFormAberto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Chaves cujo provedor atende a modalidade (livres: qualquer uma).
  const credsDaModalidade = creds.filter((c) => {
    const p = catalogo.find((x) => x.id === c.provider);
    return !p || p.modalities.includes(modalidade.id);
  });
  const ativos = modelos.filter((x) => x.ativo && x.credencialOk);

  const executar = async (
    id: string,
    fn: () => Promise<unknown>,
    ok?: string,
  ) => {
    setOcupado(id);
    await agir(fn, ok);
    setOcupado(null);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400 grid size-7 shrink-0 place-items-center rounded-lg">
          <modalidade.icon className="size-4.5" />
        </span>
        <h4 className="dark:text-dark-100 text-sm font-semibold text-gray-800">
          {modalidade.label}
        </h4>
        {ativos.length > 0 && (
          <span className="bg-success/10 text-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
            <CheckCircleIcon className="size-3.5" />
            Conectado
            {ativos.length > 1 && ` · ${ativos.length} modelos`}
          </span>
        )}
      </div>

      {creds.length > 0 && (
        <div className="mt-4">
          {modelos.length > 0 ? (
            <ul className="dark:divide-dark-500 dark:border-dark-500 dark:bg-dark-600 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50">
              {modelos.map((x, i) => (
                <li
                  key={x.id}
                  className={clsx(
                    "relative flex flex-wrap items-center gap-3 px-3 py-2.5",
                    !x.ativo && "opacity-60",
                  )}
                >
                  <span
                    className={clsx(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      i === 0
                        ? "bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400"
                        : "dark:bg-dark-500 dark:text-dark-200 bg-gray-200 text-gray-600",
                    )}
                  >
                    {i === 0 ? "1 · Principal" : i + 1}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="dark:text-dark-100 font-medium text-gray-700">
                      {x.rotulo}
                    </span>
                    <span className="dark:text-dark-300 ml-2 text-gray-400">
                      {x.providerNome}
                    </span>
                  </div>
                  {!x.ativo && (
                    <span className="dark:bg-dark-500 dark:text-dark-200 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">
                      desativado
                    </span>
                  )}
                  <MenuAcoes
                    rotulo={`Ações de ${x.rotulo}`}
                    ocupado={ocupado === x.id}
                    itens={[
                      {
                        label: "Editar",
                        icon: PencilSquareIcon,
                        onClick: () => {
                          const rotulo = window.prompt(
                            "Nome do modelo:",
                            x.rotulo,
                          );
                          if (rotulo === null) return;
                          const model = window.prompt(
                            "Identificação técnica (ID do modelo no provedor):",
                            x.model,
                          );
                          if (model === null) return;
                          void executar(
                            x.id,
                            () =>
                              backoffice.atualizarModelo(x.id, {
                                rotulo,
                                model,
                              }),
                            "Modelo atualizado.",
                          );
                        },
                      },
                      {
                        label: x.ativo ? "Desativar" : "Ativar",
                        icon: x.ativo ? PauseCircleIcon : PlayCircleIcon,
                        onClick: () =>
                          void executar(x.id, () =>
                            backoffice.atualizarModelo(x.id, {
                              ativo: !x.ativo,
                            }),
                          ),
                      },
                      {
                        label: "Remover",
                        icon: TrashIcon,
                        perigo: true,
                        onClick: () =>
                          void executar(
                            x.id,
                            () => backoffice.removerModelo(x.id),
                            "Modelo removido.",
                          ),
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          ) : (
            !formAberto && (
              <div className="dark:border-dark-500 dark:bg-dark-600 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
                <p className="dark:text-dark-100 text-sm font-medium text-gray-700">
                  Nenhum modelo configurado
                </p>
                <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
                  Adicione um modelo para disponibilizar esta modalidade aos
                  usuários.
                </p>
              </div>
            )
          )}

          {formAberto ? (
            <NovoModelo
              modalidade={modalidade.id}
              creds={credsDaModalidade}
              catalogo={catalogo}
              jaCadastrados={modelos}
              onCancelar={() => setFormAberto(false)}
              onAdicionar={async (input) => {
                const ok = await agir(
                  () =>
                    backoffice.criarModelo({
                      ...input,
                      kind: modalidade.id,
                      planos: TODOS_OS_PLANOS,
                    }),
                  "Modelo adicionado.",
                );
                if (ok) setFormAberto(false);
              }}
            />
          ) : (
            <Button
              variant="outlined"
              color="primary"
              className="mt-3 h-8 gap-1.5 text-xs"
              onClick={() => setFormAberto(true)}
              disabled={credsDaModalidade.length === 0}
              title={
                credsDaModalidade.length === 0
                  ? "Nenhuma chave cadastrada atende esta modalidade."
                  : undefined
              }
            >
              <PlusIcon className="size-4" />
              {modelos.length > 0 ? "Adicionar modelo" : "Configurar modelos"}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/** Mesmo painel inline de "Adicionar modelo" do BYOK (+ ID livre). */
function NovoModelo({
  modalidade,
  creds,
  catalogo,
  jaCadastrados,
  onCancelar,
  onAdicionar,
}: {
  modalidade: AiModality;
  creds: PlataformaCredencial[];
  catalogo: CatalogProvider[];
  jaCadastrados: PlataformaModelo[];
  onCancelar: () => void;
  onAdicionar: (input: {
    credencialId: string;
    model: string;
    rotulo?: string;
  }) => Promise<void>;
}) {
  const OUTRO = "__outro__";
  const [credencialId, setCredencialId] = useState(creds[0]?.id ?? "");
  const [escolhido, setEscolhido] = useState("");
  const [idLivre, setIdLivre] = useState("");
  const [nomeLivre, setNomeLivre] = useState("");
  const [salvando, setSalvando] = useState(false);

  const cred = creds.find((c) => c.id === credencialId) ?? creds[0];
  const opcoes = (
    catalogo
      .find((p) => p.id === cred?.provider)
      ?.models.filter((m) => m.modality === modalidade) ?? []
  ).filter(
    (m) =>
      !jaCadastrados.some(
        (j) => j.credencialId === cred?.id && j.model === m.id,
      ),
  );
  const modeloAtual =
    escolhido === OUTRO || opcoes.some((o) => o.id === escolhido)
      ? escolhido
      : (opcoes[0]?.id ?? OUTRO);
  const livre = modeloAtual === OUTRO;
  const idFinal = livre ? idLivre.trim() : modeloAtual;

  return (
    <div className="dark:border-dark-500 dark:bg-dark-600 mt-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
            Conexão
          </span>
          <select
            value={cred?.id ?? ""}
            onChange={(e) => setCredencialId(e.target.value)}
            className={clsx("form-select", fieldCls)}
          >
            {creds.map((c) => (
              <option key={c.id} value={c.id}>
                {c.providerNome}
                {c.nome ? ` · ${c.nome}` : ""} (••••{c.keyLast4})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
            Modelo
          </span>
          <select
            value={modeloAtual}
            onChange={(e) => setEscolhido(e.target.value)}
            className={clsx("form-select", fieldCls)}
          >
            {opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value={OUTRO}>Outro modelo…</option>
          </select>
        </label>
      </div>
      {livre && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            aria-label="ID técnico do modelo"
            value={idLivre}
            onChange={(e) => setIdLivre(e.target.value)}
            maxLength={120}
            placeholder="ID técnico (ex.: mistral-large-2)"
            className={clsx("form-input", fieldCls)}
          />
          <input
            aria-label="Nome do modelo"
            value={nomeLivre}
            onChange={(e) => setNomeLivre(e.target.value)}
            maxLength={80}
            placeholder="Nome de exibição"
            className={clsx("form-input", fieldCls)}
          />
        </div>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          variant="outlined"
          className="h-8 text-xs"
          onClick={onCancelar}
          disabled={salvando}
        >
          Cancelar
        </Button>
        <Button
          color="primary"
          className="h-8 text-xs"
          disabled={!cred || !idFinal || salvando}
          onClick={async () => {
            setSalvando(true);
            await onAdicionar({
              credencialId: cred!.id,
              model: idFinal,
              rotulo: livre ? nomeLivre.trim() || undefined : undefined,
            });
            setSalvando(false);
          }}
        >
          {salvando ? "Adicionando…" : "Adicionar modelo"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MenuAcoes({
  rotulo,
  ocupado,
  itens,
}: {
  rotulo: string;
  ocupado: boolean;
  itens: {
    label: string;
    icon: React.ElementType;
    onClick: () => void;
    perigo?: boolean;
  }[];
}) {
  return (
    <Menu as="div" className="relative shrink-0">
      <MenuButton
        aria-label={rotulo}
        disabled={ocupado}
        className="dark:text-dark-300 dark:hover:bg-dark-500 dark:hover:text-dark-100 grid size-7 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      >
        {ocupado ? (
          <ArrowPathIcon className="size-4 animate-spin" />
        ) : (
          <EllipsisVerticalIcon className="size-5" />
        )}
      </MenuButton>
      <Transition
        as={MenuItems}
        anchor={{ to: "bottom end", gap: 4 }}
        enter="transition ease-out duration-100"
        enterFrom="opacity-0 translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-in duration-75"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-1"
        className="dark:bg-dark-750 dark:border-dark-500 z-100 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg shadow-gray-200/60 outline-hidden dark:shadow-none"
      >
        {itens.map((it) => (
          <MenuItem key={it.label}>
            {({ focus }) => (
              <button
                type="button"
                onClick={it.onClick}
                className={clsx(
                  "flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm transition-colors",
                  it.perigo
                    ? clsx(
                        "this:error text-this dark:text-this-light",
                        focus && "bg-this/10 dark:bg-this-light/10",
                      )
                    : clsx(
                        "dark:text-dark-100 text-gray-700",
                        focus && "dark:bg-dark-600 bg-gray-100",
                      ),
                )}
              >
                <it.icon className="size-4" />
                {it.label}
              </button>
            )}
          </MenuItem>
        ))}
      </Transition>
    </Menu>
  );
}
