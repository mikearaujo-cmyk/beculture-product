/**
 * Backoffice → Conta em demonstração.
 *
 * Troca o plano da conta logada para demonstrar o comportamento de cada um.
 * As regras são do backend:
 *   - B2C (unificado): Essencial ↔ Pro (simula o upgrade). Chaves próprias e a
 *     autorização de uso após a cota são preservadas.
 *   - B2C ↔ B2B: não permitido (contextos comerciais distintos).
 *   - Conta legada: pode virar B2C ou B2B.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button, Checkbox, Radio } from "@/components/ui";
import {
  backoffice,
  mensagemDeErro,
  ROTULO_MODALIDADE,
  ROTULO_PLANO,
  type PlanoIa,
  type ResumoContaIa,
} from "@/services/api/modalidade";

import { useModeloIa } from "@/app/contexts/modelo-ia/context";
import { SectionCard } from "../configuracoes-ui";
import { BadgeOrigem } from "../AiConnectionCard";

const ROTULO_PRONTIDAO: Record<ResumoContaIa["prontidao"], string> = {
  pronta: "IA pronta para uso",
  sem_modelos_plataforma: "Sem modelos BeCulture no plano",
  sem_chave: "Nenhuma chave cadastrada",
  chave_invalida: "Chave recusada pelo provedor",
  chaves_desativadas: "Todas as chaves desativadas",
  sem_modelos_habilitados: "Chave conectada, sem modelos habilitados",
};

export function ContaDemoSection() {
  const [resumo, setResumo] = useState<ResumoContaIa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** Plano B2C de destino, ou "organizacao" (só para conta legada). */
  const [destino, setDestino] = useState<PlanoIa | "organizacao">("pro");
  const [reiniciar, setReiniciar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Migrar muda as opções do seletor de modelos do topo.
  const { recarregar: recarregarModelos } = useModeloIa();

  useEffect(() => {
    backoffice
      .contaDemo()
      .then((r) => {
        setResumo(r);
        setDestino(
          r.modalidade === "organizacao"
            ? "organizacao"
            : r.planoIa === "pro"
              ? "essencial"
              : "pro",
        );
      })
      .catch((e) => setErro(mensagemDeErro(e)));
  }, []);

  if (erro) {
    return (
      <SectionCard titulo="Conta em demonstração" descricao="">
        <p className="text-error text-sm">{erro}</p>
      </SectionCard>
    );
  }
  if (!resumo) {
    return (
      <p className="dark:text-dark-300 text-sm text-gray-400">Carregando…</p>
    );
  }

  const b2b = resumo.modalidade === "organizacao";
  const opcoes: (PlanoIa | "organizacao")[] =
    resumo.modalidade === "legado"
      ? ["essencial", "pro", "organizacao"]
      : ["essencial", "pro"];
  const atual = (o: PlanoIa | "organizacao") =>
    o === "organizacao" ? b2b : !b2b && resumo.planoIa === o;

  const migrar = async () => {
    setSalvando(true);
    try {
      const r = await backoffice.migrar(
        destino === "organizacao"
          ? { modalidadeIa: "organizacao", reiniciarOnboarding: reiniciar }
          : {
              modalidadeIa: "beculture",
              planoIa: destino,
              reiniciarOnboarding: reiniciar,
            },
      );
      setResumo(r);
      recarregarModelos();
      toast.success(
        r.planoIa
          ? `Conta agora no plano ${ROTULO_PLANO[r.planoIa]}.`
          : `Conta agora em: ${ROTULO_MODALIDADE[r.modalidade]}.`,
      );
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard
        titulo="Conta em demonstração"
        descricao="Estado atual da conta logada, como o backend o enxerga."
      >
        <dl className="dark:divide-dark-500 divide-y divide-gray-100 text-sm">
          <Linha k="Modalidade" v={ROTULO_MODALIDADE[resumo.modalidade]} />
          {resumo.planoIa && (
            <Linha k="Plano B2C" v={ROTULO_PLANO[resumo.planoIa]} />
          )}
          <Linha
            k="Credenciais em uso"
            v={<BadgeOrigem origem={resumo.origemCredenciais} />}
          />
          <Linha k="Situação da IA" v={ROTULO_PRONTIDAO[resumo.prontidao]} />
          <Linha
            k="Chaves próprias"
            v={
              resumo.chavesProprias.total === 0
                ? "Nenhuma"
                : `${resumo.chavesProprias.total} (${resumo.chavesProprias.utilizaveis} utilizáveis)`
            }
          />
          {resumo.cota && (
            <Linha
              k="Cota BeCulture no ciclo"
              v={
                resumo.cota.limite === null
                  ? `${resumo.cota.total.toLocaleString("pt-BR")} tokens · sem limite definido`
                  : `${resumo.cota.total.toLocaleString("pt-BR")} de ${resumo.cota.limite.toLocaleString("pt-BR")} tokens${resumo.cota.esgotada ? " · esgotada" : ""}`
              }
            />
          )}
          {resumo.byokAposCota && (
            <Linha
              k="Chaves próprias após a cota"
              v={
                resumo.byokAposCota.autorizado && resumo.byokAposCota.ate
                  ? `Autorizado até ${new Date(resumo.byokAposCota.ate).toLocaleDateString("pt-BR")}`
                  : "Não autorizado"
              }
            />
          )}
          <Linha
            k="Onboarding"
            v={
              resumo.onboarding.concluidoEm
                ? `Concluído em ${new Date(resumo.onboarding.concluidoEm).toLocaleDateString("pt-BR")}`
                : "Pendente"
            }
          />
        </dl>
      </SectionCard>

      <SectionCard
        titulo="Trocar plano"
        descricao="Simula o upgrade (ou downgrade) do plano B2C. Nenhuma cobrança ou regra comercial é aplicada — muda só a cota e o estado da conta."
      >
        {b2b ? (
          <p className="dark:text-dark-200 text-sm text-gray-600">
            Contas B2B não migram para B2C (nem o contrário): são contextos
            comerciais diferentes. Para demonstrar B2C, crie outra conta pelo
            cadastro.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {opcoes.map((m) => (
                <label
                  key={m}
                  className="dark:border-dark-500 flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3"
                >
                  <Radio
                    name="destino"
                    className="mt-0.5"
                    checked={destino === m}
                    onChange={() => setDestino(m)}
                  />
                  <span>
                    <span className="dark:text-dark-100 block text-sm font-medium text-gray-800">
                      {m === "organizacao"
                        ? ROTULO_MODALIDADE.organizacao
                        : `B2C · ${ROTULO_PLANO[m]}`}
                      {atual(m) && " (atual)"}
                    </span>
                    <span className="dark:text-dark-300 block text-xs text-gray-500">
                      {m === "organizacao"
                        ? "Organização com chaves próprias."
                        : "Cota de modelos BeCulture do plano + chaves próprias opcionais em IA & API."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <label className="dark:text-dark-300 mt-3 flex items-center gap-2 text-sm text-gray-600">
              <Checkbox
                checked={reiniciar}
                onChange={(e) => setReiniciar(e.target.checked)}
              />
              Reiniciar o onboarding de IA (para percorrer o fluxo de novo)
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                color="primary"
                disabled={salvando}
                onClick={() => void migrar()}
              >
                {salvando ? "Aplicando…" : "Aplicar"}
              </Button>
              {reiniciar && (
                <Link
                  to="/prototypes/contas/onboarding-ia"
                  className="text-primary-600 dark:text-primary-400 text-xs hover:underline"
                >
                  Abrir onboarding de IA
                </Link>
              )}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

function Linha({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="dark:text-dark-300 text-gray-500">{k}</dt>
      <dd className="dark:text-dark-100 text-end font-medium text-gray-800">
        {v}
      </dd>
    </div>
  );
}
