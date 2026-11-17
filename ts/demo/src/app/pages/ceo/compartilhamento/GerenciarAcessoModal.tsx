// Import Dependencies
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import clsx from "clsx";
import {
  BuildingOffice2Icon,
  KeyIcon,
  PlusIcon,
  UserGroupIcon,
  UserIcon,
} from "@heroicons/react/24/outline";

// Local Imports
import { Badge, Button, Spinner } from "@/components/ui";
import { ModalShell } from "@/components/shared/ModalShell";
import {
  ConfirmModal,
  type ModalState,
} from "@/components/shared/ConfirmModal";
import {
  compartilhamentosDaNotaApi,
  historicoDaNotaApi,
  mensagemDeErro,
  revogarCompartilhamentoApi,
  type Compartilhamento,
  type EventoHistorico,
} from "@/services/api/compartilhamentos";
import type { AlvoCompartilhamento } from "./CompartilharModal";

// ----------------------------------------------------------------------
// Quem tem acesso a uma nota: lista as concessões ativas, permite mudar as
// permissões, a expiração e revogar — e mostra o histórico da nota. Para o
// dono e para quem recebeu "Administrar compartilhamento" (que vê só as
// mudanças de compartilhamento, não quem leu a nota).
// ----------------------------------------------------------------------

const ROTULO_ACAO: Record<string, string> = {
  "compartilhamento.criado": "Compartilhou",
  "compartilhamento.alterado": "Alterou permissões",
  "compartilhamento.revogado": "Revogou acesso",
  "compartilhamento.origem_removida": "Nota removida da pasta",
  "conteudo.visualizado": "Visualizou",
  "conteudo.usado_ia": "Usado como contexto da IA",
};

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const ICONE_DESTINO = {
  membro: UserIcon,
  equipe: UserGroupIcon,
  area: BuildingOffice2Icon,
  empresa: BuildingOffice2Icon,
} as const;

/** Concessões + histórico de uma nota; `null` quando a carga falha. */
async function buscar(chaveAlvo: string) {
  if (!chaveAlvo) return null;
  const p = JSON.parse(chaveAlvo) as {
    path?: string;
    vaultNotaId?: string;
    tag?: string;
  };
  try {
    const [r, historico] = await Promise.all([
      compartilhamentosDaNotaApi(p),
      historicoDaNotaApi(p),
    ]);
    return {
      compartilhamentos: r.compartilhamentos,
      ehDono: r.nota.ehDono,
      historico,
    };
  } catch (err) {
    toast.error(mensagemDeErro(err, "Não foi possível carregar o acesso."));
    return null;
  }
}

export function GerenciarAcessoModal({
  alvo,
  close,
  onAdicionar,
  onAlterado,
}: {
  alvo: AlvoCompartilhamento | null;
  close: () => void;
  /** Abre o modal Compartilhar para a mesma nota. */
  onAdicionar: () => void;
  onAlterado?: () => void;
}) {
  const [aba, setAba] = useState<"acesso" | "historico">("acesso");
  const [lista, setLista] = useState<Compartilhamento[] | null>(null);
  const [historico, setHistorico] = useState<EventoHistorico[] | null>(null);
  const [revogando, setRevogando] = useState<Compartilhamento | null>(null);
  const [estado, setEstado] = useState<ModalState>("pending");
  const [ocupado, setOcupado] = useState(false);

  const params = alvo
    ? "tag" in alvo
      ? { tag: alvo.tag.chave }
      : "path" in alvo
        ? { path: alvo.path }
        : { vaultNotaId: alvo.vaultNotaId }
    : null;
  const chaveAlvo = params ? JSON.stringify(params) : "";

  const aplicar = useCallback((r: Awaited<ReturnType<typeof buscar>>) => {
    if (!r) {
      setLista([]);
      setHistorico([]);
      return;
    }
    setLista(r.compartilhamentos);
    setHistorico(r.historico);
  }, []);

  const carregar = useCallback(async () => {
    aplicar(await buscar(chaveAlvo));
  }, [aplicar, chaveAlvo]);

  useEffect(() => {
    if (!chaveAlvo) return;
    let vivo = true;
    buscar(chaveAlvo).then((r) => {
      if (vivo) aplicar(r);
    });
    return () => {
      vivo = false;
    };
  }, [aplicar, chaveAlvo]);

  const fechar = () => {
    close();
    setAba("acesso");
    setLista(null);
    setHistorico(null);
  };

  const confirmarRevogacao = async () => {
    if (!revogando) return;
    setOcupado(true);
    try {
      await revogarCompartilhamentoApi(revogando.id);
      setEstado("success");
      setLista((l) => (l ?? []).filter((x) => x.id !== revogando.id));
      onAlterado?.();
      void carregar();
    } catch {
      setEstado("error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <ModalShell
        show={!!alvo}
        close={fechar}
        icon={KeyIcon}
        title="Quem tem acesso"
        description={alvo?.titulo ?? ""}
        largura="max-w-2xl"
        footer={
          <>
            <Button variant="outlined" onClick={fechar}>
              Fechar
            </Button>
            <Button color="primary" className="gap-1.5" onClick={onAdicionar}>
              <PlusIcon className="size-4" />
              Compartilhar com mais pessoas
            </Button>
          </>
        }
      >
        <div className="dark:border-dark-600 mb-4 flex gap-4 border-b border-gray-200 text-sm">
          {(
            [
              ["acesso", "Acesso"],
              ["historico", "Histórico"],
            ] as const
          ).map(([k, r]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAba(k)}
              className={clsx(
                "-mb-px border-b-2 pb-2 font-medium",
                aba === k
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "dark:text-dark-300 border-transparent text-gray-500",
              )}
            >
              {r}
            </button>
          ))}
        </div>

        {aba === "acesso" && lista?.[0]?.tag && (
          <p className="dark:bg-dark-600 dark:text-dark-200 mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Tag com {lista[0].tag.notas}{" "}
            {lista[0].tag.notas === 1 ? "arquivo" : "arquivos"} ·{" "}
            {lista[0].tag.sincronizada
              ? "mantida em sincronia: arquivos que entrarem ou saírem da tag entram ou saem do compartilhamento quando você abrir o Repositório."
              : "só os arquivos do momento do compartilhamento."}
          </p>
        )}
        {aba === "acesso" &&
          (lista === null ? (
            <div className="flex justify-center py-8">
              <Spinner className="size-5" />
            </div>
          ) : lista.length === 0 ? (
            <p className="dark:text-dark-300 py-6 text-center text-sm text-gray-500">
              Esta nota é privada: só você tem acesso.
            </p>
          ) : (
            <ul className="dark:divide-dark-600 divide-y divide-gray-100">
              {lista.map((c) => {
                const Icone = ICONE_DESTINO[c.destinatario.tipo];
                return (
                  <li key={c.id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-center gap-3">
                      <Icone className="dark:text-dark-300 size-5 shrink-0 text-gray-500" />
                      <div className="min-w-0 flex-1">
                        <p className="dark:text-dark-100 truncate text-sm font-medium text-gray-800">
                          {c.destinatario.nome}
                        </p>
                        <p className="dark:text-dark-300 text-tiny text-gray-500">
                          {c.destinatario.tipo === "membro"
                            ? "Pessoa"
                            : `${c.pessoas} ${c.pessoas === 1 ? "pessoa" : "pessoas"} · ${
                                c.abrangencia === "dinamica"
                                  ? "atuais e futuros"
                                  : "só os de quando foi compartilhado"
                              }`}{" "}
                          · por {c.concedidoPor} em {dataCurta(c.criadoEm)}
                        </p>
                      </div>
                      <Button
                        variant="flat"
                        color="error"
                        className="h-7 shrink-0 px-2 text-xs"
                        onClick={() => {
                          setEstado("pending");
                          setRevogando(c);
                        }}
                      >
                        Revogar
                      </Button>
                    </div>
                    {/* Permissões automáticas: só exibidas, sem controle. */}
                    <div className="flex flex-wrap items-center gap-1.5 pl-8">
                      <Badge variant="soft" color="neutral" className="text-tiny">
                        Visualizar
                      </Badge>
                      {c.podeUsarIa && (
                        <Badge variant="soft" color="info" className="text-tiny">
                          Usar na IA
                        </Badge>
                      )}
                      {c.podeAdministrar && (
                        <Badge variant="soft" color="warning" className="text-tiny">
                          Administrar
                        </Badge>
                      )}
                      {c.expiraEm && (
                        <span className="dark:text-dark-300 text-tiny text-gray-500">
                          · expira em {dataCurta(c.expiraEm)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}

        {aba === "historico" &&
          (historico === null ? (
            <div className="flex justify-center py-8">
              <Spinner className="size-5" />
            </div>
          ) : historico.length === 0 ? (
            <p className="dark:text-dark-300 py-6 text-center text-sm text-gray-500">
              Nenhum registro ainda.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-auto text-sm">
              {historico.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3">
                  <span className="dark:text-dark-300 text-tiny w-24 shrink-0 text-gray-400">
                    {new Date(e.criadoEm).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="dark:text-dark-100 text-gray-700">
                    <b className="font-medium">{e.atorNome ?? "Sistema"}</b> ·{" "}
                    {ROTULO_ACAO[e.acao] ?? e.acao}
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </ModalShell>

      <ConfirmModal
        show={revogando !== null}
        onClose={() => setRevogando(null)}
        onOk={() =>
          estado === "success" ? setRevogando(null) : void confirmarRevogacao()
        }
        confirmLoading={ocupado}
        state={estado}
        messages={{
          pending: {
            title: "Revogar este acesso?",
            description: `${revogando?.destinatario.nome ?? ""} deixa de ver a nota e a IA deixa de usá-la a partir da próxima pergunta. Respostas já geradas não são apagadas.`,
            actionText: "Revogar",
          },
          success: {
            title: "Acesso revogado",
            description: "O registro fica preservado no histórico.",
            actionText: "Fechar",
          },
          error: {
            title: "Não foi possível revogar",
            description: "Tente de novo em instantes.",
            actionText: "Tentar de novo",
          },
        }}
      />
    </>
  );
}
