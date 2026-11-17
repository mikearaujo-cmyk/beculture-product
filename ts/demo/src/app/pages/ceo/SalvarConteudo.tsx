// Import Dependencies
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CpuChipIcon, FolderIcon } from "@heroicons/react/24/outline";

// Local Imports
import { Button, Spinner } from "@/components/ui";
import { Input, Select, Textarea } from "@/components/ui/Form";
import { MemoriaTextarea } from "@/components/shared/MemoriaMentions";
import { ModalShell } from "@/components/shared/ModalShell";

// ----------------------------------------------------------------------
// Os dois destinos de qualquer conteúdo trazido por um conector (E-mail,
// Slack…): o Repositório da IA e um Grupo. Os modais moram aqui porque as páginas
// dos conectores só diferem no que colocam dentro de `ConteudoParaSalvar` —
// ver pages/ceo/Email.tsx e pages/ceo/Slack.tsx.
// ----------------------------------------------------------------------

export interface ConteudoParaSalvar {
  /** Id estável na origem (e-mail, mensagem, thread) — evita duplicata no grupo. */
  id: string;
  titulo: string;
  conteudo: string;
  /** De onde veio, gravado na memória. Ex.: "E-mail · Camila", "Slack · #produto". */
  origem: string;
  /** Linha de contexto exibida no topo do modal. */
  contexto: string;
}

export interface GrupoOpcao {
  id: string;
  title: string;
  /** Este conteúdo já está salvo neste grupo. */
  jaTem: boolean;
}

/** Tema = pasta do Repositório. Monte a lista com `usePastasMemoria`. */
interface TemaOpcao {
  id: string;
  label: string;
}

// ----------------------------------------------------------------------
// "Salvar no Repositório" — deixa escolher o tema (uma das pastas disponíveis na
// Memória) e revisar título/conteúdo antes de gravar. A revisão importa:
// conteúdo de conector vem com assinatura, citação e ruído que não deveriam
// entrar na memória da IA.
// ----------------------------------------------------------------------

export function SalvarNaMemoriaModal({
  item,
  temas,
  close,
  onConfirm,
}: {
  item: ConteudoParaSalvar | null;
  temas: TemaOpcao[];
  close: () => void;
  onConfirm: (tema: string, titulo: string, conteudo: string) => Promise<void>;
}) {
  const [tema, setTema] = useState("");
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const abertoRef = useRef(false);

  // Preenche os campos quando o modal abre — e só então, para não sobrescrever
  // o que o usuário já editou.
  useEffect(() => {
    if (item && !abertoRef.current) {
      abertoRef.current = true;
      setTema(temas[0]?.id ?? "");
      setTitulo(item.titulo);
      setConteudo(item.conteudo);
      setSalvando(false);
    }
    if (!item) abertoRef.current = false;
  }, [item, temas]);

  const podeSalvar = !!tema && !!titulo.trim() && !!conteudo.trim();

  const confirmar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      await onConfirm(tema, titulo.trim(), conteudo.trim());
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalShell
      show={!!item}
      close={close}
      icon={CpuChipIcon}
      title="Salvar no Repositório"
      description="O conteúdo vira um contexto da IA e passa a aparecer no grafo."
      footer={
        <>
          <Button variant="outlined" className="rounded-lg" onClick={close}>
            Cancelar
          </Button>
          <Button
            color="primary"
            className="gap-1.5 rounded-lg"
            onClick={confirmar}
            disabled={salvando || !podeSalvar}
          >
            {salvando && <Spinner className="size-4" />}
            {salvando ? "Gravando…" : "Gravar no Repositório"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="dark:text-dark-300 text-xs-plus text-gray-500">
          {item?.contexto}
        </p>
        <Select
          label="Tema"
          value={tema}
          onChange={(e) => setTema(e.target.value)}
          data={temas.map((t) => ({ label: t.label, value: t.id }))}
          description="Os temas são as pastas disponíveis no Repositório."
        />
        <Input
          label="Título"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <Textarea
          component={MemoriaTextarea}
          label="Conteúdo"
          rows={8}
          value={conteudo}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setConteudo(e.target.value)
          }
          description="Edite antes de gravar — “[[” conecta o trecho a uma nota do Repositório."
        />
      </div>
    </ModalShell>
  );
}

// ----------------------------------------------------------------------
// "Salvar no Repositório" de VÁRIOS itens de uma vez (seleção múltipla do
// Google Drive). Sem revisão item a item: só o tema; cada item vira uma nota
// com o próprio título e conteúdo. O progresso vem de quem chama.
// ----------------------------------------------------------------------

export function SalvarVariosNaMemoriaModal({
  itens,
  temas,
  progresso,
  close,
  onConfirm,
}: {
  /** Títulos do que será gravado; null fecha o modal. */
  itens: string[] | null;
  temas: TemaOpcao[];
  /** Quantos já foram gravados enquanto o lote roda (null = parado). */
  progresso: number | null;
  close: () => void;
  onConfirm: (tema: string) => Promise<void>;
}) {
  const [tema, setTema] = useState("");
  const abertoRef = useRef(false);

  useEffect(() => {
    if (itens && !abertoRef.current) {
      abertoRef.current = true;
      setTema(temas[0]?.id ?? "");
    }
    if (!itens) abertoRef.current = false;
  }, [itens, temas]);

  const total = itens?.length ?? 0;
  const salvando = progresso !== null;

  return (
    <ModalShell
      show={!!itens}
      close={salvando ? () => undefined : close}
      icon={CpuChipIcon}
      title="Salvar no Repositório"
      description="Cada arquivo vira um contexto da IA e passa a aparecer no grafo."
      footer={
        <>
          <Button
            variant="outlined"
            className="rounded-lg"
            onClick={close}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            color="primary"
            className="gap-1.5 rounded-lg"
            onClick={() => void onConfirm(tema)}
            disabled={salvando || !tema || total === 0}
          >
            {salvando && <Spinner className="size-4" />}
            {salvando
              ? `Gravando ${Math.min(progresso + 1, total)} de ${total}…`
              : `Gravar ${total} ${total === 1 ? "arquivo" : "arquivos"}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Tema"
          value={tema}
          onChange={(e) => setTema(e.target.value)}
          data={temas.map((t) => ({ label: t.label, value: t.id }))}
          description="Os temas são as pastas disponíveis no Repositório."
          disabled={salvando}
        />
        <ul className="dark:border-dark-500 dark:bg-dark-800 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
          {(itens ?? []).map((t, i) => (
            <li
              key={`${t}-${i}`}
              className="dark:text-dark-200 text-xs-plus truncate text-gray-600"
            >
              {t}
            </li>
          ))}
        </ul>
      </div>
    </ModalShell>
  );
}

// ----------------------------------------------------------------------
// "Salvar no Grupo" — escolhe o agrupamento que recebe uma cópia do conteúdo.
// Sem grupos criados, oferece o atalho para criar o primeiro.
// ----------------------------------------------------------------------

export function SalvarNoGrupoModal({
  item,
  grupos,
  close,
  onConfirm,
  onCriarGrupo,
}: {
  item: ConteudoParaSalvar | null;
  grupos: GrupoOpcao[];
  close: () => void;
  onConfirm: (projectId: string) => void;
  onCriarGrupo: () => void;
}) {
  const [grupoId, setGrupoId] = useState("");
  const abertoRef = useRef(false);

  useEffect(() => {
    if (item && !abertoRef.current) {
      abertoRef.current = true;
      setGrupoId(grupos.find((g) => !g.jaTem)?.id ?? "");
    }
    if (!item) abertoRef.current = false;
  }, [item, grupos]);

  const semGrupos = grupos.length === 0;

  return (
    <ModalShell
      show={!!item}
      close={close}
      icon={FolderIcon}
      title="Salvar no Grupo"
      description="O conteúdo é copiado para o grupo e aparece na página dele."
      footer={
        <>
          <Button variant="outlined" className="rounded-lg" onClick={close}>
            Cancelar
          </Button>
          {semGrupos ? (
            <Button
              color="primary"
              className="rounded-lg"
              onClick={onCriarGrupo}
            >
              Criar grupo
            </Button>
          ) : (
            <Button
              color="primary"
              className="rounded-lg"
              onClick={() => onConfirm(grupoId)}
              disabled={!grupoId}
            >
              Salvar no grupo
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="dark:border-dark-500 dark:bg-dark-800 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="dark:text-dark-100 truncate text-sm font-medium text-gray-800">
            {item?.titulo}
          </p>
          <p className="dark:text-dark-300 text-xs-plus mt-1 line-clamp-3 whitespace-pre-line text-gray-500">
            {item?.conteudo}
          </p>
        </div>

        {semGrupos ? (
          <p className="dark:text-dark-300 text-sm text-gray-500">
            Nenhum grupo criado neste produto. Crie o primeiro para guardar
            e-mails, conversas e documentos no mesmo lugar.
          </p>
        ) : (
          <Select
            label="Grupo"
            value={grupoId}
            onChange={(e) => setGrupoId(e.target.value)}
            data={grupos.map((g) => ({
              label: g.jaTem ? `${g.title} (já salvo)` : g.title,
              value: g.id,
              disabled: g.jaTem,
            }))}
          />
        )}
      </div>
    </ModalShell>
  );
}
