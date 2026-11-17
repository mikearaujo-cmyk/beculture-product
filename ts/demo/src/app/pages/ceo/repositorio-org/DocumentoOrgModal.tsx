// Import Dependencies
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DocumentTextIcon } from "@heroicons/react/24/outline";

// Local Imports
import { Button, Spinner } from "@/components/ui";
import { ModalShell } from "@/components/shared/ModalShell";
import { MarkdownView } from "../MarkdownView";
import {
  editarDocumentoOrg,
  obterDocumentoOrg,
  type DocumentoOrg,
} from "@/services/api/repositorioOrg";
import { mensagemDeErro } from "@/services/api/compartilhamentos";

// ----------------------------------------------------------------------
// Um documento do Repositório da organização: leitura para quem tem
// `documentos.visualizar`; edição do texto (.md/.txt) para quem tem
// `documentos.editar`. O servidor confere as duas coisas e audita.
// ----------------------------------------------------------------------

type Carregado = Awaited<ReturnType<typeof obterDocumentoOrg>>;

export function DocumentoOrgModal({
  dono,
  doc,
  podeEditar,
  close,
  onEditado,
}: {
  dono: string | null;
  doc: DocumentoOrg | null;
  podeEditar: boolean;
  close: () => void;
  onEditado: (doc: DocumentoOrg) => void;
}) {
  const [estado, setEstado] = useState<{
    id: string;
    doc?: Carregado;
    erro?: string;
  } | null>(null);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!doc || !dono) return;
    let vivo = true;
    obterDocumentoOrg(dono, doc.id)
      .then((d) => vivo && setEstado({ id: doc.id, doc: d }))
      .catch(
        (err) =>
          vivo &&
          setEstado({
            id: doc.id,
            erro: mensagemDeErro(err, "Não foi possível abrir o documento."),
          }),
      );
    return () => {
      vivo = false;
    };
  }, [doc, dono]);

  const atual = estado && doc && estado.id === doc.id ? estado : null;

  const fechar = () => {
    setEditando(false);
    close();
  };

  const salvar = async () => {
    if (!doc || !dono) return;
    setSalvando(true);
    try {
      const novo = await editarDocumentoOrg(dono, doc.id, texto);
      onEditado(novo);
      setEstado((e) =>
        e?.doc ? { ...e, doc: { ...e.doc, conteudo: texto } } : e,
      );
      setEditando(false);
      toast.success("Documento atualizado");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };

  const origem =
    atual?.doc?.origemTipo === "copia_nota"
      ? `Cópia de uma nota de ${atual.doc.origemDonoNome ?? "um membro"} — pertence à organização`
      : `Adicionado por ${doc?.adicionadoPorNome ?? ""}`;

  return (
    <ModalShell
      show={!!doc}
      close={fechar}
      icon={DocumentTextIcon}
      title={doc?.nome ?? ""}
      description={origem}
      largura="max-w-3xl"
      footer={
        editando ? (
          <>
            <Button
              variant="outlined"
              onClick={() => setEditando(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              color="primary"
              onClick={() => void salvar()}
              disabled={salvando}
              className="gap-2"
            >
              {salvando && <Spinner className="size-4" />}
              Salvar
            </Button>
          </>
        ) : (
          <>
            {podeEditar && atual?.doc?.editavel && (
              <Button
                variant="outlined"
                onClick={() => {
                  setTexto(atual.doc!.conteudo);
                  setEditando(true);
                }}
              >
                Editar
              </Button>
            )}
            <Button color="primary" onClick={fechar}>
              Fechar
            </Button>
          </>
        )
      }
    >
      {!atual && (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      )}
      {atual?.erro && <p className="text-error text-sm">{atual.erro}</p>}
      {atual?.doc &&
        (editando ? (
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="form-textarea dark:bg-dark-700 dark:border-dark-450 dark:text-dark-100 h-[55vh] w-full rounded-lg border border-gray-300 bg-white p-3 font-mono text-sm focus:ring-0"
          />
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <MarkdownView>{atual.doc.conteudo || "_Sem texto extraído._"}</MarkdownView>
          </div>
        ))}
    </ModalShell>
  );
}
