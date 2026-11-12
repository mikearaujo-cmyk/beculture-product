/**
 * Backoffice → Conta em demonstração.
 *
 * Migra a conta logada entre modalidades para demonstrar o comportamento de
 * cada uma. As regras são do backend:
 *   - B2C BeCulture ↔ BYOK: permitido. Chaves próprias são preservadas; em
 *     BeCulture ficam guardadas e sem uso; ao voltar para BYOK voltam a valer.
 *     Não há fallback silencioso entre chaves próprias e da BeCulture.
 *   - B2C ↔ B2B: não permitido (contextos comerciais distintos).
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
  type ModalidadeIa,
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
  const [destino, setDestino] = useState<ModalidadeIa>("beculture");
  const [plano, setPlano] = useState<PlanoIa>("essencial");
  const [reiniciar, setReiniciar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Migrar muda as opções do seletor de modelos do topo.
  const { recarregar: recarregarModelos } = useModeloIa();

  useEffect(() => {
    backoffice
      .contaDemo()
      .then((r) => {
        setResumo(r);
        if (r.planoIa) setPlano(r.planoIa);
        setDestino(
          r.modalidade === "beculture"
            ? "byok"
            : r.modalidade === "byok"
              ? "beculture"
              : "organizacao",
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
  const opcoes: ModalidadeIa[] =
    resumo.modalidade === "legado"
      ? ["beculture", "byok", "organizacao"]
      : b2b
        ? ["organizacao"]
        : ["beculture", "byok"];

  const migrar = async () => {
    setSalvando(true);
    try {
      const r = await backoffice.migrar({
        modalidadeIa: destino,
        planoIa: destino === "beculture" ? plano : undefined,
        reiniciarOnboarding: reiniciar,
      });
      setResumo(r);
      recarregarModelos();
      toast.success(`Conta agora em: ${ROTULO_MODALIDADE[r.modalidade]}.`);
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
                : `${resumo.chavesProprias.total} (${resumo.chavesProprias.utilizaveis} utilizáveis)${resumo.chavesProprias.congeladas ? " · guardadas, sem uso no plano BeCulture" : ""}`
            }
          />
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
        titulo="Migrar modalidade"
        descricao="Representa a troca de plano. Nenhuma cobrança ou regra comercial de migração é aplicada — só o estado e o comportamento da conta."
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
                      {ROTULO_MODALIDADE[m]}
                      {m === resumo.modalidade && " (atual)"}
                    </span>
                    <span className="dark:text-dark-300 block text-xs text-gray-500">
                      {m === "beculture"
                        ? "Chaves próprias ficam guardadas e sem uso. A IA passa a usar só os modelos BeCulture do plano."
                        : m === "byok"
                          ? "A IA passa a usar só as chaves do usuário. Chaves guardadas voltam a valer."
                          : "Organização com chaves próprias."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {destino === "beculture" && (
              <label className="dark:text-dark-300 mt-3 flex items-center gap-2 text-sm text-gray-600">
                Plano:
                <select
                  className="form-select dark:border-dark-450 dark:bg-dark-700 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
                  value={plano}
                  onChange={(e) => setPlano(e.target.value as PlanoIa)}
                >
                  <option value="essencial">Essencial</option>
                  <option value="pro">Pro</option>
                </select>
              </label>
            )}
            <label className="dark:text-dark-300 mt-3 flex items-center gap-2 text-sm text-gray-600">
              <Checkbox
                checked={reiniciar}
                onChange={(e) => setReiniciar(e.target.checked)}
              />
              Reiniciar o onboarding de IA (para percorrer o fluxo da nova
              modalidade)
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
