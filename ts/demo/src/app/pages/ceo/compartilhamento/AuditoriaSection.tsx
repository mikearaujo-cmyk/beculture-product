// Import Dependencies
import { useCallback, useEffect, useState } from "react";

// Local Imports
import { Button, Spinner } from "@/components/ui";
import { SectionCard } from "../configuracoes-ui";
import {
  listarAuditoriaApi,
  type EventoAuditoria,
} from "@/services/api/auditoria";
import { mensagemDeErro } from "@/services/api/compartilhamentos";

// ----------------------------------------------------------------------
// Configurações → Acesso → Auditoria
//
// Registros de operações sensíveis: compartilhamentos, revogações, acessos a
// conteúdo de terceiros, uso pela IA, publicações e mudanças de membros. Só
// METADADOS — quem, o quê, quando. Ler a auditoria não abre o conteúdo de
// ninguém (títulos de notas pessoais nem chegam a ser gravados).
// ----------------------------------------------------------------------

const ROTULOS_ACAO: Record<string, string> = {
  "compartilhamento.criado": "Compartilhamento criado",
  "compartilhamento.alterado": "Permissões alteradas",
  "compartilhamento.revogado": "Acesso revogado",
  "compartilhamento.origem_removida": "Nota original removida",
  "conteudo.visualizado": "Conteúdo visualizado",
  "conteudo.usado_ia": "Conteúdo usado pela IA",
  "repositorio_org.publicado": "Cópia publicada na organização",
  "repositorio_org.enviado": "Documento enviado à organização",
  "repositorio_org.editado": "Documento da organização editado",
  "repositorio_org.excluido": "Documento da organização excluído",
  "politica.alterada": "Política alterada",
  "membro.desativado": "Membro desativado",
  "membro.reativado": "Membro reativado",
  "membro.removido": "Convite removido",
  "membro.gestor_alterado": "Gestor alterado",
  "membro.area_alterada": "Área alterada",
  "repositorio.reivindicado": "Repositório pessoal vinculado ao dono",
};

const RECURSO: Record<string, string> = {
  nota_vault: "Nota pessoal",
  documento_org: "Documento da organização",
  membro: "Membro",
  politica_compartilhamento: "Política",
  repositorio: "Repositório pessoal",
};

export function AuditoriaSection() {
  const [acao, setAcao] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [eventos, setEventos] = useState<EventoAuditoria[] | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mais, setMais] = useState(false);

  const filtro = useCallback(
    () => ({
      acao: acao || undefined,
      de: de ? new Date(`${de}T00:00:00`).toISOString() : undefined,
      ate: ate ? new Date(`${ate}T23:59:59`).toISOString() : undefined,
      limite: 50,
    }),
    [acao, de, ate],
  );

  useEffect(() => {
    let vivo = true;
    listarAuditoriaApi(filtro())
      .then((r) => {
        if (!vivo) return;
        setErro(null);
        setEventos(r.eventos);
        setTemMais(r.temMais);
      })
      .catch((err) => {
        if (!vivo) return;
        setEventos([]);
        setErro(
          mensagemDeErro(err, "Não foi possível carregar a auditoria."),
        );
      });
    return () => {
      vivo = false;
    };
  }, [filtro]);

  const carregarMais = async () => {
    const ultimo = eventos?.[eventos.length - 1];
    if (!ultimo) return;
    setMais(true);
    try {
      const r = await listarAuditoriaApi({ ...filtro(), antesDe: ultimo.criadoEm });
      setEventos((e) => [...(e ?? []), ...r.eventos]);
      setTemMais(r.temMais);
    } finally {
      setMais(false);
    }
  };

  return (
    <SectionCard
      titulo="Auditoria"
      descricao="Quem compartilhou, acessou, revogou ou alterou o quê. Só metadados: nenhum conteúdo de nota, arquivo ou mensagem aparece aqui."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs">
          <span className="dark:text-dark-300 text-gray-500">Operação</span>
          <select
            value={acao}
            onChange={(e) => setAcao(e.target.value)}
            className="form-select dark:bg-dark-700 dark:border-dark-450 mt-1 h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:ring-0"
          >
            <option value="">Todas</option>
            {Object.entries(ROTULOS_ACAO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="dark:text-dark-300 text-gray-500">De</span>
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            className="form-input dark:bg-dark-700 dark:border-dark-450 mt-1 h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:ring-0"
          />
        </label>
        <label className="text-xs">
          <span className="dark:text-dark-300 text-gray-500">Até</span>
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="form-input dark:bg-dark-700 dark:border-dark-450 mt-1 h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:ring-0"
          />
        </label>
      </div>

      {erro && <p className="text-error mt-4 text-sm">{erro}</p>}
      {eventos === null && (
        <div className="flex justify-center py-8">
          <Spinner className="size-5" />
        </div>
      )}
      {eventos && eventos.length === 0 && !erro && (
        <p className="dark:text-dark-300 py-8 text-center text-sm text-gray-500">
          Nenhum registro no período.
        </p>
      )}
      {eventos && eventos.length > 0 && (
        <div className="dark:border-dark-600 mt-4 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="dark:bg-dark-800 dark:text-dark-300 bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Quando</th>
                <th className="px-3 py-2 font-medium">Quem</th>
                <th className="px-3 py-2 font-medium">Operação</th>
                <th className="px-3 py-2 font-medium">Recurso</th>
              </tr>
            </thead>
            <tbody className="dark:divide-dark-600 divide-y divide-gray-100">
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td className="dark:text-dark-300 px-3 py-2 whitespace-nowrap text-gray-500">
                    {new Date(e.criadoEm).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="dark:text-dark-100 px-3 py-2 text-gray-800">
                    {e.atorNome ?? "Sistema"}
                  </td>
                  <td className="dark:text-dark-100 px-3 py-2 text-gray-800">
                    {ROTULOS_ACAO[e.acao] ?? e.acao}
                  </td>
                  <td className="dark:text-dark-300 px-3 py-2 text-gray-500">
                    {RECURSO[e.recursoTipo ?? ""] ?? e.recursoTipo ?? "—"}
                    {e.recursoTitulo ? ` · ${e.recursoTitulo}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {temMais && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="outlined"
            onClick={() => void carregarMais()}
            disabled={mais}
            className="gap-2"
          >
            {mais && <Spinner className="size-4" />}
            Carregar mais
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
