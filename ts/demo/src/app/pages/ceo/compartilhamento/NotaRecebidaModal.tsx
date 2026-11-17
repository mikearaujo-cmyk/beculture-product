// Import Dependencies
import { useEffect, useState } from "react";
import { EyeIcon } from "@heroicons/react/24/outline";

// Local Imports
import { Badge, Button, Spinner } from "@/components/ui";
import { DrawerShell } from "@/components/shared/DrawerShell";
import { MarkdownView } from "../MarkdownView";
import {
  conteudoRecebidoApi,
  mensagemDeErro,
  type ConteudoRecebido,
  type Recebido,
} from "@/services/api/compartilhamentos";
import { parseNotaMd } from "../memoria-inventario";

// ----------------------------------------------------------------------
// Leitura de uma nota que OUTRA pessoa compartilhou com você. Só leitura: a
// nota mora na pasta do dono. Cada abertura é registrada na auditoria.
// ----------------------------------------------------------------------

export function NotaRecebidaModal({
  item,
  close,
  onAdministrar,
}: {
  item: Recebido | null;
  close: () => void;
  onAdministrar?: (item: Recebido) => void;
}) {
  const [resultado, setResultado] = useState<{
    id: string;
    nota?: ConteudoRecebido;
    erro?: string;
  } | null>(null);

  useEffect(() => {
    if (!item) return;
    let vivo = true;
    conteudoRecebidoApi(item.vaultNotaId)
      .then((nota) => vivo && setResultado({ id: item.vaultNotaId, nota }))
      .catch(
        (err) =>
          vivo &&
          setResultado({
            id: item.vaultNotaId,
            erro: mensagemDeErro(err, "Não foi possível abrir a nota."),
          }),
      );
    return () => {
      vivo = false;
    };
  }, [item]);

  const atual = resultado && item && resultado.id === item.vaultNotaId ? resultado : null;
  const corpo = atual?.nota ? parseNotaMd(atual.nota.conteudo).body : "";

  return (
    <DrawerShell
      show={!!item}
      close={close}
      icon={EyeIcon}
      title={item?.titulo ?? ""}
      description={item ? `Compartilhada por ${item.donoNome} · somente leitura` : ""}
      footer={
        <>
          {item?.administrar && onAdministrar && (
            <Button variant="outlined" onClick={() => onAdministrar(item)}>
              Gerenciar acesso
            </Button>
          )}
          <Button color="primary" onClick={close}>
            Fechar
          </Button>
        </>
      }
    >
      {item && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Badge variant="soft" color="neutral" className="text-tiny">
            Visualizar
          </Badge>
          {item.usarIa && (
            <Badge variant="soft" color="info" className="text-tiny">
              Usada pela sua IA
            </Badge>
          )}
          {item.expiraEm && (
            <Badge variant="soft" color="warning" className="text-tiny">
              Expira em {new Date(item.expiraEm).toLocaleDateString("pt-BR")}
            </Badge>
          )}
        </div>
      )}
      {!atual && (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      )}
      {atual?.erro && <p className="text-error text-sm">{atual.erro}</p>}
      {atual?.nota && (
        <div className="dark:border-dark-600 dark:bg-dark-800 min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white px-4 py-2">
          <MarkdownView>{corpo || atual.nota.conteudo}</MarkdownView>
        </div>
      )}
    </DrawerShell>
  );
}
