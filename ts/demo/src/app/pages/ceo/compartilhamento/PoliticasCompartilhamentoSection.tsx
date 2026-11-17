// Import Dependencies
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Local Imports
import { Button, Spinner } from "@/components/ui";
import { SectionCard, ToggleRow } from "../configuracoes-ui";
import {
  mensagemDeErro,
  politicaApi,
  salvarPoliticaApi,
  type CapacidadesOrg,
  type Politica,
} from "@/services/api/compartilhamentos";

// ----------------------------------------------------------------------
// Configurações → Acesso → Compartilhamento
//
// Regras de compartilhamento da organização. Administrar estas regras NÃO dá
// acesso ao conteúdo pessoal de ninguém: Owner e Admin definem o que é
// permitido, mas só veem uma nota se o dono a compartilhar com eles.
// Desligar um tipo de destinatário suspende também os compartilhamentos já
// feitos desse tipo (o servidor confere a política a cada acesso).
// ----------------------------------------------------------------------

function numeroOuNull(v: string): number | null {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function PoliticasCompartilhamentoSection() {
  const [politica, setPolitica] = useState<Politica | null>(null);
  const [caps, setCaps] = useState<CapacidadesOrg | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    politicaApi()
      .then((r) => {
        if (!vivo) return;
        setPolitica(r.politica);
        setCaps(r.capacidades);
      })
      .catch((err) => {
        if (vivo) setErro(mensagemDeErro(err, "Não foi possível carregar."));
      });
    return () => {
      vivo = false;
    };
  }, []);

  const pode = !!caps?.politicas;
  const set = <K extends keyof Politica>(k: K, v: Politica[K]) =>
    setPolitica((p) => (p ? { ...p, [k]: v } : p));

  const salvar = async () => {
    if (!politica) return;
    setSalvando(true);
    try {
      setPolitica(await salvarPoliticaApi(politica));
      toast.success("Políticas de compartilhamento salvas");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <SectionCard
      titulo="Compartilhamento"
      descricao="O que os membros podem compartilhar entre si. Conteúdo pessoal continua privado por padrão: cargo e hierarquia nunca dão acesso a ele."
    >
      {erro && <p className="text-error text-sm">{erro}</p>}
      {!politica && !erro && (
        <div className="flex justify-center py-8">
          <Spinner className="size-5" />
        </div>
      )}
      {politica && (
        <>
          {!pode && (
            <p className="dark:bg-dark-600 dark:text-dark-200 mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Somente leitura: a sua role não permite alterar as políticas.
            </p>
          )}
          <fieldset
            disabled={!pode}
            className="dark:divide-dark-500 divide-y divide-gray-100 disabled:opacity-70"
          >
            <ToggleRow
              nome="Com pessoas específicas"
              descricao="Compartilhar uma nota com um ou mais membros escolhidos."
              checked={politica.permitirMembro}
              onChange={(v) => set("permitirMembro", v)}
            />
            <ToggleRow
              nome="Com equipes"
              descricao="Com os liderados diretos de um gestor (ex.: “Minha equipe”)."
              checked={politica.permitirEquipe}
              onChange={(v) => set("permitirEquipe", v)}
            />
            <ToggleRow
              nome="Com áreas"
              descricao="Com todos os membros de uma área."
              checked={politica.permitirArea}
              onChange={(v) => set("permitirArea", v)}
            />
            <ToggleRow
              nome="Com toda a organização"
              descricao="Com todos os membros ativos (convidados não entram)."
              checked={politica.permitirEmpresa}
              onChange={(v) => set("permitirEmpresa", v)}
            />
            <ToggleRow
              nome="Uso como contexto da IA"
              descricao="Permitir que a IA dos destinatários use notas compartilhadas. Desligado, vale só a leitura."
              checked={politica.permitirUsoIa}
              onChange={(v) => set("permitirUsoIa", v)}
            />
            <div className="flex flex-col gap-4 py-3 sm:flex-row">
              <label className="flex-1 text-sm">
                <span className="dark:text-dark-100 font-medium text-gray-800">
                  Prazo máximo de um compartilhamento (dias)
                </span>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  placeholder="Sem limite"
                  value={politica.expiracaoMaximaDias ?? ""}
                  onChange={(e) =>
                    set("expiracaoMaximaDias", numeroOuNull(e.target.value))
                  }
                  className="form-input dark:bg-dark-700 dark:border-dark-450 mt-1 h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:ring-0"
                />
              </label>
              <label className="flex-1 text-sm">
                <span className="dark:text-dark-100 font-medium text-gray-800">
                  Retenção da auditoria (dias)
                </span>
                <input
                  type="number"
                  min={180}
                  max={3650}
                  placeholder="Manter tudo"
                  value={politica.retencaoAuditoriaDias ?? ""}
                  onChange={(e) =>
                    set("retencaoAuditoriaDias", numeroOuNull(e.target.value))
                  }
                  className="form-input dark:bg-dark-700 dark:border-dark-450 mt-1 h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:ring-0"
                />
              </label>
            </div>
          </fieldset>
          {pode && (
            <div className="mt-4 flex justify-end">
              <Button
                color="primary"
                onClick={() => void salvar()}
                disabled={salvando}
                className="gap-2"
              >
                {salvando && <Spinner className="size-4" />}
                Salvar políticas
              </Button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
