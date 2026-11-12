import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bars2Icon,
  CpuChipIcon,
  PhotoIcon,
  VideoCameraIcon,
  CheckCircleIcon,
  EllipsisVerticalIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  SparklesIcon,
  UserIcon,
  BuildingOffice2Icon,
  PencilSquareIcon,
  ArrowPathIcon,
  PauseCircleIcon,
  PlayCircleIcon,
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
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { reorderWithEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/reorder-with-edge";

import { Button } from "@/components/ui";
import { DropIndicator } from "@/components/shared/DropIndicator";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { PageTitle, type PageHelp } from "@/components/shared/PageTitle";
import { useDisclosure } from "@/hooks";
import {
  createAiCredential,
  getAiProviders,
  listAiCredentials,
  removeAiCredential,
  revalidateAiCredential,
  updateAiCredential,
  PROVEDORES_PADRAO,
  type AiCredential,
  type AiModality,
  type CatalogProvider,
} from "@/services/api/aiCredential";
import {
  ROTULO_ORIGEM,
  ROTULO_PLANO,
  useResumoContaIa,
  type OrigemCredencial,
  type ResumoContaIa,
} from "@/services/api/modalidade";
import { EstadoIaNaoConfigurada } from "./ia/EstadoIaNaoConfigurada";
import { SectionCard } from "./configuracoes-ui";
import {
  addAiConnection,
  listAiConnections,
  removeAiConnection,
  reorderAiConnections,
} from "@/services/api/aiConnection";
import {
  addAiMediaConnection,
  listAiMediaConnections,
  removeAiMediaConnection,
  reorderAiMediaConnections,
} from "@/services/api/aiMediaConnection";

// ----------------------------------------------------------------------

interface QueueItem {
  id: string;
  credentialId: string;
  provider: string;
  nome: string | null;
  model: string;
  keyLast4: string;
  status: "ativa" | "invalida";
}

interface ModalityAdapter {
  list(): Promise<QueueItem[]>;
  add(input: { credentialId: string; model: string }): Promise<QueueItem>;
  remove(id: string): Promise<void>;
  reorder(ids: string[]): Promise<QueueItem[]>;
}

interface Modality {
  id: AiModality;
  label: string;
  icon: React.ElementType;
  adapter: ModalityAdapter;
}

const MODALITIES: Modality[] = [
  {
    id: "text",
    label: "Texto",
    icon: CpuChipIcon,
    adapter: {
      list: () => listAiConnections(),
      add: (input) => addAiConnection(input),
      remove: (id) => removeAiConnection(id),
      reorder: (ids) => reorderAiConnections(ids),
    },
  },
  {
    id: "image",
    label: "Imagem",
    icon: PhotoIcon,
    adapter: {
      list: () => listAiMediaConnections("image"),
      add: (input) => addAiMediaConnection("image", input),
      remove: (id) => removeAiMediaConnection("image", id),
      reorder: (ids) => reorderAiMediaConnections("image", ids),
    },
  },
  {
    id: "video",
    label: "Vídeo",
    icon: VideoCameraIcon,
    adapter: {
      list: () => listAiMediaConnections("video"),
      add: (input) => addAiMediaConnection("video", input),
      remove: (id) => removeAiMediaConnection("video", id),
      reorder: (ids) => reorderAiMediaConnections("video", ids),
    },
  },
];

const DRAG_TIPO = "ai-model";

interface DragData {
  tipo: string;
  modalidade: string;
  id: string;
}

function ehDragDaModalidade(
  data: Record<string | symbol, unknown>,
  modalidade: string,
): boolean {
  return data.tipo === DRAG_TIPO && data.modalidade === modalidade;
}

/**
 * Falha de carga, no lugar de uma lista vazia.
 *
 * Antes um erro ao listar caía em `[]` sem aviso, e "não tem nada cadastrado"
 * ficava indistinguível de "não consegui perguntar" — é o que fazia a chave
 * parecer que conectava e desconectava sozinha entre um load e outro.
 */
function FalhaDeCarga({
  mensagem,
  onRetry,
}: {
  mensagem: string;
  onRetry: () => void;
}) {
  return (
    <div className="border-warning/30 bg-warning/10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
      <ExclamationTriangleIcon className="text-warning size-5 shrink-0" />
      <p className="dark:text-dark-100 min-w-0 flex-1 text-sm text-gray-700">
        Não foi possível carregar do servidor: {mensagem}
      </p>
      <Button
        variant="outlined"
        className="h-8 shrink-0 text-xs"
        onClick={onRetry}
      >
        Tentar de novo
      </Button>
    </div>
  );
}

function errMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") return m;
    if (Array.isArray(m) && typeof m[0] === "string") return m[0];
  }
  return "Não foi possível concluir. Tente novamente.";
}

function nomeProvedor(providers: CatalogProvider[], id: string): string {
  return providers.find((p) => p.id === id)?.name ?? id;
}

function nomeModelo(
  providers: CatalogProvider[],
  provider: string,
  modality: AiModality,
  model: string,
): string {
  return (
    providers
      .find((p) => p.id === provider)
      ?.models.find((m) => m.id === model && m.modality === modality)?.name ??
    model
  );
}

function rotuloCredencial(
  providers: CatalogProvider[],
  c: { provider: string; nome: string | null },
): string {
  const provedor = nomeProvedor(providers, c.provider);
  return c.nome ? `${provedor} — ${c.nome}` : provedor;
}

/** "Texto", "Texto e Imagem", "Texto, Imagem e Vídeo" — junta com "e" no fim. */
function listar(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/**
 * Modalidades que o provedor atende, por extenso.
 *
 * Uma chave só pode entrar na fila de uma modalidade se o provedor dela
 * oferecer modelos daquele tipo — a Anthropic, por exemplo, não tem modelo de
 * geração de imagem nem de vídeo, então uma chave Claude serve só para Texto.
 * Isso não estava escrito em lugar nenhum da tela; daqui saem os avisos.
 * Derivado do catálogo em runtime: mexeu no catálogo, o texto acompanha.
 */
function rotuloModalidades(
  providers: CatalogProvider[],
  providerId: string,
): string {
  const servidas = providers.find((p) => p.id === providerId)?.modalities ?? [];
  return listar(
    MODALITIES.filter((m) => servidas.includes(m.id)).map((m) => m.label),
  );
}

/** Provedores do catálogo que atendem a modalidade, por extenso. */
function provedoresDaModalidade(
  providers: CatalogProvider[],
  modalityId: AiModality,
): string {
  return listar(
    providers
      .filter((p) => p.modalities.includes(modalityId))
      .map((p) => p.name),
  );
}

/**
 * Configuração de IA do tenant: primeiro as chaves dos provedores, depois a
 * prioridade dos modelos em cada modalidade. A chave nunca volta do servidor.
 */
/**
 * IA & API — central de integrações com provedores de IA. A estrutura é a
 * mesma para todas as contas; o que muda por modalidade são os dados e as
 * ações (as regras são validadas também no backend):
 *   B2C BeCulture → modelos gerenciados pela BeCulture, somente leitura
 *   B2C BYOK      → chaves do próprio usuário, gestão completa
 *   B2B           → chaves da organização, gestão por quem administra
 *
 * `onAlteracao` avisa quem embute o card (ex.: o onboarding) que chaves ou
 * modelos mudaram, para recalcular a prontidão.
 */
export function AiConnectionCard({
  onAlteracao,
  exibir = "tudo",
}: {
  onAlteracao?: () => void;
  /** Onboarding mostra uma parte por etapa; Configurações mostra tudo. */
  exibir?: "tudo" | "chaves" | "modelos";
} = {}) {
  const conta = useResumoContaIa();
  const { recarregar } = conta;
  const avisarAlteracao = useCallback(() => {
    void recarregar();
    onAlteracao?.();
  }, [recarregar, onAlteracao]);

  if (conta.carregando && !conta.resumo) {
    return (
      <p className="dark:text-dark-300 text-sm text-gray-400">Carregando…</p>
    );
  }
  if (conta.resumo?.modalidade === "beculture") {
    return <ModelosGerenciadosBeCulture resumo={conta.resumo} />;
  }
  return (
    <ChavesProprias
      resumo={conta.resumo}
      onAlteracao={avisarAlteracao}
      exibir={exibir}
    />
  );
}

function ChavesProprias({
  resumo,
  onAlteracao,
  exibir,
}: {
  /** Nulo se o servidor não respondeu: cai no comportamento de antes. */
  resumo: ResumoContaIa | null;
  onAlteracao: () => void;
  exibir: "tudo" | "chaves" | "modelos";
}) {
  const podeGerenciar = resumo ? resumo.podeGerenciarChaves : true;
  const origem: OrigemCredencial = resumo?.origemCredenciais ?? "organizacao";
  // Começa no espelho local do catálogo (ver `PROVEDORES_PADRAO`): o select de
  // provedor já nasce preenchido e a resposta do servidor só o substitui.
  const [providers, setProviders] =
    useState<CatalogProvider[]>(PROVEDORES_PADRAO);
  const [creds, setCreds] = useState<AiCredential[]>([]);
  const [loading, setLoading] = useState(true);
  // Erro da listagem de chaves. Sem isto uma falha virava lista vazia — a UI
  // dizia "nenhuma chave cadastrada" com a chave lá, salva no servidor.
  const [erroChaves, setErroChaves] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) setErroChaves(null);
      // `allSettled`: uma falha ao listar as chaves não pode descartar o
      // catálogo (nem o contrário, como acontecia com o `Promise.all`).
      const [, chaves] = await Promise.allSettled([
        getAiProviders().then((provs) => {
          if (alive) setProviders(provs);
        }),
        listAiCredentials().then((lista) => {
          if (alive) setCreds(lista);
        }),
      ]);
      if (!alive) return;
      if (chaves.status === "rejected")
        setErroChaves(errMessage(chaves.reason));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [tentativa]);

  const onCredsChange = useCallback(
    (lista: AiCredential[]) => {
      setCreds(lista);
      onAlteracao();
    },
    [onAlteracao],
  );

  if (loading) {
    return (
      <p className="dark:text-dark-300 text-sm text-gray-400">Carregando…</p>
    );
  }

  return (
    <div>
      {exibir === "tudo" && <OrigemCredenciais origem={origem} />}
      {resumo && (
        <NotaPrototipo className="mb-6">
          as chaves e modelos desta tela são demonstrativos — aceitam valores de
          exemplo, não são validados no provedor e não executam chamadas. O
          processamento real (assistente e demais recursos de IA) usa a chave de
          Backoffice → Configuração de API
          {resumo.execucao === "indisponivel" &&
            ", que ainda não foi configurada"}
          .
        </NotaPrototipo>
      )}
      {exibir === "tudo" &&
        resumo &&
        resumo.prontidao !== "pronta" &&
        !erroChaves && (
          <EstadoIaNaoConfigurada
            className="mb-6"
            prontidao={resumo.prontidao}
            modalidade={resumo.modalidade}
            podeAdministrar={resumo.podeAdministrarIa}
          />
        )}
      {exibir !== "modelos" && (
        <KeysSection
          providers={providers}
          creds={creds}
          onCredsChange={onCredsChange}
          erroCarga={erroChaves}
          onRetry={() => setTentativa((n) => n + 1)}
          podeGerenciar={podeGerenciar}
          origem={origem}
        />
      )}
      {/* Subseção irmã de "Chaves de API": mesmo título <h4>, mesma ausência de
          régua abaixo dele. O corte entre as duas é o respiro de mt-12. O
          `divide-y` envolve SÓ as modalidades — com o título dentro dele, a
          primeira borda caía entre o título e "Texto" e fazia o título parecer
          mais um item da lista. */}
      {exibir !== "chaves" && (
        <div className={exibir === "modelos" ? "" : "mt-12"}>
          <h4 className="dark:text-dark-100 text-sm font-semibold text-gray-800">
            Modelos e Prioridades
          </h4>
          {/* Descrição fixa, como em "Chaves de API". A linha de "comece por aqui"
            só entra sem chave cadastrada, quando as modalidades ficam vazias. */}
          <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
            Escolha quais modelos atendem cada modalidade e em que ordem devem
            ser usados.
            {creds.length === 0 &&
              " Adicione uma chave de API para começar a configurar seus modelos."}
          </p>
          {!podeGerenciar && (
            <p className="dark:text-dark-300 mt-2 text-xs text-gray-400">
              Somente quem administra a IA da organização pode alterar os
              modelos disponíveis para os membros.
            </p>
          )}
          <div
            aria-disabled={!podeGerenciar}
            className={clsx(
              "dark:divide-dark-500 mt-4 divide-y divide-gray-200",
              !podeGerenciar && "pointer-events-none opacity-60",
            )}
          >
            {MODALITIES.map((m) => (
              <section key={m.id} className="py-5 first:pt-0 last:pb-0">
                <ModalityPanel
                  modality={m}
                  providers={providers}
                  creds={creds}
                  semChaves={creds.length === 0}
                  onModelCount={(credentialId, delta) => {
                    setCreds((prev) =>
                      prev.map((c) =>
                        c.id === credentialId
                          ? {
                              ...c,
                              modelCount: Math.max(0, c.modelCount + delta),
                            }
                          : c,
                      ),
                    );
                    onAlteracao();
                  }}
                />
              </section>
            ))}
          </div>
        </div>
      )}{" "}
    </div>
  );
}

/** Quem administra as credenciais e quem paga o uso — sempre visível no topo. */
function OrigemCredenciais({ origem }: { origem: OrigemCredencial }) {
  const textos: Record<OrigemCredencial, string> = {
    plataforma:
      "A BeCulture fornece e administra as credenciais. O uso está incluído no plano, sujeito às franquias.",
    usuario:
      "As chaves são suas. O uso é cobrado pelo provedor diretamente a você — a BeCulture não cobra tokens.",
    organizacao:
      "As chaves são da organização e ficam isoladas dela. O uso é cobrado pelo provedor à organização — a licença SaaS não depende de tokens.",
  };
  return (
    <div className="dark:border-dark-500 mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 px-4 py-3">
      <BadgeOrigem origem={origem} />
      <p className="dark:text-dark-300 min-w-0 flex-1 text-xs text-gray-500">
        {textos[origem]}
      </p>
    </div>
  );
}

export function BadgeOrigem({ origem }: { origem: OrigemCredencial }) {
  const cor: Record<OrigemCredencial, string> = {
    plataforma: "bg-primary-500/15 text-primary-700 dark:text-primary-300",
    usuario: "bg-info/10 text-info",
    organizacao: "bg-secondary/10 text-secondary dark:text-secondary-light",
  };
  const Icon =
    origem === "plataforma"
      ? SparklesIcon
      : origem === "usuario"
        ? UserIcon
        : BuildingOffice2Icon;
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        cor[origem],
      )}
    >
      <Icon className="size-3.5" />
      {ROTULO_ORIGEM[origem]}
    </span>
  );
}

/**
 * B2C com modelos BeCulture: MESMA anatomia da tela BYOK ("Chaves de API" +
 * "Modelos e Prioridades", mesmas listas e cabeçalhos de modalidade), só que
 * somente leitura. Sem chave própria, sem provedor externo, sem
 * desativar/excluir/reordenar o que é gerenciado pela plataforma. Os dados vêm
 * do catálogo publicado no Backoffice, sem depender de chave do usuário.
 */
function ModelosGerenciadosBeCulture({ resumo }: { resumo: ResumoContaIa }) {
  const modelos = resumo.modelosPlataforma;
  // Mesmas chaves cadastradas em Backoffice → Modelos BeCulture (ativas e com
  // modelo disponível). O valor da chave nunca é exibido.
  const chaves = resumo.chavesPlataforma ?? [];

  return (
    <div>
      {/* Mesma seção "Chaves de API" do BYOK, somente leitura. */}
      <section>
        <h4 className="dark:text-dark-100 text-sm font-semibold text-gray-800">
          Chaves de API
        </h4>
        <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
          As chaves de API são fornecidas e administradas pela BeCulture. Não é
          preciso — nem possível — cadastrar chaves próprias neste plano.
        </p>

        {chaves.length === 0 ? (
          <div className="dark:border-dark-500 dark:bg-dark-600 mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
            <p className="dark:text-dark-100 text-sm font-medium text-gray-700">
              Nenhuma chave disponível ainda
            </p>
            <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
              As chaves aparecem aqui assim que a BeCulture disponibilizar
              modelos para você.
            </p>
          </div>
        ) : (
          <ul className="dark:divide-dark-500 dark:border-dark-500 dark:bg-dark-600 mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50">
            {chaves.map((c) => (
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
                    {c.modelos}{" "}
                    {c.modelos === 1
                      ? "modelo conectado"
                      : "modelos conectados"}
                    <span className="mx-1.5">·</span>
                    {listar(
                      MODALITIES.filter((m) => c.kinds.includes(m.id)).map(
                        (m) => m.label,
                      ),
                    )}
                  </p>
                </div>
                <BadgeOrigem origem="plataforma" />
              </li>
            ))}
          </ul>
        )}
      </section>
      {/* Mesma seção "Modelos e Prioridades" do BYOK, somente leitura. */}
      <div className="mt-12">
        <h4 className="dark:text-dark-100 text-sm font-semibold text-gray-800">
          Modelos e Prioridades
        </h4>
        <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
          Modelos que atendem cada modalidade e a ordem em que são usados,
          definidos pela BeCulture.
        </p>
        <div className="dark:divide-dark-500 mt-4 divide-y divide-gray-200">
          {MODALITIES.map((m) => {
            const lista = modelos.filter((x) => x.kind === m.id);
            return (
              <section key={m.id} className="py-5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400 grid size-7 shrink-0 place-items-center rounded-lg">
                    <m.icon className="size-4.5" />
                  </span>
                  <h4 className="dark:text-dark-100 text-sm font-semibold text-gray-800">
                    {m.label}
                  </h4>
                  {lista.length > 0 && (
                    <span className="bg-success/10 text-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                      <CheckCircleIcon className="size-3.5" />
                      Disponível
                      {lista.length > 1 && ` · ${lista.length} modelos`}
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  {lista.length > 0 ? (
                    <ul className="dark:divide-dark-500 dark:border-dark-500 dark:bg-dark-600 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50">
                      {lista.map((x, i) => (
                        <li
                          key={x.id}
                          className="relative flex flex-wrap items-center gap-3 px-3 py-2.5"
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
                              {x.limiteTokensCiclo !== null &&
                                ` · limite ${formatarTokens(x.limiteTokensCiclo)} tokens/ciclo`}
                            </span>
                          </div>
                          <BadgeOrigem origem="plataforma" />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="dark:border-dark-500 dark:bg-dark-600 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
                      <p className="dark:text-dark-100 text-sm font-medium text-gray-700">
                        Nenhum modelo disponível
                      </p>
                      <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
                        Seu plano ainda não inclui modelos de{" "}
                        {m.label.toLowerCase()}.
                      </p>
                    </div>
                  )}
                  {lista.length > 1 && (
                    <p className="dark:text-dark-300 mt-2 text-xs text-gray-400">
                      Se um modelo falhar, o próximo assume automaticamente.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>{" "}
    </div>
  );
}

function formatarTokens(n: number): string {
  return n.toLocaleString("pt-BR");
}

function KeysSection({
  providers,
  creds,
  onCredsChange,
  erroCarga,
  onRetry,
  podeGerenciar,
  origem,
}: {
  providers: CatalogProvider[];
  creds: AiCredential[];
  onCredsChange: (lista: AiCredential[]) => void;
  /** Listagem falhou: a seção mostra o motivo em vez do estado vazio. */
  erroCarga: string | null;
  onRetry: () => void;
  /** Sem permissão (ou plano BeCulture): lista só para leitura. */
  podeGerenciar: boolean;
  origem: OrigemCredencial;
}) {
  const [modalOpen, modal] = useDisclosure(false);
  const [editando, setEditando] = useState<AiCredential | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const substituir = (c: AiCredential) => {
    onCredsChange(creds.map((x) => (x.id === c.id ? { ...x, ...c } : x)));
    setAviso(c.aviso ?? null);
  };

  const executar = async (id: string, acao: () => Promise<AiCredential>) => {
    setOcupado(id);
    try {
      substituir(await acao());
    } catch (err) {
      setAviso(errMessage(err));
    } finally {
      setOcupado(null);
    }
  };
  const [toDelete, setToDelete] = useState<AiCredential | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteState, setDeleteState] = useState<
    "pending" | "success" | "error"
  >("pending");
  // Chave salva sem o provedor confirmar: o cadastro deu certo, então o modal
  // fecha, mas o motivo não pode sumir junto com ele.
  const [aviso, setAviso] = useState<string | null>(null);

  const onCreated = (c: AiCredential) => {
    onCredsChange([...creds, c]);
    setAviso(c.aviso ?? null);
    modal.close();
  };

  const confirmarRemocao = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await removeAiCredential(toDelete.id);
      onCredsChange(creds.filter((c) => c.id !== toDelete.id));
      setToDelete(null);
      setDeleteState("pending");
    } catch {
      setDeleteState("error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section>
      <h4 className="dark:text-dark-100 text-sm font-semibold text-gray-800">
        Chaves de API
      </h4>
      <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
        {origem === "usuario"
          ? "Conecte suas chaves de provedores de IA. Você pode ter várias, editar, desativar e remover."
          : "Conecte os provedores de IA utilizados pela organização. Os membros usam os modelos liberados por ela."}{" "}
        As chaves são armazenadas de forma segura e nunca são exibidas por
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
            onClick={() => setAviso(null)}
            className="dark:text-dark-300 shrink-0 text-xs text-gray-400 hover:underline"
          >
            Ok
          </button>
        </div>
      )}

      {erroCarga ? (
        // Precedência sobre o estado vazio: com a listagem falhando não se sabe
        // se há chave, e oferecer "Adicionar chave" convidaria a cadastrar uma
        // segunda vez a que já está no servidor.
        <FalhaDeCarga mensagem={erroCarga} onRetry={onRetry} />
      ) : !podeGerenciar && creds.length === 0 ? (
        <p className="dark:text-dark-300 mt-4 text-sm text-gray-400">
          Nenhuma chave cadastrada. Somente quem administra a IA da organização
          pode conectar provedores.
        </p>
      ) : creds.length === 0 ? (
        // Sem chave, só o botão: a descrição da seção logo acima já diz o que
        // são estas chaves, e a caixa cinza só repetia isso em volta dele.
        <Button
          variant="outlined"
          color="primary"
          className="mt-4 gap-1.5"
          onClick={modal.open}
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
                    {rotuloCredencial(providers, c)}
                  </p>
                  <p className="dark:text-dark-300 mt-0.5 text-xs text-gray-400">
                    ••••{c.keyLast4}
                    <span className="mx-1.5">·</span>
                    {c.modelCount === 0
                      ? "nenhum modelo conectado"
                      : `${c.modelCount} ${c.modelCount === 1 ? "modelo conectado" : "modelos conectados"}`}
                    <span className="mx-1.5">·</span>
                    {rotuloModalidades(providers, c.provider)}
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
                      title="A chave foi salva, mas o provedor não confirmou que ela funciona. Ela será usada normalmente."
                      className="dark:bg-dark-500 dark:text-dark-200 inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500"
                    >
                      não verificada
                    </span>
                  )
                )}
                {c.ativa === false && (
                  <span className="dark:bg-dark-500 dark:text-dark-200 inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">
                    desativada
                  </span>
                )}
                <BadgeOrigem origem={origem} />
                {podeGerenciar && (
                  <KeyMenu
                    ocupado={ocupado === c.id}
                    ativa={c.ativa !== false}
                    onEdit={() => setEditando(c)}
                    onRevalidate={() =>
                      void executar(c.id, () => revalidateAiCredential(c.id))
                    }
                    onToggle={() =>
                      void executar(c.id, () =>
                        updateAiCredential(c.id, { ativa: c.ativa === false }),
                      )
                    }
                    onRemove={() => {
                      setDeleteState("pending");
                      setToDelete(c);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
          {podeGerenciar && (
            <Button
              variant="outlined"
              color="primary"
              className="mt-3 h-8 gap-1.5 text-xs"
              onClick={modal.open}
            >
              <PlusIcon className="size-4" />
              Adicionar chave
            </Button>
          )}
        </>
      )}

      <AddKeyModal
        open={modalOpen}
        onClose={modal.close}
        providers={providers}
        onCreated={onCreated}
      />

      <EditKeyModal
        key={editando?.id ?? "nenhuma"}
        cred={editando}
        providers={providers}
        onClose={() => setEditando(null)}
        onSaved={(c) => {
          substituir(c);
          setEditando(null);
        }}
      />

      <ConfirmModal
        show={!!toDelete}
        onClose={() => {
          if (deleting) return;
          setToDelete(null);
          setDeleteState("pending");
        }}
        onOk={confirmarRemocao}
        confirmLoading={deleting}
        state={deleteState}
        messages={{
          pending: {
            title: "Remover esta chave?",
            description:
              "Os modelos que usam esta conexão sairão das filas de Texto, Imagem e Vídeo.",
            actionText: "Remover",
          },
          success: {
            title: "Chave removida",
            description: "A conexão foi desconectada.",
            actionText: "Ok",
          },
          error: {
            title: "Não foi possível remover",
            description: "Tente novamente em instantes.",
            actionText: "Tentar de novo",
          },
        }}
      />
    </section>
  );
}

function KeyMenu({
  onRemove,
  onEdit,
  onRevalidate,
  onToggle,
  ativa,
  ocupado,
}: {
  onRemove: () => void;
  onEdit: () => void;
  onRevalidate: () => void;
  onToggle: () => void;
  ativa: boolean;
  ocupado: boolean;
}) {
  const itemClasse = (focus: boolean) =>
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
        className="dark:bg-dark-750 dark:border-dark-500 z-100 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg shadow-gray-200/60 outline-hidden dark:shadow-none"
      >
        <MenuItem>
          {({ focus }) => (
            <button
              type="button"
              onClick={onEdit}
              className={itemClasse(focus)}
            >
              <PencilSquareIcon className="size-4" />
              Editar
            </button>
          )}
        </MenuItem>
        <MenuItem>
          {({ focus }) => (
            <button
              type="button"
              onClick={onRevalidate}
              className={itemClasse(focus)}
            >
              <ArrowPathIcon className="size-4" />
              Revalidar
            </button>
          )}
        </MenuItem>
        <MenuItem>
          {({ focus }) => (
            <button
              type="button"
              onClick={onToggle}
              className={itemClasse(focus)}
            >
              {ativa ? (
                <PauseCircleIcon className="size-4" />
              ) : (
                <PlayCircleIcon className="size-4" />
              )}
              {ativa ? "Desativar" : "Ativar"}
            </button>
          )}
        </MenuItem>
        <MenuItem>
          {({ focus }) => (
            <button
              type="button"
              onClick={onRemove}
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
      </Transition>
    </Menu>
  );
}

/** Editar uma chave: renomear e/ou trocar o valor (revalida no servidor). */
function EditKeyModal({
  cred,
  providers,
  onClose,
  onSaved,
}: {
  cred: AiCredential | null;
  providers: CatalogProvider[];
  onClose: () => void;
  onSaved: (c: AiCredential) => void;
}) {
  // Estado inicial vem da chave; o pai troca a `key` a cada chave editada.
  const [nome, setNome] = useState(cred?.nome ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const salvar = async () => {
    if (!cred) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await updateAiCredential(cred.id, {
          nome,
          apiKey: apiKey.trim() || undefined,
        }),
      );
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Transition appear show={!!cred} as={Fragment}>
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
              Editar chave
            </DialogTitle>
            <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
              {cred ? nomeProvedor(providers, cred.provider) : ""} · ••••
              {cred?.keyLast4}
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
                  Nome da conexão
                </span>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={80}
                  className="form-input dark:border-dark-450 dark:bg-dark-700 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
                  Nova chave de API
                  <span className="ml-1 font-normal text-gray-400">
                    (deixe vazio para manter a atual)
                  </span>
                </span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-••••••••••••"
                  autoComplete="off"
                  className="form-input dark:border-dark-450 dark:bg-dark-700 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            {error && <p className="text-error mt-3 text-sm">{error}</p>}
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="outlined" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button color="primary" onClick={salvar} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}

function AddKeyModal({
  open,
  onClose,
  providers,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  providers: CatalogProvider[];
  onCreated: (c: AiCredential) => void;
}) {
  const [escolhido, setEscolhido] = useState("");
  const [nome, setNome] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset só quando abre. Antes dependia também de `providers`, então a
  // chegada do catálogo no meio do preenchimento apagava a chave já digitada.
  useEffect(() => {
    if (!open) return;
    setEscolhido("");
    setNome("");
    setApiKey("");
    setError(null);
  }, [open]);

  // Derivado, não sincronizado por efeito: a lista do servidor chega depois da
  // primeira renderização, então o valor escolhido só vale enquanto existir no
  // catálogo; fora isso, cai no primeiro provedor da lista.
  const providerId = providers.some((p) => p.id === escolhido)
    ? escolhido
    : (providers[0]?.id ?? "");

  const salvar = async () => {
    setError(null);
    if (!apiKey.trim()) {
      setError("Cole a chave de API do provedor.");
      return;
    }
    setSaving(true);
    try {
      const criado = await createAiCredential({
        provider: providerId,
        apiKey,
        nome: nome.trim() || undefined,
      });
      onCreated(criado);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Transition appear show={open} as={Fragment}>
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
              Adicionar chave de API
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
                  value={providerId}
                  onChange={(e) => setEscolhido(e.target.value)}
                  className="form-select dark:border-dark-450 dark:bg-dark-700 dark:text-dark-100 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="dark:text-dark-300 mt-1 block text-xs font-normal text-gray-400">
                  Atende: {rotuloModalidades(providers, providerId)}
                </span>
              </label>
              <label className="block text-sm">
                <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
                  Nome da conexão
                  <span className="ml-1 font-normal text-gray-400">
                    (opcional)
                  </span>
                </span>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Produção"
                  maxLength={80}
                  className="form-input dark:border-dark-450 dark:bg-dark-700 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
                  Chave de API
                </span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-••••••••••••"
                  autoComplete="off"
                  className="form-input dark:border-dark-450 dark:bg-dark-700 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                onClick={salvar}
                disabled={saving || !providerId}
              >
                {saving ? "Validando…" : "Adicionar chave"}
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

// ----------------------------------------------------------------------

function ModalityPanel({
  modality,
  providers,
  creds,
  semChaves,
  onModelCount,
}: {
  modality: Modality;
  providers: CatalogProvider[];
  creds: AiCredential[];
  semChaves: boolean;
  onModelCount: (credentialId: string, delta: number) => void;
}) {
  const { adapter } = modality;
  const [conns, setConns] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Falha ao listar a fila desta modalidade — antes virava "nenhum modelo
  // configurado", que é uma afirmação sobre o servidor que não se podia fazer.
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const credsDaModalidade = useMemo(
    () =>
      creds.filter((c) =>
        providers
          .find((p) => p.id === c.provider)
          ?.modalities.includes(modality.id),
      ),
    [creds, providers, modality.id],
  );

  /**
   * Sem chave que atenda a modalidade os botões ficam desabilitados. Dizer só
   * que nenhuma serve deixa o usuário sem saída, então a ajuda nomeia quem
   * atende. Fica sob demanda no "?" do estado vazio (mesmo padrão do título da
   * página); `undefined` quando há chave, e aí o PageTitle não mostra o botão.
   */
  const quemAtende = provedoresDaModalidade(providers, modality.id);
  const ajudaSemChave: PageHelp | undefined =
    credsDaModalidade.length > 0
      ? undefined
      : {
          title: `Modelos de ${modality.label}`,
          description: (
            <>
              <p>
                Nenhuma chave cadastrada oferece modelos de{" "}
                {modality.label.toLowerCase()}.
                {quemAtende && ` Atendem esta modalidade: ${quemAtende}.`}
              </p>
              <p>
                Cadastre uma chave de um desses provedores em{" "}
                <strong>Chaves de API</strong>, acima.
              </p>
            </>
          ),
        };

  const connsRef = useRef<QueueItem[]>([]);
  useEffect(() => {
    connsRef.current = conns;
  }, [conns]);

  const credIds = creds.map((c) => c.id).join(",");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const lista = await adapter.list();
        if (alive) {
          setConns(lista);
          setErroCarga(null);
        }
      } catch (err) {
        if (alive) {
          setConns([]);
          setErroCarga(errMessage(err));
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // Recarrega quando uma chave some (cascade no servidor) e a cada retentativa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credIds, tentativa]);

  const salvarOrdem = useCallback(
    async (nova: QueueItem[]) => {
      const anterior = connsRef.current;
      setError(null);
      setConns(nova);
      try {
        setConns(await adapter.reorder(nova.map((c) => c.id)));
      } catch (err) {
        setConns(anterior);
        setError(errMessage(err));
      }
    },
    [adapter],
  );

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) =>
          ehDragDaModalidade(source.data, modality.id),
        onDrop({ source, location }) {
          const alvo = location.current.dropTargets[0];
          if (!alvo) return;
          const atual = connsRef.current;
          const de = atual.findIndex((c) => c.id === source.data.id);
          const para = atual.findIndex((c) => c.id === alvo.data.id);
          if (de < 0 || para < 0) return;
          const nova = reorderWithEdge({
            list: atual,
            startIndex: de,
            indexOfTarget: para,
            closestEdgeOfTarget: extractClosestEdge(alvo.data),
            axis: "vertical",
          });
          if (nova.every((c, i) => c.id === atual[i].id)) return;
          void salvarOrdem(nova);
        },
      }),
    [modality.id, salvarOrdem],
  );

  const mover = (de: number, para: number) => {
    const atual = connsRef.current;
    if (para < 0 || para >= atual.length) return;
    const nova = [...atual];
    const [item] = nova.splice(de, 1);
    nova.splice(para, 0, item);
    void salvarOrdem(nova);
  };

  const onRemove = async (conn: QueueItem) => {
    setError(null);
    try {
      await adapter.remove(conn.id);
      setConns(connsRef.current.filter((c) => c.id !== conn.id));
      onModelCount(conn.credentialId, -1);
    } catch (err) {
      setError(errMessage(err));
    }
  };

  const onAdded = (item: QueueItem) => {
    const atual = connsRef.current;
    if (atual.some((c) => c.id === item.id)) {
      setFormOpen(false);
      return;
    }
    setConns([...atual, item]);
    onModelCount(item.credentialId, 1);
    setFormOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400 grid size-7 shrink-0 place-items-center rounded-lg">
          <modality.icon className="size-4.5" />
        </span>
        <h4 className="dark:text-dark-100 text-sm font-semibold text-gray-800">
          {modality.label}
        </h4>
        {conns.length > 0 && (
          <span className="bg-success/10 text-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
            <CheckCircleIcon className="size-3.5" />
            Conectado
            {conns.length > 1 && ` · ${conns.length} modelos`}
          </span>
        )}
      </div>

      {semChaves || loading ? null : (
        <div className="mt-4">
          {conns.length > 0 && (
            <>
              <ul className="dark:divide-dark-500 dark:border-dark-500 dark:bg-dark-600 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50">
                {conns.map((c, i) => (
                  <ModelRow
                    key={c.id}
                    conn={c}
                    index={i}
                    modalityId={modality.id}
                    titulo={nomeModelo(
                      providers,
                      c.provider,
                      modality.id,
                      c.model,
                    )}
                    subtitulo={`${rotuloCredencial(providers, c)} · ••••${c.keyLast4}`}
                    onRemove={onRemove}
                    onMover={mover}
                  />
                ))}
              </ul>
              <p className="dark:text-dark-300 mt-2 text-xs text-gray-400">
                Arraste para definir a ordem. Se um modelo falhar, o próximo
                assume automaticamente.
              </p>
            </>
          )}

          {erroCarga && (
            <FalhaDeCarga
              mensagem={erroCarga}
              onRetry={() => setTentativa((n) => n + 1)}
            />
          )}

          {conns.length === 0 && !erroCarga && !formOpen && (
            <>
              <div className="dark:border-dark-500 dark:bg-dark-600 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
                <PageTitle
                  as="p"
                  className="dark:text-dark-100 text-sm font-medium text-gray-700"
                  helpLabel="Por que não há modelos para escolher"
                  help={ajudaSemChave}
                >
                  Nenhum modelo configurado
                </PageTitle>
                <p className="dark:text-dark-300 mt-1 text-sm text-gray-500">
                  Adicione um modelo para utilizar esta modalidade.
                </p>
              </div>
              {/* Fora da caixa, como o "Adicionar modelo" do estado com fila. */}
              <Button
                variant="outlined"
                color="primary"
                className="mt-3 h-8 text-xs"
                onClick={() => setFormOpen(true)}
                disabled={credsDaModalidade.length === 0}
              >
                Configurar modelos
              </Button>
            </>
          )}

          {formOpen && (
            <AddModelPanel
              modality={modality}
              providers={providers}
              creds={credsDaModalidade}
              jaNaFila={conns}
              onAdded={onAdded}
              onCancel={() => setFormOpen(false)}
            />
          )}

          {conns.length > 0 && !formOpen && (
            <Button
              variant="outlined"
              color="primary"
              className="mt-3 h-8 gap-1.5 text-xs"
              onClick={() => setFormOpen(true)}
              disabled={credsDaModalidade.length === 0}
            >
              <PlusIcon className="size-4" />
              Adicionar modelo
            </Button>
          )}

          {error && <p className="text-error mt-3 text-sm">{error}</p>}
        </div>
      )}
    </>
  );
}

function AddModelPanel({
  modality,
  providers,
  creds,
  jaNaFila,
  onAdded,
  onCancel,
}: {
  modality: Modality;
  providers: CatalogProvider[];
  creds: AiCredential[];
  jaNaFila: QueueItem[];
  onAdded: (item: QueueItem) => void;
  onCancel: () => void;
}) {
  const [credentialId, setCredentialId] = useState(creds[0]?.id ?? "");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cred = creds.find((c) => c.id === credentialId);

  const modelos = useMemo(() => {
    if (!cred) return [];
    const cat =
      providers
        .find((p) => p.id === cred.provider)
        ?.models.filter((m) => m.modality === modality.id) ?? [];
    return cat.filter(
      (m) =>
        !jaNaFila.some((c) => c.credentialId === cred.id && c.model === m.id),
    );
  }, [cred, providers, modality.id, jaNaFila]);

  useEffect(() => {
    setModel(modelos[0]?.id ?? "");
  }, [credentialId, modelos]);

  const salvar = async () => {
    setError(null);
    if (!credentialId || !model) {
      setError("Escolha a conexão e o modelo.");
      return;
    }
    setSaving(true);
    try {
      onAdded(await modality.adapter.add({ credentialId, model }));
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dark:border-dark-500 dark:bg-dark-600 mt-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
            Conexão
          </span>
          <select
            value={credentialId}
            onChange={(e) => setCredentialId(e.target.value)}
            className="form-select dark:border-dark-450 dark:bg-dark-700 dark:text-dark-100 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {creds.map((c) => (
              <option key={c.id} value={c.id}>
                {rotuloCredencial(providers, c)} · ••••{c.keyLast4}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="dark:text-dark-200 mb-1 block font-medium text-gray-600">
            Modelo
          </span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="form-select dark:border-dark-450 dark:bg-dark-700 dark:text-dark-100 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {modelos.length === 0 ? (
              <option value="">Todos os modelos já estão na fila</option>
            ) : (
              modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))
            )}
          </select>
        </label>
      </div>
      {error && <p className="text-error mt-3 text-sm">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <Button
          color="primary"
          onClick={salvar}
          disabled={saving || !model}
          className="h-8 text-xs"
        >
          {saving ? "Adicionando…" : "Adicionar"}
        </Button>
        <Button variant="flat" onClick={onCancel} className="h-8 text-xs">
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function ModelRow({
  conn,
  index,
  modalityId,
  titulo,
  subtitulo,
  onRemove,
  onMover,
}: {
  conn: QueueItem;
  index: number;
  modalityId: string;
  titulo: string;
  subtitulo: string;
  onRemove: (conn: QueueItem) => void;
  onMover: (de: number, para: number) => void;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [edge, setEdge] = useState<Edge | null>(null);
  const [arrastando, setArrastando] = useState(false);

  useEffect(() => {
    const element = rowRef.current;
    const dragHandle = handleRef.current;
    if (!element || !dragHandle) return;

    const data: DragData = {
      tipo: DRAG_TIPO,
      modalidade: modalityId,
      id: conn.id,
    };

    return combine(
      draggable({
        element,
        dragHandle,
        getInitialData: () => ({ ...data }),
        onDragStart: () => setArrastando(true),
        onDrop: () => setArrastando(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => ehDragDaModalidade(source.data, modalityId),
        getData: ({ input, element: alvo }) =>
          attachClosestEdge(
            { ...data },
            { input, element: alvo, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [conn.id, modalityId]);

  return (
    <li
      ref={rowRef}
      className={clsx(
        "relative flex flex-wrap items-center gap-3 px-3 py-2.5",
        arrastando && "opacity-40",
      )}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={`Reordenar ${titulo} (use Alt e as setas para mover)`}
        onKeyDown={(e) => {
          if (!e.altKey) return;
          if (e.key === "ArrowUp") {
            e.preventDefault();
            onMover(index, index - 1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onMover(index, index + 1);
          }
        }}
        className="dark:text-dark-300 dark:hover:text-dark-100 -m-1 shrink-0 cursor-grab p-1 text-gray-400 hover:text-gray-600 active:cursor-grabbing"
      >
        <Bars2Icon className="size-4" />
      </button>

      <span
        className={clsx(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
          index === 0
            ? "bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400"
            : "dark:bg-dark-500 dark:text-dark-200 bg-gray-200 text-gray-600",
        )}
      >
        {index === 0 ? "1 · Principal" : index + 1}
      </span>

      <div className="min-w-0 flex-1 text-sm">
        <span className="dark:text-dark-100 font-medium text-gray-700">
          {titulo}
        </span>
        <span className="dark:text-dark-300 ml-2 text-gray-400">
          {subtitulo}
        </span>
      </div>

      <Button
        variant="flat"
        color="error"
        isIcon
        className="size-7 rounded-lg"
        aria-label={`Remover ${titulo}`}
        onClick={() => onRemove(conn)}
      >
        <TrashIcon className="size-4" />
      </Button>

      {edge && <DropIndicator edge={edge} />}
    </li>
  );
}

/** Aviso de comportamento exclusivo do protótipo (não é regra do produto). */
function NotaPrototipo({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={clsx(
        "dark:border-dark-500 dark:text-dark-300 mt-3 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500",
        className,
      )}
    >
      <span className="font-semibold">Apenas no protótipo:</span> {children}
    </p>
  );
}

/**
 * Franquia do plano B2C BeCulture — container próprio, abaixo do "IA & API"
 * em Configurações. Só existe para contas com modelos BeCulture (BYOK e B2B
 * não têm franquia da BeCulture).
 */
export function FranquiaPlanoSection() {
  const { resumo } = useResumoContaIa();
  const consumo = resumo?.modalidade === "beculture" ? resumo.consumo : null;
  if (!consumo) return null;
  const plano = resumo?.planoIa ? ROTULO_PLANO[resumo.planoIa] : null;
  return (
    <SectionCard
      titulo="Franquia do plano"
      descricao={`Consumo de IA incluído no plano${plano ? ` ${plano}` : ""} neste ciclo.`}
    >
      <p className="dark:text-dark-200 text-sm text-gray-600">
        {formatarTokens(consumo.total)} tokens usados neste ciclo
        {consumo.franquiaGlobalTokens !== null
          ? ` de ${formatarTokens(consumo.franquiaGlobalTokens)} da franquia.`
          : " · sem franquia global definida (valem os limites por modelo)."}
      </p>
      <p className="dark:text-dark-300 mt-1 text-xs text-gray-400">
        Ciclo provisório (mês calendário). A política definitiva de renovação e
        excedentes ainda não foi definida.
      </p>
    </SectionCard>
  );
}
