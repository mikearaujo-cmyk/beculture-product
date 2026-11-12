/**
 * Backoffice → Configuração de API.
 *
 * A chave OPERACIONAL real do protótipo: é ela que executa as chamadas de IA
 * da infraestrutura atual (texto, imagem, áudio e vídeo) quando a conta não
 * usa chave própria. Não é um plano, não é chave BYOK/B2B e não entra no
 * catálogo "Modelos BeCulture" — e mudar uma não altera a outra.
 *
 * Visual: mesma anatomia da tela IA & API do BYOK ("Chaves de API" em lista
 * cinza com menu ⋮, botão "Adicionar chave" com modal, e uma seção de modelos
 * no padrão de "Modelos e Prioridades").
 *
 * A chave nunca volta do servidor: só os 4 últimos dígitos.
 */

import {
  ArrowPathIcon,
  CheckCircleIcon,
  CpuChipIcon,
  EllipsisVerticalIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
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
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Button } from "@/components/ui";
import {
  getAiProviders,
  PROVEDORES_PADRAO,
  type CatalogProvider,
} from "@/services/api/aiCredential";
import {
  apiOperacional,
  mensagemDeErro,
  type ChaveOperacional,
  type ProvedorOperacional,
} from "@/services/api/modalidade";

import { SectionCard } from "../configuracoes-ui";

const fieldCls =
  "dark:border-dark-450 dark:bg-dark-700 dark:text-dark-100 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm";

/** Modelos de texto do catálogo para o provedor (vazio = sem modelo padrão). */
function modelosTexto(catalogo: CatalogProvider[], provider: string) {
  return (
    catalogo
      .find((p) => p.id === provider)
      ?.models.filter((m) => m.modality === "text") ?? []
  );
}

export function ConfiguracaoApiSection() {
  const [chaves, setChaves] = useState<ChaveOperacional[] | null>(null);
  const [catalogo, setCatalogo] =
    useState<CatalogProvider[]>(PROVEDORES_PADRAO);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  // Modal de cadastro/edição: `null` fechado; `provider` preenchido = editar.
  const [modal, setModal] = useState<{ provider?: ProvedorOperacional } | null>(
    null,
  );
  const [remover, setRemover] = useState<ChaveOperacional | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    apiOperacional
      .listar()
      .then((l) => {
        if (vivo) {
          setChaves(l);
          setErro(null);
        }
      })
      .catch((e) => vivo && setErro(mensagemDeErro(e)));
    void getAiProviders().then((c) => vivo && setCatalogo(c));
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  const substituir = (c: ChaveOperacional) => {
    setChaves((prev) =>
      prev ? prev.map((x) => (x.provider === c.provider ? c : x)) : prev,
    );
    setAviso(c.aviso ?? null);
  };

  const testar = async (c: ChaveOperacional) => {
    setOcupado(c.provider);
    try {
      const r = await apiOperacional.testar(c.provider);
      substituir(r);
      if (!r.aviso) toast.success("Conexão confirmada pelo provedor.");
    } catch (e) {
      setAviso(mensagemDeErro(e));
    } finally {
      setOcupado(null);
    }
  };

  const confirmarRemocao = async () => {
    if (!remover) return;
    setRemovendo(true);
    try {
      substituir(await apiOperacional.remover(remover.provider));
      setRemover(null);
    } catch (e) {
      setAviso(mensagemDeErro(e));
    } finally {
      setRemovendo(false);
    }
  };

  // Só aparecem na lista as chaves em uso (Backoffice ou .env do servidor).
  const configuradas = chaves?.filter((c) => c.fonte !== "nenhuma") ?? [];
  const livres = chaves?.filter((c) => c.fonte !== "backoffice") ?? [];
  const comTexto = configuradas.filter(
    (c) => modelosTexto(catalogo, c.provider).length > 0,
  );

  return (
    <SectionCard
      titulo="Configuração de API"
      descricao="Chave real usada pela infraestrutura de execução de IA do protótipo. Não é um plano, nem chave de usuário (BYOK) ou de organização (B2B), e não altera o catálogo de Modelos BeCulture."
    >
      {/* Mesma seção "Chaves de API" do BYOK. */}
      <section>
        <h4 className="dark:text-dark-100 text-sm font-semibold text-gray-800">
          Chaves de API
        </h4>
        <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
          Conecte os provedores que executam as chamadas do protótipo. As chaves
          são armazenadas de forma segura e nunca são exibidas por completo. Sem
          chave cadastrada aqui, vale a do servidor (.env), se existir.
        </p>

        {aviso && (
          <div className="bg-warning/10 mt-4 flex items-start gap-2 rounded-xl px-4 py-3">
            <ExclamationTriangleIcon className="text-warning mt-0.5 size-4 shrink-0" />
            <p className="dark:text-dark-200 flex-1 text-xs text-gray-600">
              {aviso}
            </p>
            <button
              type="button"
              onClick={() => setAviso(null)}
              className="dark:text-dark-300 shrink-0 text-xs text-gray-400 hover:underline"
            >
              Ok
            </button>
          </div>
        )}

        {erro ? (
          <div className="bg-error/10 mt-4 flex items-start gap-2 rounded-xl px-4 py-3">
            <ExclamationTriangleIcon className="text-error mt-0.5 size-4 shrink-0" />
            <p className="dark:text-dark-200 flex-1 text-xs text-gray-600">
              {erro}
            </p>
            <button
              type="button"
              onClick={() => setTentativa((n) => n + 1)}
              className="text-primary-600 dark:text-primary-400 shrink-0 text-xs hover:underline"
            >
              Tentar de novo
            </button>
          </div>
        ) : !chaves ? (
          <p className="dark:text-dark-300 mt-4 text-sm text-gray-400">
            Carregando…
          </p>
        ) : configuradas.length === 0 ? (
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
              {configuradas.map((c) => (
                <li
                  key={c.provider}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="dark:text-dark-100 text-sm font-medium text-gray-800">
                      {c.providerNome}
                    </p>
                    <p className="dark:text-dark-300 mt-0.5 text-xs text-gray-400">
                      {c.fonte === "backoffice"
                        ? `••••${c.keyLast4}`
                        : "chave do servidor (.env)"}
                      <span className="mx-1.5">·</span>
                      {c.usos.join(", ")}
                    </p>
                  </div>
                  <Estado c={c} />
                  <MenuChave
                    ocupado={ocupado === c.provider}
                    doBackoffice={c.fonte === "backoffice"}
                    onEditar={() => setModal({ provider: c.provider })}
                    onTestar={() => void testar(c)}
                    onRemover={() => setRemover(c)}
                  />
                </li>
              ))}
            </ul>
            {livres.length > 0 && (
              <Button
                variant="outlined"
                color="primary"
                className="mt-3 h-8 gap-1.5 text-xs"
                onClick={() => setModal({})}
              >
                <PlusIcon className="size-4" />
                Adicionar chave
              </Button>
            )}
          </>
        )}
      </section>

      {/* Mesmo padrão de "Modelos e Prioridades" do BYOK. */}
      {chaves && !erro && (
        <div className="mt-12">
          <h4 className="dark:text-dark-100 text-sm font-semibold text-gray-800">
            Modelo padrão
          </h4>
          <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
            Usado quando o pedido não indica um modelo que a chave execute (ex.:
            modelo demonstrativo do catálogo BeCulture).
          </p>
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <span className="bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400 grid size-7 shrink-0 place-items-center rounded-lg">
                <CpuChipIcon className="size-4.5" />
              </span>
              <h4 className="dark:text-dark-100 text-sm font-semibold text-gray-800">
                Texto
              </h4>
              {comTexto.length > 0 && (
                <span className="bg-success/10 text-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                  <CheckCircleIcon className="size-3.5" />
                  Conectado
                  {comTexto.length > 1 && ` · ${comTexto.length} provedores`}
                </span>
              )}
            </div>
            <div className="mt-4">
              {comTexto.length > 0 ? (
                <>
                  <ul className="dark:divide-dark-500 dark:border-dark-500 dark:bg-dark-600 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50">
                    {comTexto.map((c, i) => (
                      <li
                        key={c.provider}
                        className="flex flex-wrap items-center gap-3 px-3 py-2.5"
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
                            {modelosTexto(catalogo, c.provider).find(
                              (m) => m.id === c.modeloPadrao,
                            )?.name ??
                              c.modeloPadrao ??
                              "—"}
                          </span>
                          <span className="dark:text-dark-300 ml-2 text-gray-400">
                            {c.providerNome}
                          </span>
                        </div>
                        {c.fonte === "backoffice" && (
                          <Button
                            variant="flat"
                            isIcon
                            className="size-7 rounded-lg"
                            aria-label={`Alterar modelo padrão de ${c.providerNome}`}
                            onClick={() => setModal({ provider: c.provider })}
                          >
                            <PencilSquareIcon className="size-4" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {comTexto.length > 1 && (
                    <p className="dark:text-dark-300 mt-2 text-xs text-gray-400">
                      Se um provedor falhar, o próximo assume automaticamente.
                    </p>
                  )}
                </>
              ) : (
                <div className="dark:border-dark-500 dark:bg-dark-600 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
                  <p className="dark:text-dark-100 text-sm font-medium text-gray-700">
                    Nenhum modelo configurado
                  </p>
                  <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
                    Adicione uma chave da Anthropic ou da OpenAI para executar
                    chamadas de texto.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {chaves && (
        <ModalChave
          key={modal ? (modal.provider ?? "nova") : "fechado"}
          aberto={!!modal}
          editando={
            modal?.provider
              ? chaves.find((c) => c.provider === modal.provider)
              : undefined
          }
          opcoes={modal?.provider ? chaves : livres}
          catalogo={catalogo}
          onClose={() => setModal(null)}
          onSalva={(c) => {
            substituir(c);
            setModal(null);
            if (!c.aviso) toast.success("Chave operacional salva.");
          }}
        />
      )}

      <ConfirmModal
        show={!!remover}
        onClose={() => {
          if (!removendo) setRemover(null);
        }}
        onOk={() => void confirmarRemocao()}
        confirmLoading={removendo}
        state="pending"
        messages={{
          pending: {
            title: "Remover esta chave?",
            description:
              "O protótipo volta a usar a chave do servidor (.env), se houver. Sem nenhuma, as chamadas deste provedor deixam de funcionar.",
            actionText: "Remover",
          },
        }}
      />
    </SectionCard>
  );
}

/** Mesmos selos de estado da lista do BYOK. */
function Estado({ c }: { c: ChaveOperacional }) {
  if (c.fonte === "ambiente") {
    return (
      <span className="dark:bg-dark-500 dark:text-dark-200 inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">
        servidor (.env)
      </span>
    );
  }
  if (c.status === "invalida") {
    return (
      <span className="bg-warning/10 text-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
        <ExclamationTriangleIcon className="size-3.5" />
        chave recusada
      </span>
    );
  }
  if (!c.validatedAt) {
    return (
      <span
        title="A chave foi salva, mas o provedor não confirmou que ela funciona. Ela será usada normalmente."
        className="dark:bg-dark-500 dark:text-dark-200 inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500"
      >
        não verificada
      </span>
    );
  }
  return null;
}

function MenuChave({
  ocupado,
  doBackoffice,
  onEditar,
  onTestar,
  onRemover,
}: {
  ocupado: boolean;
  doBackoffice: boolean;
  onEditar: () => void;
  onTestar: () => void;
  onRemover: () => void;
}) {
  const item = (focus: boolean) =>
    clsx(
      "dark:text-dark-100 flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-gray-700 transition-colors",
      focus && "dark:bg-dark-600 bg-gray-100",
    );
  return (
    <Menu as="div" className="relative shrink-0">
      <MenuButton
        aria-label="Ações da chave"
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
        className="dark:bg-dark-750 dark:border-dark-500 z-100 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg shadow-gray-200/60 outline-hidden dark:shadow-none"
      >
        <MenuItem>
          {({ focus }) => (
            <button type="button" onClick={onEditar} className={item(focus)}>
              <PencilSquareIcon className="size-4" />
              {doBackoffice ? "Editar" : "Substituir pelo Backoffice"}
            </button>
          )}
        </MenuItem>
        <MenuItem>
          {({ focus }) => (
            <button type="button" onClick={onTestar} className={item(focus)}>
              <ArrowPathIcon className="size-4" />
              Testar conexão
            </button>
          )}
        </MenuItem>
        {doBackoffice && (
          <MenuItem>
            {({ focus }) => (
              <button
                type="button"
                onClick={onRemover}
                className={clsx(
                  "this:error text-this dark:text-this-light flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm transition-colors",
                  focus && "bg-this/10 dark:bg-this-light/10",
                )}
              >
                <TrashIcon className="size-4" />
                Remover
              </button>
            )}
          </MenuItem>
        )}
      </Transition>
    </Menu>
  );
}

/** Mesmo modal "Adicionar chave de API" do BYOK, com o modelo padrão. */
function ModalChave({
  aberto,
  editando,
  opcoes,
  catalogo,
  onClose,
  onSalva,
}: {
  aberto: boolean;
  /** Presente = editar a chave deste provedor (a chave nova é opcional). */
  editando?: ChaveOperacional;
  opcoes: ChaveOperacional[];
  catalogo: CatalogProvider[];
  onClose: () => void;
  onSalva: (c: ChaveOperacional) => void;
}) {
  const [escolhido, setEscolhido] = useState<string>(
    editando?.provider ?? opcoes[0]?.provider ?? "anthropic",
  );
  const provider = (editando?.provider ?? escolhido) as ProvedorOperacional;
  const atual = opcoes.find((o) => o.provider === provider);
  const modelos = modelosTexto(catalogo, provider);
  const [modelo, setModelo] = useState(atual?.modeloPadrao ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editandoBackoffice = editando?.fonte === "backoffice";
  const modeloAtual = modelos.some((m) => m.id === modelo)
    ? modelo
    : (modelos[0]?.id ?? "");

  const salvar = async () => {
    setError(null);
    if (!apiKey.trim() && !editandoBackoffice) {
      setError("Cole a chave de API do provedor.");
      return;
    }
    setSaving(true);
    try {
      onSalva(
        await apiOperacional.salvar(provider, {
          apiKey: apiKey.trim() || undefined,
          modeloPadrao: modelos.length ? modeloAtual || null : undefined,
        }),
      );
    } catch (err) {
      setError(mensagemDeErro(err));
    } finally {
      setSaving(false);
    }
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
              {editando ? "Editar chave de API" : "Adicionar chave de API"}
            </DialogTitle>
            <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
              A chave é validada e criptografada no servidor. Ela nunca é
              exibida por completo depois de salva.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
                  Provedor
                </span>
                <select
                  value={provider}
                  disabled={!!editando}
                  onChange={(e) => setEscolhido(e.target.value)}
                  className={clsx("form-select", fieldCls)}
                >
                  {(editando ? [editando] : opcoes).map((o) => (
                    <option key={o.provider} value={o.provider}>
                      {o.providerNome}
                    </option>
                  ))}
                </select>
                {atual && (
                  <span className="dark:text-dark-300 mt-1 block text-xs font-normal text-gray-400">
                    Usada para: {atual.usos.join(", ")}
                  </span>
                )}
              </label>
              <label className="block text-sm">
                <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
                  {editandoBackoffice ? "Nova chave de API" : "Chave de API"}
                  {editandoBackoffice && (
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
              {modelos.length > 0 && (
                <label className="block text-sm">
                  <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
                    Modelo padrão de texto
                  </span>
                  <select
                    value={modeloAtual}
                    onChange={(e) => setModelo(e.target.value)}
                    className={clsx("form-select", fieldCls)}
                  >
                    {modelos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {error && <p className="text-error mt-3 text-sm">{error}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="outlined" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button color="primary" onClick={salvar} disabled={saving}>
                {saving
                  ? "Validando…"
                  : editando
                    ? "Salvar"
                    : "Adicionar chave"}
              </Button>
            </div>
            <p className="dark:text-dark-300 mt-3 inline-flex items-center gap-1 text-xs text-gray-400">
              <ShieldCheckIcon className="size-4" />
              Chave validada e criptografada no servidor
            </p>
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}
