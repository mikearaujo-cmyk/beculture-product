// Import Dependencies
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  FolderOpenIcon,
  FolderIcon,
  DocumentIcon,
  MagnifyingGlassIcon,
  CpuChipIcon,
  FolderPlusIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";

// Local Imports
import { Page } from "@/components/shared/Page";
import { PageTitle } from "@/components/shared/PageTitle";
import { Badge, Button, Spinner } from "@/components/ui";
import { Checkbox, Input } from "@/components/ui/Form";
import {
  getCurrentProduct,
  getProductCodeFromPath,
} from "@/app/navigation/ceoOs";
import { useProjectsContext } from "@/app/contexts/projects/context";
import { useConnectorsContext } from "@/app/contexts/connectors/context";
import { useAuthContext } from "@/app/contexts/auth/context";
import { usePastasMemoria } from "./usePastasMemoria";
import {
  fetchArquivosDriveApi,
  fetchCaminhoDriveApi,
  fetchConteudoDriveApi,
  fetchOriginalDriveApi,
  type DriveArquivo,
  type DriveConteudo,
  type DriveVisao,
} from "@/services/api/drive";
import {
  caminhoDriveDemo,
  conteudoDriveDemo,
  listarDriveDemo,
  originalDriveDemo,
} from "@/app/data/drive";
import { chaveConta, lerComMigracao } from "@/utils/escopoConta";
import { extOf, formatBytes, formatDate, tintForExt } from "@/utils/arquivos";
import type { AnexoMemoria } from "@/utils/memoriaVault";
import { MarkdownView } from "./MarkdownView";
import {
  SalvarNaMemoriaModal,
  SalvarNoGrupoModal,
  SalvarVariosNaMemoriaModal,
  type ConteudoParaSalvar,
} from "./SalvarConteudo";
import {
  avisarFalhaAoSalvarNaMemoria,
  salvarConteudoNaMemoria,
} from "./memoria-conteudo";
import { avisarFalhaMemoria, salvarDocumentoNoGrupo } from "./memoria-grupos";

// ----------------------------------------------------------------------
// Google Drive — navegação pelos arquivos do conector, com as mesmas duas
// saídas das telas de E-mail e Slack: "Salvar no Repositório" (vira um contexto
// da IA e aparece no grafo) e "Salvar no Grupo" (cópia dentro de um
// agrupamento).
//
// Como no Slack, sem o Drive autorizado em Conectores a tela cai num Drive de
// demonstração (app/data/drive.ts), com o mesmo contrato da API — navegar,
// buscar, ver e salvar funcionam igual. A listagem é paginada e o conteúdo de
// cada arquivo só é lido quando ele é aberto (ou salvo), e fica em cache até
// "Atualizar".
//
// Salvar grava a nota .md com o texto extraído e, ao lado dela, o arquivo
// original (nativos do Google exportados: Docs → .docx, Sheets → .xlsx,
// Slides → .pdf). Arquivo sem extração de texto (imagem, planilha .xlsx…) é
// salvo só com o original e uma descrição.
//
// O que já foi mandado para o Repositório fica no localStorage, como no E-mail.
// ----------------------------------------------------------------------

const PROVEDOR = "google-drive";
const NO_REPOSITORIO_BASE = "ceo-drive-no-repositorio";
const EM_GRUPO_BASE = "ceo-drive-em-grupo";

const VISOES: { id: DriveVisao; label: string }[] = [
  { id: "meu-drive", label: "Meu Drive" },
  { id: "compartilhados", label: "Compartilhados comigo" },
  { id: "recentes", label: "Recentes" },
];

type Pasta = { id: string; nome: string };

function readJSON<T>(base: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = lerComMigracao(base);
    if (!raw) return fallback;
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(base: string, valor: unknown) {
  try {
    window.localStorage.setItem(chaveConta(base), JSON.stringify(valor));
  } catch {
    /* ignora indisponibilidade de storage */
  }
}

/** Mensagem de erro da API (o axios rejeita com o corpo da resposta). */
function mensagemErro(err: unknown, fallback: string): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m.join(" ");
  }
  return fallback;
}

/** Nome sem a extensão — vira o título da nota. */
function semExtensao(nome: string): string {
  return nome.replace(/\.[a-z0-9]{1,6}$/i, "").trim() || nome;
}

/** Nome do original salvo ao lado da nota (Docs ganham ".docx" etc.). */
function nomeDoOriginal(a: DriveArquivo): string {
  if (!a.extensao || a.nome.toLowerCase().endsWith(a.extensao)) return a.nome;
  return `${a.nome}${a.extensao}`;
}

/** Extensão para o selo colorido da lista. */
function extDoArquivo(a: DriveArquivo): string {
  return a.extensao.replace(/^\./, "") || extOf(a.nome);
}

/** O texto vem em Markdown quando é um Google Docs ou um .md. */
function ehMarkdown(a: DriveArquivo): boolean {
  return (
    a.mimeType === "application/vnd.google-apps.document" ||
    /\.(md|markdown)$/i.test(a.nome)
  );
}

/** Planilha do Google (exportada em CSV) ou arquivo .csv. */
function ehCsv(a: DriveArquivo): boolean {
  return (
    a.mimeType === "application/vnd.google-apps.spreadsheet" ||
    /\.csv$/i.test(a.nome)
  );
}

/** Uma linha de CSV, respeitando campos entre aspas. */
function linhaCsv(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) {
      if (ch === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else atual += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ",") {
      campos.push(atual);
      atual = "";
    } else atual += ch;
  }
  campos.push(atual);
  return campos;
}

/** CSV → tabela Markdown, só para a prévia (a nota guarda o CSV original). */
function csvParaTabela(csv: string, maxLinhas = 200): string {
  const linhas = csv.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length === 0) return csv;
  const celula = (v: string) => v.replace(/\|/g, "\\|").trim() || " ";
  const [cab, ...corpo] = linhas.slice(0, maxLinhas + 1).map(linhaCsv);
  const md = [
    `| ${cab.map(celula).join(" | ")} |`,
    `| ${cab.map(() => "---").join(" | ")} |`,
    ...corpo.map(
      (l) => `| ${cab.map((_, i) => celula(l[i] ?? "")).join(" | ")} |`,
    ),
  ];
  if (linhas.length > maxLinhas + 1)
    md.push("", `_… e mais ${linhas.length - maxLinhas - 1} linhas._`);
  return md.join("\n");
}

/** Corpo da nota quando o arquivo não tem texto extraível. */
function descricaoSemTexto(a: DriveArquivo, motivo?: string): string {
  return [
    `Arquivo do Google Drive: ${a.nome}`,
    a.tamanho ? `Tamanho: ${formatBytes(a.tamanho)}` : "",
    a.dono ? `Dono: ${a.dono}` : "",
    a.webViewLink ? `Link: ${a.webViewLink}` : "",
    motivo ? `\n${motivo}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ----------------------------------------------------------------------

export default function Drive() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const product = getCurrentProduct(pathname);
  const productCode = getProductCodeFromPath(pathname);

  const { projectsByProduct, openCreate } = useProjectsContext();
  const { isConnected, getWorkspace } = useConnectorsContext();
  const { isAuthenticated } = useAuthContext();

  const { temas } = usePastasMemoria();
  const grupos = projectsByProduct(productCode);

  const conectado = isAuthenticated && isConnected(PROVEDOR);
  const workspace = getWorkspace(PROVEDOR);

  // De onde vêm os arquivos: o Drive real (backend) ou o de demonstração.
  const fonte = useMemo(
    () =>
      conectado
        ? {
            listar: fetchArquivosDriveApi,
            caminho: fetchCaminhoDriveApi,
            conteudo: fetchConteudoDriveApi,
            original: (id: string) =>
              fetchOriginalDriveApi(id).catch(() => null),
          }
        : {
            listar: listarDriveDemo,
            caminho: caminhoDriveDemo,
            conteudo: conteudoDriveDemo,
            original: originalDriveDemo,
          },
    [conectado],
  );

  // ---- Navegação ----
  const [visao, setVisao] = useState<DriveVisao>("meu-drive");
  /** Pastas abertas a partir da raiz da visão (breadcrumb). */
  const [trilha, setTrilha] = useState<Pasta[]>([]);
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const pastaAtual = trilha[trilha.length - 1]?.id;

  // ---- Listagem ----
  const [recarga, setRecarga] = useState(0);
  /**
   * Resultado da última leitura, carimbado com a pasta/visão/busca que o
   * gerou. A lista exibida é derivada: com outra chave, ela está carregando —
   * sem limpar estado dentro do efeito.
   */
  const chave = `${conectado ? "real" : "demo"}|${visao}|${pastaAtual ?? ""}|${buscaAtiva}|${recarga}`;
  const [pagina, setPagina] = useState<{
    chave: string;
    arquivos: DriveArquivo[];
    proximaPagina?: string;
    erro: string | null;
  } | null>(null);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [conta, setConta] = useState<string | null>(null);
  const atual = pagina?.chave === chave ? pagina : null;
  const arquivos = atual?.arquivos ?? null;
  const proximaPagina = atual?.proximaPagina;
  const erro = atual?.erro ?? null;

  // ---- Prévia ----
  const [aberto, setAberto] = useState<DriveArquivo | null>(null);
  const [conteudos, setConteudos] = useState<
    Record<string, DriveConteudo | { erro: string }>
  >({});
  const [caminhos, setCaminhos] = useState<Record<string, Pasta[]>>({});

  // ---- Seleção e o que já foi salvo ----
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [noRepositorio, setNoRepositorio] = useState<string[]>(() =>
    readJSON<string[]>(NO_REPOSITORIO_BASE, []),
  );
  /** id do arquivo → ids dos grupos em que ele foi salvo. */
  const [emGrupo, setEmGrupo] = useState<Record<string, string[]>>(() =>
    readJSON<Record<string, string[]>>(EM_GRUPO_BASE, {}),
  );

  // ---- Modais ----
  const [memItem, setMemItem] = useState<ConteudoParaSalvar | null>(null);
  const [grupoItem, setGrupoItem] = useState<ConteudoParaSalvar | null>(null);
  const [lote, setLote] = useState<DriveArquivo[] | null>(null);
  const [progressoLote, setProgressoLote] = useState<number | null>(null);

  /**
   * Download do original começa quando o modal abre: a gravação na pasta
   * precisa acontecer logo depois do clique (o navegador pode pedir permissão
   * de escrita e exige um gesto recente do usuário).
   */
  const originais = useRef<Record<string, Promise<Blob | null>>>({});

  useEffect(
    () => writeJSON(NO_REPOSITORIO_BASE, noRepositorio),
    [noRepositorio],
  );
  useEffect(() => writeJSON(EM_GRUPO_BASE, emGrupo), [emGrupo]);

  // Busca com espera curta: cada tecla não vira uma chamada ao Drive.
  useEffect(() => {
    const t = window.setTimeout(() => setBuscaAtiva(busca.trim()), 400);
    return () => window.clearTimeout(t);
  }, [busca]);

  // ---- Primeira página da pasta/visão/busca atual ----
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const lida = await fonte.listar({
          visao,
          pasta: buscaAtiva ? undefined : pastaAtual,
          busca: buscaAtiva || undefined,
        });
        if (!vivo) return;
        setPagina({
          chave,
          arquivos: lida.arquivos,
          proximaPagina: lida.proximaPagina,
          erro: null,
        });
        if (lida.conta) setConta(lida.conta);
      } catch (err) {
        if (!vivo) return;
        setPagina({
          chave,
          arquivos: [],
          erro: mensagemErro(
            err,
            "Não foi possível ler o Google Drive. Tente novamente.",
          ),
        });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [fonte, chave, visao, pastaAtual, buscaAtiva]);

  const carregarMais = async () => {
    if (!proximaPagina || carregandoMais) return;
    setCarregandoMais(true);
    try {
      const lida = await fetchArquivosDriveApi({
        visao,
        pasta: buscaAtiva ? undefined : pastaAtual,
        busca: buscaAtiva || undefined,
        pageToken: proximaPagina,
      });
      setPagina((prev) =>
        prev && prev.chave === chave
          ? {
              ...prev,
              arquivos: [...prev.arquivos, ...lida.arquivos],
              proximaPagina: lida.proximaPagina,
            }
          : prev,
      );
    } catch (err) {
      toast.error(
        mensagemErro(err, "Não foi possível carregar mais arquivos."),
      );
    } finally {
      setCarregandoMais(false);
    }
  };

  const atualizar = useCallback(() => {
    setConteudos({});
    setCaminhos({});
    originais.current = {};
    setRecarga((n) => n + 1);
  }, []);

  // ---- Conteúdo (prévia) ----
  const carregarConteudo = useCallback(
    async (a: DriveArquivo): Promise<DriveConteudo | null> => {
      const cache = conteudos[a.id];
      if (cache && !("erro" in cache)) return cache;
      try {
        const c = await fonte.conteudo(a.id);
        setConteudos((prev) => ({ ...prev, [a.id]: c }));
        return c;
      } catch (err) {
        const texto = mensagemErro(
          err,
          "Não foi possível ler este arquivo. Tente novamente.",
        );
        setConteudos((prev) => ({ ...prev, [a.id]: { erro: texto } }));
        return null;
      }
    },
    [conteudos, fonte],
  );

  const carregarCaminho = useCallback(
    async (a: DriveArquivo): Promise<Pasta[]> => {
      if (caminhos[a.id]) return caminhos[a.id];
      try {
        const c = await fonte.caminho(a.id);
        setCaminhos((prev) => ({ ...prev, [a.id]: c }));
        return c;
      } catch {
        return [];
      }
    },
    [caminhos, fonte],
  );

  const abrir = (a: DriveArquivo) => {
    if (a.pasta) {
      setBusca("");
      setBuscaAtiva("");
      setAberto(null);
      setSelecionados([]);
      // Pasta aberta a partir de uma busca: a trilha vira o caminho real.
      if (buscaAtiva) {
        setTrilha([{ id: a.id, nome: a.nome }]);
        void fonte
          .caminho(a.id)
          .then((c) => c.length && setTrilha(c))
          .catch(() => undefined);
      } else {
        setTrilha((t) => [...t, { id: a.id, nome: a.nome }]);
      }
      return;
    }
    setAberto(a);
    if (!conteudos[a.id]) void carregarConteudo(a);
    if (!caminhos[a.id]) void carregarCaminho(a);
  };

  const trocarVisao = (v: DriveVisao) => {
    setVisao(v);
    setTrilha([]);
    setBusca("");
    setBuscaAtiva("");
    setAberto(null);
    setSelecionados([]);
  };

  const irParaTrilha = (i: number) => {
    setTrilha((t) => t.slice(0, i));
    setAberto(null);
    setSelecionados([]);
  };

  // ---- Origem gravada na nota ----
  const rotuloVisao = VISOES.find((v) => v.id === visao)?.label ?? "Drive";
  const origemDe = (a: DriveArquivo, caminho?: Pasta[]) => {
    const pastas = (caminho ?? caminhos[a.id] ?? [])
      .map((p) => p.nome)
      .filter((n) => n !== a.nome);
    const local = pastas.length
      ? pastas.join(" / ")
      : trilha.length && !buscaAtiva
        ? trilha.map((p) => p.nome).join(" / ")
        : rotuloVisao;
    return `Google Drive · ${local} / ${a.nome}`;
  };

  const pacote = (
    a: DriveArquivo,
    c: DriveConteudo | null,
    caminho?: Pasta[],
  ): ConteudoParaSalvar => ({
    id: a.id,
    titulo: semExtensao(a.nome),
    conteudo: c?.texto?.trim() ? c.texto : descricaoSemTexto(a, c?.motivo),
    origem: origemDe(a, caminho),
    contexto: [
      a.nome,
      a.dono,
      a.modificadoEm ? `modificado em ${formatDate(a.modificadoEm)}` : "",
      c && !c.suportado ? "sem texto extraível — vai só o original" : "",
    ]
      .filter(Boolean)
      .join(" · "),
  });

  const prefetchOriginal = (a: DriveArquivo) => {
    originais.current[a.id] ??= fonte.original(a.id);
    return originais.current[a.id];
  };

  const anexoOriginal = async (
    a: DriveArquivo,
  ): Promise<AnexoMemoria | undefined> => {
    const blob = await prefetchOriginal(a);
    if (!blob) {
      // Sem o original (grande demais, tipo sem download) a nota ainda vale.
      delete originais.current[a.id];
      return undefined;
    }
    return { nome: nomeDoOriginal(a), dados: blob };
  };

  // ---- Salvar no Repositório (um arquivo) ----
  const arquivoDoModal = useRef<DriveArquivo | null>(null);

  const salvarArquivo = async (a: DriveArquivo) => {
    arquivoDoModal.current = a;
    void prefetchOriginal(a);
    const [c, caminho] = await Promise.all([
      carregarConteudo(a),
      carregarCaminho(a),
    ]);
    setMemItem(pacote(a, c, caminho));
  };

  const gravarNaMemoria = async (
    tema: string,
    titulo: string,
    conteudo: string,
  ) => {
    const item = memItem;
    const a = arquivoDoModal.current;
    if (!item || !a) return;
    const original = await anexoOriginal(a);
    const r = await salvarConteudoNaMemoria({
      pasta: tema,
      titulo,
      conteudo,
      origem: item.origem,
      data: a.modificadoEm ? formatDate(a.modificadoEm) : undefined,
      tags: ["drive"],
      original,
    });
    if (!r.ok) {
      avisarFalhaAoSalvarNaMemoria(r.reason);
      return;
    }
    setNoRepositorio((prev) => (prev.includes(a.id) ? prev : [...prev, a.id]));
    setMemItem(null);
    toast.success("Salvo no Repositório.", {
      description: `${r.pasta}/${r.arquivo}${
        original || !conectado
          ? ""
          : " — sem o arquivo original (não pôde ser baixado)"
      }`,
    });
  };

  // ---- Salvar no Repositório (seleção múltipla) ----
  const arquivosSelecionados = useMemo(
    () => (arquivos ?? []).filter((a) => selecionados.includes(a.id)),
    [arquivos, selecionados],
  );

  const abrirLote = () => {
    if (arquivosSelecionados.length === 0) return;
    arquivosSelecionados.forEach((a) => void prefetchOriginal(a));
    setLote(arquivosSelecionados);
  };

  const gravarLote = async (tema: string) => {
    if (!lote) return;
    let ok = 0;
    const falhas: string[] = [];
    for (let i = 0; i < lote.length; i++) {
      setProgressoLote(i);
      const a = lote[i];
      const [c, caminho] = await Promise.all([
        carregarConteudo(a),
        carregarCaminho(a),
      ]);
      const p = pacote(a, c, caminho);
      const r = await salvarConteudoNaMemoria({
        pasta: tema,
        titulo: p.titulo,
        conteudo: p.conteudo,
        origem: p.origem,
        data: a.modificadoEm ? formatDate(a.modificadoEm) : undefined,
        tags: ["drive"],
        original: await anexoOriginal(a),
      });
      if (r.ok) {
        ok++;
        setNoRepositorio((prev) =>
          prev.includes(a.id) ? prev : [...prev, a.id],
        );
        continue;
      }
      // Pasta ausente ou sem permissão vale para todos: pára já.
      if (r.reason !== "error") {
        setProgressoLote(null);
        avisarFalhaAoSalvarNaMemoria(r.reason);
        return;
      }
      falhas.push(a.nome);
    }
    setProgressoLote(null);
    setLote(null);
    setSelecionados([]);
    if (falhas.length === 0) {
      toast.success(
        `${ok} ${ok === 1 ? "arquivo salvo" : "arquivos salvos"} no Repositório.`,
        { description: `Pasta ${tema} — recarregue o grafo para ver os nós.` },
      );
    } else {
      toast.error(`${ok} salvos, ${falhas.length} com falha.`, {
        description: falhas.join(", "),
      });
    }
  };

  // ---- Salvar no Grupo ----
  const salvarArquivoNoGrupo = async (a: DriveArquivo) => {
    arquivoDoModal.current = a;
    void prefetchOriginal(a);
    const [c, caminho] = await Promise.all([
      carregarConteudo(a),
      carregarCaminho(a),
    ]);
    setGrupoItem(pacote(a, c, caminho));
  };

  const gravarNoGrupo = async (projectId: string) => {
    const item = grupoItem;
    const a = arquivoDoModal.current;
    const grupo = grupos.find((g) => g.id === projectId);
    if (!item || !a || !grupo) return;
    if (emGrupo[a.id]?.includes(projectId)) {
      setGrupoItem(null);
      toast("Este arquivo já está no grupo.", { description: grupo.title });
      return;
    }
    const r = await salvarDocumentoNoGrupo({
      grupo: grupo.title,
      titulo: item.titulo,
      conteudo: item.conteudo,
      origem: item.origem,
      tags: ["drive"],
      original: await anexoOriginal(a),
    });
    if (!r.ok) {
      avisarFalhaMemoria(r.reason);
      return;
    }
    setEmGrupo((prev) => ({
      ...prev,
      [a.id]: [...(prev[a.id] ?? []), projectId],
    }));
    setGrupoItem(null);
    toast.success("Salvo no grupo.", {
      description: `${grupo.title} · em Documentos do grupo.`,
    });
  };

  const alternarSelecao = (id: string) =>
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const carregando = arquivos === null;
  // O drawer continua mostrando o último arquivo enquanto anima o fechamento.
  const [exibido, setExibido] = useState<DriveArquivo | null>(null);
  if (aberto && aberto !== exibido) setExibido(aberto);
  const nomesGrupo = (id: string) =>
    (emGrupo[id] ?? [])
      .map((gid) => grupos.find((g) => g.id === gid)?.title)
      .filter(Boolean) as string[];

  return (
    <Page title={`Google Drive · ${product.name}`}>
      <div className="transition-content flex min-h-0 w-full flex-col px-(--margin-x) py-6">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <span className="bg-primary-600/10 text-primary-600 dark:bg-primary-400/10 dark:text-primary-400 grid size-11 place-items-center rounded-xl">
            <FolderOpenIcon className="size-6 stroke-[1.5]" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <PageTitle
              help={{
                description: (
                  <>
                    <p>
                      <strong>Google Drive</strong> mostra as pastas e os
                      arquivos da conta autorizada em Conectores — o seu Drive,
                      o que foi compartilhado com você e os recentes. Abra um
                      arquivo para ver o conteúdo antes de decidir.
                    </p>
                    <p>
                      De cada arquivo (ou de vários selecionados) você pode{" "}
                      <strong>Salvar no Repositório</strong> — o texto vira um
                      contexto da IA e o arquivo original fica ao lado da nota —
                      ou <strong>Salvar no Grupo</strong>.
                    </p>
                  </>
                ),
              }}
            >
              Google Drive
            </PageTitle>
            <p className="dark:text-dark-300 truncate text-sm text-gray-400">
              {conectado
                ? `Drive conectado${
                    conta || workspace ? ` · ${conta ?? workspace}` : ""
                  }`
                : "Navegue pelos seus arquivos e guarde o que importa no Repositório ou num grupo."}
            </p>
          </div>
          {
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                variant="outlined"
                onClick={atualizar}
                disabled={carregando}
                className="text-xs-plus h-8 gap-1.5 px-2.5"
              >
                {carregando ? (
                  <Spinner className="size-4" />
                ) : (
                  <ArrowPathIcon className="size-4" />
                )}
                {carregando ? "Atualizando…" : "Atualizar"}
              </Button>
            </div>
          }
        </div>

        {/* Sem conector: o Drive exibido é o de demonstração. */}
        {!conectado && (
          <div className="dark:border-dark-600 dark:bg-dark-700 dark:text-dark-300 text-xs-plus mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-500">
            <span className="min-w-0 flex-1">
              Este é um Drive de demonstração. Conecte o Google Drive em{" "}
              <span className="dark:text-dark-100 font-medium text-gray-700">
                Conectores
              </span>{" "}
              para ver os seus arquivos aqui.
            </span>
            <Button
              variant="outlined"
              className="text-tiny h-7 shrink-0 px-2.5"
              onClick={() => navigate(`/${productCode}/conectores`)}
            >
              Abrir Conectores
            </Button>
          </div>
        )}

        {
          <>
            {erro && (
              <div className="dark:border-warning/30 dark:bg-warning/10 mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="dark:text-dark-100 text-sm text-gray-700">
                    {erro}
                  </p>
                  <Button
                    variant="outlined"
                    onClick={atualizar}
                    className="text-tiny mt-2 h-7 gap-1.5 px-2.5"
                  >
                    <ArrowPathIcon className="size-3.5" />
                    Tentar de novo
                  </Button>
                </div>
              </div>
            )}

            {/* Busca + visões */}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar no Drive…"
                prefix={<MagnifyingGlassIcon className="size-4.5" />}
                classNames={{ root: "sm:max-w-sm" }}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {VISOES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => trocarVisao(v.id)}
                    className={clsx(
                      "text-xs-plus rounded-lg px-3 py-1.5 font-medium transition-colors",
                      visao === v.id && !buscaAtiva
                        ? "bg-primary-600/10 text-primary-600 dark:bg-primary-400/10 dark:text-primary-400"
                        : "dark:text-dark-300 dark:hover:bg-dark-600 text-gray-500 hover:bg-gray-100",
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Corpo: lista (a prévia abre num drawer lateral) */}
            <div className="mt-5">
              <section className="dark:border-dark-600 dark:bg-dark-700 flex min-w-0 flex-col rounded-xl border border-gray-200 bg-white">
                {/* Breadcrumb + ações da seleção */}
                <div className="dark:border-dark-600 flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3">
                  <nav
                    aria-label="Caminho"
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm"
                  >
                    {buscaAtiva ? (
                      <span className="dark:text-dark-100 font-medium text-gray-800">
                        Resultados para “{buscaAtiva}”
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => irParaTrilha(0)}
                          className={clsx(
                            "rounded px-1 font-medium",
                            trilha.length
                              ? "text-primary-600 dark:text-primary-400 hover:underline"
                              : "dark:text-dark-100 text-gray-800",
                          )}
                        >
                          {rotuloVisao}
                        </button>
                        {trilha.map((p, i) => (
                          <span key={p.id} className="flex items-center gap-1">
                            <ChevronRightIcon className="dark:text-dark-400 size-3.5 text-gray-400" />
                            <button
                              type="button"
                              onClick={() => irParaTrilha(i + 1)}
                              disabled={i === trilha.length - 1}
                              className={clsx(
                                "max-w-[12rem] truncate rounded px-1",
                                i === trilha.length - 1
                                  ? "dark:text-dark-100 font-medium text-gray-800"
                                  : "text-primary-600 dark:text-primary-400 hover:underline",
                              )}
                            >
                              {p.nome}
                            </button>
                          </span>
                        ))}
                      </>
                    )}
                  </nav>
                  {selecionados.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="dark:text-dark-300 text-xs-plus text-gray-500">
                        {selecionados.length}{" "}
                        {selecionados.length === 1
                          ? "selecionado"
                          : "selecionados"}
                      </span>
                      <Button
                        color="primary"
                        onClick={abrirLote}
                        className="text-xs-plus h-8 gap-1.5 px-2.5"
                      >
                        <CpuChipIcon className="size-4" />
                        Salvar no Repositório
                      </Button>
                      <Button
                        variant="flat"
                        onClick={() => setSelecionados([])}
                        className="text-xs-plus h-8 px-2.5"
                      >
                        Limpar
                      </Button>
                    </div>
                  )}
                </div>

                <div className="panel-scroll px-2 py-2 [--panel-offset:22.5rem]">
                  {carregando ? (
                    <div className="flex items-center justify-center gap-2 py-10">
                      <Spinner className="size-4" />
                      <p className="dark:text-dark-400 text-sm text-gray-400">
                        Lendo o Drive…
                      </p>
                    </div>
                  ) : (arquivos ?? []).length === 0 ? (
                    <p className="dark:text-dark-400 py-10 text-center text-sm text-gray-400">
                      {erro
                        ? "Não foi possível carregar os arquivos."
                        : buscaAtiva
                          ? "Nenhum arquivo encontrado."
                          : "Esta pasta está vazia."}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {(arquivos ?? []).map((a) => (
                        <LinhaArquivo
                          key={a.id}
                          arquivo={a}
                          aberto={aberto?.id === a.id}
                          selecionado={selecionados.includes(a.id)}
                          noRepositorio={noRepositorio.includes(a.id)}
                          grupos={nomesGrupo(a.id)}
                          onAbrir={() => abrir(a)}
                          onSelecionar={() => alternarSelecao(a.id)}
                        />
                      ))}
                    </ul>
                  )}
                  {proximaPagina && !carregando && (
                    <div className="flex justify-center py-3">
                      <Button
                        variant="outlined"
                        onClick={() => void carregarMais()}
                        disabled={carregandoMais}
                        className="text-xs-plus h-8 gap-1.5 px-3"
                      >
                        {carregandoMais && <Spinner className="size-4" />}
                        {carregandoMais ? "Carregando…" : "Carregar mais"}
                      </Button>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        }
      </div>

      {/* Prévia: drawer lateral */}
      <Transition show={aberto !== null} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-61"
          onClose={() => setAberto(null)}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm dark:bg-black/40" />
          </TransitionChild>

          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="ease-in duration-150"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <DialogPanel className="dark:bg-dark-700 fixed inset-y-0 right-0 flex w-screen flex-col bg-white shadow-xl sm:inset-y-2 sm:mr-2 sm:w-[30rem] sm:rounded-xl">
              {exibido && (
                <>
                  <div className="dark:border-dark-600 flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
                    <div className="min-w-0">
                      <DialogTitle
                        as="h3"
                        className="dark:text-dark-50 truncate text-sm font-semibold text-gray-800"
                      >
                        {exibido.nome}
                      </DialogTitle>
                      <p className="dark:text-dark-300 text-tiny truncate text-gray-500">
                        {[
                          exibido.dono,
                          exibido.modificadoEm
                            ? formatDate(exibido.modificadoEm)
                            : "",
                          exibido.tamanho ? formatBytes(exibido.tamanho) : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {(caminhos[exibido.id]?.length ?? 0) > 1 && (
                        <p className="dark:text-dark-400 text-tiny truncate text-gray-400">
                          {caminhos[exibido.id]
                            .slice(0, -1)
                            .map((p) => p.nome)
                            .join(" / ")}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {noRepositorio.includes(exibido.id) && (
                          <Badge
                            color="primary"
                            variant="soft"
                            className="text-tiny"
                          >
                            Já no Repositório
                          </Badge>
                        )}
                        {nomesGrupo(exibido.id).map((g) => (
                          <Badge
                            key={g}
                            color="info"
                            variant="soft"
                            className="text-tiny max-w-[9rem] truncate"
                          >
                            {g}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {exibido.webViewLink && (
                        <a
                          href={exibido.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir no Drive"
                          aria-label="Abrir no Drive"
                          className="dark:text-dark-200 dark:hover:bg-dark-600 grid size-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"
                        >
                          <ArrowTopRightOnSquareIcon className="size-4.5" />
                        </a>
                      )}
                      <Button
                        variant="flat"
                        isIcon
                        onClick={() => setAberto(null)}
                        className="size-8 shrink-0 rounded-lg"
                        aria-label="Fechar prévia"
                      >
                        <XMarkIcon className="size-5" />
                      </Button>
                    </div>
                  </div>

                  <div className="dark:border-dark-600 flex shrink-0 gap-2 border-b border-gray-200 px-4 py-3">
                    <Button
                      color="primary"
                      onClick={() => void salvarArquivo(exibido)}
                      className="text-xs-plus h-8 flex-1 gap-1.5 px-2.5"
                    >
                      <CpuChipIcon className="size-4" />
                      Salvar no Repositório
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => void salvarArquivoNoGrupo(exibido)}
                      className="text-xs-plus h-8 flex-1 gap-1.5 px-2.5"
                    >
                      <FolderPlusIcon className="size-4" />
                      Salvar no Grupo
                    </Button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    <Previa
                      arquivo={exibido}
                      conteudo={conteudos[exibido.id]}
                    />
                  </div>
                </>
              )}
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>

      <SalvarNaMemoriaModal
        item={memItem}
        temas={temas}
        close={() => setMemItem(null)}
        onConfirm={gravarNaMemoria}
      />

      <SalvarVariosNaMemoriaModal
        itens={lote ? lote.map((a) => a.nome) : null}
        temas={temas}
        progresso={progressoLote}
        close={() => setLote(null)}
        onConfirm={gravarLote}
      />

      <SalvarNoGrupoModal
        item={grupoItem}
        grupos={grupos.map((g) => ({
          id: g.id,
          title: g.title,
          jaTem: !!grupoItem && !!emGrupo[grupoItem.id]?.includes(g.id),
        }))}
        close={() => setGrupoItem(null)}
        onConfirm={(id) => void gravarNoGrupo(id)}
        onCriarGrupo={() => {
          setGrupoItem(null);
          openCreate();
        }}
      />
    </Page>
  );
}

// ----------------------------------------------------------------------
// Uma linha da lista: pasta (abre) ou arquivo (abre a prévia no drawer; a caixa marca
// para salvar em lote).
// ----------------------------------------------------------------------

function LinhaArquivo({
  arquivo: a,
  aberto,
  selecionado,
  noRepositorio,
  grupos,
  onAbrir,
  onSelecionar,
}: {
  arquivo: DriveArquivo;
  aberto: boolean;
  selecionado: boolean;
  noRepositorio: boolean;
  grupos: string[];
  onAbrir: () => void;
  onSelecionar: () => void;
}) {
  const ext = extDoArquivo(a);
  return (
    <li
      className={clsx(
        "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors",
        aberto
          ? "bg-primary-600/10 dark:bg-primary-400/10"
          : "dark:hover:bg-dark-600/50 hover:bg-gray-50",
      )}
    >
      <span className="grid w-5 shrink-0 place-items-center">
        {!a.pasta && (
          <Checkbox
            checked={selecionado}
            onChange={onSelecionar}
            aria-label={`Selecionar ${a.nome}`}
          />
        )}
      </span>
      <button
        type="button"
        onClick={onAbrir}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {a.pasta ? (
          <FolderIcon className="size-8 shrink-0 stroke-[1.2] text-amber-500" />
        ) : ext ? (
          <span
            className={clsx(
              "text-tiny grid size-8 shrink-0 place-items-center rounded-lg font-semibold text-white uppercase",
              tintForExt(ext),
            )}
          >
            {ext.slice(0, 4)}
          </span>
        ) : (
          <DocumentIcon className="dark:text-dark-300 size-8 shrink-0 stroke-[1.2] text-gray-400" />
        )}
        <span className="min-w-0 flex-1">
          <span className="dark:text-dark-100 block truncate text-sm font-medium text-gray-800">
            {a.nome}
          </span>
          <span className="dark:text-dark-400 text-tiny block truncate text-gray-400">
            {[
              a.pasta ? "Pasta" : a.tamanho ? formatBytes(a.tamanho) : "",
              a.modificadoEm ? formatDate(a.modificadoEm) : "",
              a.dono,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-1">
        {noRepositorio && (
          <Badge color="primary" variant="soft" className="text-tiny">
            No Repositório
          </Badge>
        )}
        {grupos.length > 0 && (
          <Badge
            color="info"
            variant="soft"
            className="text-tiny max-w-[9rem] truncate"
          >
            {grupos.length > 1 ? `${grupos.length} grupos` : grupos[0]}
          </Badge>
        )}
      </span>
    </li>
  );
}

// ----------------------------------------------------------------------
// Prévia do arquivo aberto: texto extraído (Markdown para Docs/.md), ou a
// miniatura do Drive quando o tipo não tem texto.
// ----------------------------------------------------------------------

function Previa({
  arquivo,
  conteudo,
}: {
  arquivo: DriveArquivo;
  conteudo: DriveConteudo | { erro: string } | undefined;
}) {
  if (!conteudo) {
    return (
      <div className="flex items-center justify-center gap-2 py-10">
        <Spinner className="size-4" />
        <p className="dark:text-dark-400 text-sm text-gray-400">
          Lendo o arquivo…
        </p>
      </div>
    );
  }
  if ("erro" in conteudo) {
    return (
      <p className="dark:text-dark-300 py-8 text-center text-sm text-gray-500">
        {conteudo.erro}
      </p>
    );
  }
  if (!conteudo.texto) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        {arquivo.thumbnailLink ? (
          <img
            src={arquivo.thumbnailLink}
            alt=""
            referrerPolicy="no-referrer"
            className="dark:border-dark-500 max-h-72 rounded-lg border border-gray-200 object-contain"
          />
        ) : (
          <DocumentIcon className="dark:text-dark-400 size-12 stroke-1 text-gray-300" />
        )}
        <p className="dark:text-dark-300 text-xs-plus max-w-xs text-gray-500">
          {conteudo.motivo ?? "Sem prévia de texto para este arquivo."} Ao
          salvar, o arquivo original vai junto para o Repositório.
        </p>
      </div>
    );
  }
  return (
    <div>
      {conteudo.truncado && (
        <p className="dark:text-dark-300 text-tiny mb-2 rounded-lg bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-500/10">
          Texto longo: a prévia e a nota trazem só o início do arquivo.
        </p>
      )}
      {ehMarkdown(arquivo) || ehCsv(arquivo) ? (
        <div className="text-sm">
          <MarkdownView>
            {ehCsv(arquivo) ? csvParaTabela(conteudo.texto) : conteudo.texto}
          </MarkdownView>
        </div>
      ) : (
        <pre className="dark:text-dark-200 text-xs-plus font-sans leading-relaxed break-words whitespace-pre-wrap text-gray-600">
          {conteudo.texto}
        </pre>
      )}
    </div>
  );
}
