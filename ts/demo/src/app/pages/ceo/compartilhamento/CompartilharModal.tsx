// Import Dependencies
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import clsx from "clsx";
import {
  BuildingOffice2Icon,
  CheckIcon,
  MagnifyingGlassIcon,
  ShareIcon,
  UserGroupIcon,
  UserIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

// Local Imports
import { Button, Spinner } from "@/components/ui";
import { ModalShell } from "@/components/shared/ModalShell";
import { lerNotaMemoria } from "@/utils/memoriaVault";
import { parseNotaMd, tituloPadrao } from "../memoria-inventario";
import { syncVaultBatch } from "@/services/api/vault";
import {
  compartilharApi,
  destinatariosApi,
  mensagemDeErro,
  politicaApi,
  type Destinatario,
  type Destinatarios,
  type Politica,
} from "@/services/api/compartilhamentos";

// ----------------------------------------------------------------------
// Compartilhar uma nota (ou uma tag) do Repositório pessoal.
//
// O acesso é ao ORIGINAL: o dono continua dono e pode revogar. As permissões
// são automáticas — Visualizar, Usar como contexto da IA e Administrar
// compartilhamento vão sempre juntas. O servidor ajusta o que não puder valer
// (política da organização sem IA; quem só administra não concede o que não
// tem) e aplica a expiração que a política exigir.
//
// Os atalhos da hierarquia (meu gestor, minha equipe…) só PREENCHEM a seleção.
// Nada é concedido sem passar pelo resumo e pela confirmação.
// ----------------------------------------------------------------------

/** A nota: pelo caminho (dono) ou pelo id (quem administra uma nota alheia). */
export type AlvoCompartilhamento =
  | { path: string; titulo: string }
  | { vaultNotaId: string; titulo: string }
  /** Uma tag do grafo: o agrupamento de arquivos que o navegador calculou. */
  | {
      tag: { chave: string; rotulo: string; paths: string[] };
      titulo: string;
    };

type Passo = "escolher" | "resumo";

interface Selecionado extends Destinatario {
  rotulo: string;
}

function chave(d: Destinatario): string {
  return `${d.tipo}:${d.id ?? ""}`;
}

export function CompartilharModal({
  alvo,
  close,
  onConcluido,
}: {
  alvo: AlvoCompartilhamento | null;
  close: () => void;
  onConcluido?: () => void;
}) {
  const ehTag = !!alvo && "tag" in alvo;
  const ehDono = !!alvo && ("path" in alvo || "tag" in alvo);
  // Tag: escolha EXPLÍCITA entre os arquivos de agora e manter sincronizado.
  const [tagSincronizada, setTagSincronizada] = useState<boolean | null>(null);
  const [passo, setPasso] = useState<Passo>("escolher");
  const [dados, setDados] = useState<Destinatarios | null>(null);
  const [politica, setPolitica] = useState<Politica | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [selecionados, setSelecionados] = useState<Selecionado[]>([]);
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Cada abertura começa do zero. A carga acontece no efeito; o "reset" é
  // feito ao fechar (ver `fechar`), não aqui.
  useEffect(() => {
    if (!alvo) return;
    let vivo = true;
    Promise.all([destinatariosApi(), politicaApi()])
      .then(([d, p]) => {
        if (!vivo) return;
        setDados(d);
        setPolitica(p.politica);
      })
      .catch((err) => {
        if (vivo)
          setErroCarga(
            mensagemDeErro(err, "Não foi possível carregar os destinatários."),
          );
      });
    return () => {
      vivo = false;
    };
  }, [alvo]);

  const fechar = () => {
    close();
    setPasso("escolher");
    setSelecionados([]);
    setBusca("");
    setErroCarga(null);
    setTagSincronizada(null);
  };

  const membroPorId = useMemo(
    () => new Map((dados?.membros ?? []).map((m) => [m.id, m])),
    [dados],
  );
  const areaPorId = useMemo(
    () => new Map((dados?.areas ?? []).map((a) => [a.id, a])),
    [dados],
  );

  const permitido = (tipo: Destinatario["tipo"]): boolean => {
    if (!politica) return false;
    return (
      (tipo === "membro" && politica.permitirMembro) ||
      (tipo === "equipe" && politica.permitirEquipe) ||
      (tipo === "area" && politica.permitirArea) ||
      (tipo === "empresa" && politica.permitirEmpresa)
    );
  };

  const adicionar = (...ds: Selecionado[]) => {
    setSelecionados((atuais) => {
      const vistos = new Set(atuais.map(chave));
      return [...atuais, ...ds.filter((d) => !vistos.has(chave(d)))];
    });
  };
  const remover = (d: Destinatario) =>
    setSelecionados((atuais) => atuais.filter((s) => chave(s) !== chave(d)));

  const temGrupo = selecionados.some((s) => s.tipo !== "membro");
  const s = dados?.sugestoes;

  const atalhos: { rotulo: string; icone: typeof UserIcon; itens: Selecionado[] }[] =
    [];
  if (s && dados) {
    if (s.gestorDireto && membroPorId.has(s.gestorDireto) && permitido("membro"))
      atalhos.push({
        rotulo: "Meu gestor direto",
        icone: UserIcon,
        itens: [
          {
            tipo: "membro",
            id: s.gestorDireto,
            rotulo: membroPorId.get(s.gestorDireto)!.nome,
          },
        ],
      });
    const lideranca = s.lideranca.filter((id) => membroPorId.has(id));
    if (lideranca.length > 1 && permitido("membro"))
      atalhos.push({
        rotulo: "Minha liderança",
        icone: UserGroupIcon,
        itens: lideranca.map((id) => ({
          tipo: "membro" as const,
          id,
          rotulo: membroPorId.get(id)!.nome,
        })),
      });
    if (s.minhaEquipe && permitido("equipe"))
      atalhos.push({
        rotulo: "Minha equipe",
        icone: UserGroupIcon,
        itens: [
          {
            tipo: "equipe",
            id: s.minhaEquipe,
            rotulo: `Equipe de ${membroPorId.get(s.minhaEquipe)?.nome ?? "meu gestor"}`,
          },
        ],
      });
    if (s.meusLiderados && permitido("equipe"))
      atalhos.push({
        rotulo: "Meus liderados",
        icone: UserGroupIcon,
        itens: [
          { tipo: "equipe", id: s.meusLiderados, rotulo: "Meus liderados diretos" },
        ],
      });
    if (s.minhaArea && areaPorId.has(s.minhaArea) && permitido("area"))
      atalhos.push({
        rotulo: "Minha área",
        icone: BuildingOffice2Icon,
        itens: [
          {
            tipo: "area",
            id: s.minhaArea,
            rotulo: `Área ${areaPorId.get(s.minhaArea)!.nome}`,
          },
        ],
      });
    if (permitido("empresa"))
      atalhos.push({
        rotulo: "Toda a organização",
        icone: BuildingOffice2Icon,
        itens: [{ tipo: "empresa", rotulo: "Toda a organização" }],
      });
  }

  const q = busca.trim().toLowerCase();
  const resultados = q
    ? [
        ...(permitido("membro") ? dados?.membros ?? [] : [])
          .filter((m) => m.nome.toLowerCase().includes(q))
          .map((m) => ({
            tipo: "membro" as const,
            id: m.id,
            rotulo: m.nome,
            detalhe: [m.cargo, m.area, m.convidado ? "Convidado" : null]
              .filter(Boolean)
              .join(" · "),
          })),
        ...(permitido("area") ? dados?.areas ?? [] : [])
          .filter((a) => a.nome.toLowerCase().includes(q))
          .map((a) => ({
            tipo: "area" as const,
            id: a.id,
            rotulo: `Área ${a.nome}`,
            detalhe: `${a.pessoas} ${a.pessoas === 1 ? "pessoa" : "pessoas"}`,
          })),
      ].slice(0, 8)
    : [];

  const podeAvancar =
    selecionados.length > 0 &&
    (!ehTag || tagSincronizada !== null);
  const qtdArquivosTag = alvo && "tag" in alvo ? alvo.tag.paths.length : 0;
  const maxDias = politica?.expiracaoMaximaDias ?? null;

  /** Permissões que valem: as três, menos o que a política ou o papel barrar. */
  const permissoes = [
    "Visualizar",
    politica?.permitirUsoIa !== false ? "Usar como contexto da IA" : null,
    ehDono ? "Administrar compartilhamento" : null,
  ].filter(Boolean);

  /** Garante que o servidor tem a versão atual da nota antes de concedê-la. */
  const sincronizarNota = async (path: string) => {
    const lida = await lerNotaMemoria(path);
    if (!lida.ok) return;
    const nome = path.split("/").pop() ?? path;
    await syncVaultBatch([
      {
        path,
        titulo: parseNotaMd(lida.conteudo).titulo || tituloPadrao(nome),
        conteudo: lida.conteudo,
      },
    ]);
  };

  const confirmar = async () => {
    if (!alvo) return;
    setEnviando(true);
    try {
      if ("path" in alvo) await sincronizarNota(alvo.path).catch(() => {});
      await compartilharApi({
        ...("tag" in alvo
          ? { tag: { ...alvo.tag, sincronizada: !!tagSincronizada } }
          : "path" in alvo
            ? { path: alvo.path }
            : { vaultNotaId: alvo.vaultNotaId }),
        destinatarios: selecionados.map(({ tipo, id }) => ({ tipo, id })),
        // Grupos recebem sempre só os membros de agora; quem entrar depois
        // não ganha acesso (a API também força isso).
        abrangencia: "fixa",
        // Automáticas: o servidor recorta o que não puder valer.
        podeUsarIa: true,
        podeAdministrar: true,
      });
      toast.success(ehTag ? "Tag compartilhada" : "Nota compartilhada", {
        description: `${selecionados.length} ${
          selecionados.length === 1 ? "destinatário" : "destinatários"
        } com acesso. Você pode revogar quando quiser.`,
      });
      onConcluido?.();
      fechar();
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível compartilhar."));
    } finally {
      setEnviando(false);
    }
  };

  const carregando = !!alvo && !dados && !erroCarga;

  return (
    <ModalShell
      show={!!alvo}
      close={fechar}
      icon={ShareIcon}
      title={passo === "resumo" ? "Confirme o compartilhamento" : "Compartilhar"}
      description={alvo?.titulo ?? ""}
      largura="max-w-xl"
      footer={
        passo === "escolher" ? (
          <>
            <Button variant="outlined" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              color="primary"
              disabled={!podeAvancar || carregando}
              onClick={() => setPasso("resumo")}
            >
              Revisar
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outlined"
              onClick={() => setPasso("escolher")}
              disabled={enviando}
            >
              Voltar
            </Button>
            <Button
              color="primary"
              onClick={() => void confirmar()}
              disabled={enviando}
              className="gap-2"
            >
              {enviando && <Spinner className="size-4" />}
              Compartilhar
            </Button>
          </>
        )
      }
    >
      {carregando && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
          <Spinner className="size-5" /> Carregando…
        </div>
      )}
      {erroCarga && (
        <p className="text-error rounded-lg bg-red-50 px-3 py-2 text-sm dark:bg-red-500/10">
          {erroCarga}
        </p>
      )}

      {dados && politica && passo === "escolher" && (
        <div className="flex flex-col gap-5">
          {ehTag && (
            <section>
              <Titulo>Arquivos da tag</Titulo>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <OpcaoCartao
                  ativa={tagSincronizada === false}
                  onClick={() => setTagSincronizada(false)}
                  titulo={`Só os ${qtdArquivosTag} ${qtdArquivosTag === 1 ? "arquivo" : "arquivos"} de agora`}
                  texto="Arquivos que entrarem na tag depois não são compartilhados."
                />
                <OpcaoCartao
                  ativa={tagSincronizada === true}
                  onClick={() => setTagSincronizada(true)}
                  titulo="Manter sincronizado com a tag"
                  texto="Arquivos que entrarem na tag depois também passam a ser compartilhados; os que saírem deixam de ser."
                />
              </div>
            </section>
          )}

          {/* Destinatários */}
          <section>
            <Titulo>Destinatários</Titulo>
            {atalhos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {atalhos.map((a) => (
                  <button
                    key={a.rotulo}
                    type="button"
                    onClick={() => adicionar(...a.itens)}
                    className="dark:border-dark-500 dark:text-dark-200 dark:hover:bg-dark-600 flex items-center gap-1.5 rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    <a.icone className="size-3.5" />
                    {a.rotulo}
                  </button>
                ))}
              </div>
            )}
            <div className="relative mt-3">
              <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar pessoa ou área…"
                className="form-input dark:bg-dark-700 dark:border-dark-450 dark:text-dark-100 focus:border-primary-500 h-9 w-full rounded-lg border border-gray-300 bg-white pr-3 pl-9 text-sm focus:ring-0"
              />
              {resultados.length > 0 && (
                <ul className="dark:bg-dark-700 dark:border-dark-500 absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {resultados.map((r) => (
                    <li key={`${r.tipo}:${r.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          adicionar({ tipo: r.tipo, id: r.id, rotulo: r.rotulo });
                          setBusca("");
                        }}
                        className="dark:hover:bg-dark-600 flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm hover:bg-gray-50"
                      >
                        <span className="dark:text-dark-100 truncate text-gray-800">
                          {r.rotulo}
                        </span>
                        <span className="dark:text-dark-300 text-tiny shrink-0 text-gray-400">
                          {r.detalhe}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selecionados.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selecionados.map((d) => (
                  <span
                    key={chave(d)}
                    className="bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300 flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs"
                  >
                    {d.rotulo}
                    <button
                      type="button"
                      aria-label={`Remover ${d.rotulo}`}
                      onClick={() => remover(d)}
                      className="rounded-full p-0.5 hover:bg-black/5"
                    >
                      <XMarkIcon className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Abrangência — sempre fixa; só avisa quando há grupo */}
          {temGrupo && (
            <p className="dark:text-dark-300 text-xs text-gray-500">
              Grupos: recebe só quem faz parte agora. Quem entrar no grupo
              depois não terá acesso.
            </p>
          )}
        </div>
      )}

      {dados && passo === "resumo" && alvo && (
        <dl className="dark:divide-dark-600 divide-y divide-gray-100 text-sm">
          <Resumo rotulo="Conteúdo">
            {"tag" in alvo
              ? `Tag #${alvo.tag.rotulo} · ${qtdArquivosTag} ${qtdArquivosTag === 1 ? "arquivo" : "arquivos"}`
              : alvo.titulo}
          </Resumo>
          {"tag" in alvo && (
            <Resumo rotulo="Arquivos">
              {tagSincronizada
                ? "Mantidos em sincronia com a tag (entram e saem junto com ela)"
                : "Só os arquivos de agora"}
            </Resumo>
          )}
          <Resumo rotulo="Proprietário">
            {ehDono ? "Você" : "Outro membro (você administra o compartilhamento)"}
          </Resumo>
          <Resumo rotulo="Destinatários">
            {selecionados.map((d) => d.rotulo).join(", ")}
          </Resumo>
          {temGrupo && (
            <Resumo rotulo="Grupos">
              Só os membros de agora
            </Resumo>
          )}
          <Resumo rotulo="Permissões">{permissoes.join(" · ")}</Resumo>
          {maxDias && (
            <Resumo rotulo="Expira em">
              {maxDias} dias (política da organização)
            </Resumo>
          )}
        </dl>
      )}
    </ModalShell>
  );
}

// ----------------------------------------------------------------------

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="dark:text-dark-100 text-xs-plus font-semibold text-gray-700">
      {children}
    </h4>
  );
}

function Resumo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 py-2.5">
      <dt className="dark:text-dark-300 w-28 shrink-0 text-gray-500">{rotulo}</dt>
      <dd className="dark:text-dark-100 min-w-0 flex-1 text-gray-800">
        {children}
      </dd>
    </div>
  );
}

function OpcaoCartao({
  ativa,
  onClick,
  titulo,
  texto,
}: {
  ativa: boolean;
  onClick: () => void;
  titulo: string;
  texto: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-start transition-colors",
        ativa
          ? "border-primary-500 bg-primary-50 dark:bg-primary-500/10"
          : "dark:border-dark-500 border-gray-200 hover:border-gray-300",
      )}
    >
      <span
        className={clsx(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
          ativa ? "border-primary-500 bg-primary-500 text-white" : "border-gray-300",
        )}
      >
        {ativa && <CheckIcon className="size-3" />}
      </span>
      <span>
        <span className="dark:text-dark-100 block text-xs-plus font-medium text-gray-800">
          {titulo}
        </span>
        <span className="dark:text-dark-300 text-tiny block text-gray-500">
          {texto}
        </span>
      </span>
    </button>
  );
}
