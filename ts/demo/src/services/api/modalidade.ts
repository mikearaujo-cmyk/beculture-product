import { useCallback, useEffect, useState } from "react";

import axios from "@/utils/axios";
import type { AiModality, CatalogProvider } from "./aiCredential";

/**
 * Contexto comercial/de IA da conta logada e o Backoffice do protótipo.
 * O backend é a fonte da verdade: a interface só reflete o que ele permite.
 */

export type ModalidadeIa = "beculture" | "byok" | "organizacao";
/** "legado" = conta criada antes da seleção de planos. */
export type ModalidadeEfetiva = ModalidadeIa | "legado";
export type PlanoIa = "essencial" | "pro";
export type OrigemCredencial = "plataforma" | "usuario" | "organizacao";

export type ProntidaoIa =
  | "pronta"
  | "sem_modelos_plataforma"
  | "sem_chave"
  | "chave_invalida"
  | "chaves_desativadas"
  | "sem_modelos_habilitados";

export interface ModeloPlataformaVisivel {
  id: string;
  /** Chave de Modelos BeCulture que atende o modelo. */
  credencialId: string;
  kind: AiModality;
  provider: string;
  providerNome: string;
  model: string;
  rotulo: string;
  limiteTokensCiclo: number | null;
}

export interface ResumoContaIa {
  modalidade: ModalidadeEfetiva;
  modalidadeComercial: "b2c" | "b2b" | null;
  planoIa: PlanoIa | null;
  origemCredenciais: OrigemCredencial;
  prontidao: ProntidaoIa;
  /**
   * Quem executa as chamadas de texto agora: chave própria da conta, chave
   * operacional do protótipo (Backoffice → Configuração de API) ou ninguém.
   */
  execucao: "propria" | "prototipo" | "indisponivel";
  onboarding: { etapas: Record<string, string>; concluidoEm: string | null };
  podeGerenciarChaves: boolean;
  podeAdministrarIa: boolean;
  chavesProprias: { total: number; utilizaveis: number; congeladas: boolean };
  /** Chaves de Backoffice → Modelos BeCulture disponíveis (só B2C BeCulture). */
  chavesPlataforma?: {
    id: string;
    provider: string;
    providerNome: string;
    nome: string | null;
    modelos: number;
    kinds: AiModality[];
  }[];
  modelosPlataforma: ModeloPlataformaVisivel[];
  consumo: {
    ciclo: { inicio: string; regra: string };
    total: number;
    franquiaGlobalTokens: number | null;
    porModelo: { model: string; total: number }[];
  } | null;
}

// ---------- Conta ----------

export async function getResumoContaIa(): Promise<ResumoContaIa> {
  const { data } = await axios.get<ResumoContaIa>("/conta/modalidade");
  return data;
}

export async function definirModalidade(
  modalidadeIa: ModalidadeIa,
  planoIa?: PlanoIa,
): Promise<ResumoContaIa> {
  const { data } = await axios.put<ResumoContaIa>("/conta/modalidade", {
    modalidadeIa,
    planoIa,
  });
  return data;
}

export async function marcarEtapaOnboarding(
  etapa: string,
): Promise<ResumoContaIa> {
  const { data } = await axios.post<ResumoContaIa>("/conta/onboarding/etapa", {
    etapa,
  });
  return data;
}

export async function concluirOnboardingIa(): Promise<ResumoContaIa> {
  const { data } = await axios.post<ResumoContaIa>(
    "/conta/onboarding/concluir",
  );
  return data;
}

// ---------- Seletor de modelos das ações ----------

export type KindModelo = "text" | "image" | "video";

export interface OpcaoModelo {
  /** Id técnico do modelo, ou "auto" para o Automático (orquestrador). */
  id: string;
  rotulo: string;
  providerNome: string | null;
  descricao?: string;
}

export type ModelosConta = Record<
  KindModelo,
  { opcoes: OpcaoModelo[]; selecionado: string | null }
> & {
  /** O seletor só existe no B2C com modelos BeCulture. */
  habilitado: boolean;
};

/** Opções do seletor de cada modalidade e o último modelo usado. */
export async function getModelosConta(): Promise<ModelosConta> {
  const { data } = await axios.get<ModelosConta>("/conta/modelos");
  return data;
}

/** Grava o último modelo escolhido (vale para todas as ações). */
export async function salvarUltimoModelo(
  kind: KindModelo,
  modelo: string,
): Promise<ModelosConta> {
  const { data } = await axios.put<ModelosConta>("/conta/modelos/ultimo", {
    kind,
    modelo,
  });
  return data;
}

/**
 * Hook com o resumo da conta. `recarregar` refaz a leitura (ex.: depois de
 * cadastrar uma chave). Sem sessão/servidor, `erro` explica o motivo.
 */
export function useResumoContaIa() {
  const [resumo, setResumo] = useState<ResumoContaIa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await getResumoContaIa();
      setResumo(r);
      setErro(null);
      return r;
    } catch (err) {
      setErro(mensagemDeErro(err));
      return null;
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    getResumoContaIa()
      .then((r) => {
        if (!vivo) return;
        setResumo(r);
        setErro(null);
      })
      .catch((err) => {
        if (vivo) setErro(mensagemDeErro(err));
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  return { resumo, setResumo, carregando, erro, recarregar };
}

// ---------- Backoffice ----------

export interface PlataformaCredencial {
  id: string;
  provider: string;
  providerNome: string;
  /** Provedor fora do catálogo do sistema (cadastro livre). */
  demonstrativo: boolean;
  nome: string | null;
  keyLast4: string;
  status: "ativa" | "invalida";
  validatedAt: string | null;
  ativa: boolean;
  modelCount: number;
  aviso?: string;
}

export interface PlataformaModelo {
  id: string;
  credencialId: string;
  kind: AiModality;
  provider: string;
  providerNome: string;
  model: string;
  rotulo: string;
  ativo: boolean;
  ordem: number;
  credencialOk: boolean;
  /** Modelo fora do catálogo do sistema: sem integração de execução. */
  demonstrativo: boolean;
  /** Ativo + credencial ativa + habilitado em ao menos um plano. */
  publicado: boolean;
  planos: { plano: PlanoIa; limiteTokensCiclo: number | null }[];
}

export interface PlataformaPlano {
  plano: PlanoIa;
  franquiaGlobalTokens: number | null;
  observacao: string | null;
}

export interface StatusPlataforma {
  etapas: {
    provedor: boolean;
    credencialValida: boolean;
    modelo: boolean;
    plano: boolean;
  };
  porPlano: { plano: PlanoIa; modelosTexto: number; modelos: number }[];
  totais: {
    credenciais: number;
    credenciaisValidas: number;
    modelos: number;
    modelosAtivos: number;
  };
}

/** Chave operacional do protótipo (Backoffice → Configuração de API). */
export type ProvedorOperacional = "anthropic" | "openai" | "heygen";

export interface ChaveOperacional {
  provider: ProvedorOperacional;
  providerNome: string;
  usos: string[];
  /** De onde vem a chave em uso: Backoffice, .env do servidor ou nenhuma. */
  fonte: "backoffice" | "ambiente" | "nenhuma";
  keyLast4: string | null;
  status: "ativa" | "invalida" | null;
  validatedAt: string | null;
  modeloPadrao: string | null;
  atualizadoEm: string | null;
  aviso?: string;
}

export const apiOperacional = {
  listar: () =>
    axios
      .get<ChaveOperacional[]>("/backoffice/api-operacional")
      .then((r) => r.data),
  salvar: (
    provider: ProvedorOperacional,
    input: { apiKey?: string; modeloPadrao?: string | null },
  ) =>
    axios
      .put<ChaveOperacional>(`/backoffice/api-operacional/${provider}`, input)
      .then((r) => r.data),
  testar: (provider: ProvedorOperacional) =>
    axios
      .post<ChaveOperacional>(`/backoffice/api-operacional/${provider}/testar`)
      .then((r) => r.data),
  remover: (provider: ProvedorOperacional) =>
    axios
      .delete<ChaveOperacional>(`/backoffice/api-operacional/${provider}`)
      .then((r) => r.data),
};

export const backoffice = {
  status: () =>
    axios.get<StatusPlataforma>("/backoffice/status").then((r) => r.data),
  catalogo: () =>
    axios.get<CatalogProvider[]>("/backoffice/ia/catalogo").then((r) => r.data),
  credenciais: () =>
    axios
      .get<PlataformaCredencial[]>("/backoffice/ia/credenciais")
      .then((r) => r.data),
  criarCredencial: (input: {
    provider?: string;
    nomeProvedor?: string;
    apiKey: string;
    nome?: string;
  }) =>
    axios
      .post<PlataformaCredencial>("/backoffice/ia/credenciais", input)
      .then((r) => r.data),
  atualizarCredencial: (
    id: string,
    input: {
      nome?: string;
      nomeProvedor?: string;
      apiKey?: string;
      ativa?: boolean;
    },
  ) =>
    axios
      .patch<PlataformaCredencial>(`/backoffice/ia/credenciais/${id}`, input)
      .then((r) => r.data),
  revalidarCredencial: (id: string) =>
    axios
      .post<PlataformaCredencial>(`/backoffice/ia/credenciais/${id}/validar`)
      .then((r) => r.data),
  removerCredencial: (id: string) =>
    axios.delete(`/backoffice/ia/credenciais/${id}`),
  modelos: () =>
    axios.get<PlataformaModelo[]>("/backoffice/ia/modelos").then((r) => r.data),
  criarModelo: (input: {
    credencialId: string;
    kind: AiModality;
    model: string;
    rotulo?: string;
    planos?: PlanoIa[];
  }) =>
    axios
      .post<PlataformaModelo>("/backoffice/ia/modelos", input)
      .then((r) => r.data),
  atualizarModelo: (
    id: string,
    input: {
      ativo?: boolean;
      rotulo?: string;
      model?: string;
      kind?: AiModality;
    },
  ) =>
    axios
      .patch<PlataformaModelo>(`/backoffice/ia/modelos/${id}`, input)
      .then((r) => r.data),
  removerModelo: (id: string) => axios.delete(`/backoffice/ia/modelos/${id}`),
  definirPlano: (
    id: string,
    plano: PlanoIa,
    input: { habilitado: boolean; limiteTokensCiclo?: number | null },
  ) =>
    axios
      .put<PlataformaModelo>(
        `/backoffice/ia/modelos/${id}/planos/${plano}`,
        input,
      )
      .then((r) => r.data),
  planos: () =>
    axios.get<PlataformaPlano[]>("/backoffice/ia/planos").then((r) => r.data),
  definirFranquia: (plano: PlanoIa, franquiaGlobalTokens: number | null) =>
    axios
      .put<PlataformaPlano[]>(`/backoffice/ia/planos/${plano}`, {
        franquiaGlobalTokens,
      })
      .then((r) => r.data),
  contaDemo: () =>
    axios.get<ResumoContaIa>("/backoffice/conta-demo").then((r) => r.data),
  migrar: (input: {
    modalidadeIa: ModalidadeIa;
    planoIa?: PlanoIa;
    reiniciarOnboarding?: boolean;
  }) =>
    axios
      .put<ResumoContaIa>("/backoffice/conta-demo/modalidade", input)
      .then((r) => r.data),
};

// ---------- Rótulos compartilhados ----------

export const ROTULO_MODALIDADE: Record<ModalidadeEfetiva, string> = {
  beculture: "B2C · Modelos BeCulture",
  byok: "B2C · BYOK (chaves próprias)",
  organizacao: "B2B · Licenciamento SaaS",
  legado: "Conta legada (anterior aos planos)",
};

export const ROTULO_PLANO: Record<PlanoIa, string> = {
  essencial: "Essencial",
  pro: "Pro",
};

export const ROTULO_ORIGEM: Record<OrigemCredencial, string> = {
  plataforma: "Gerenciado pela BeCulture",
  usuario: "Conectado por você",
  organizacao: "Conectado pela organização",
};

export function mensagemDeErro(err: unknown): string {
  if (err && typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (Array.isArray(m)) return m.join(" ");
    if (typeof m === "string" && m) return m;
  }
  return "Não foi possível falar com o servidor.";
}

export function codigoDeErro(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    const c = (err as { codigo?: unknown }).codigo;
    if (typeof c === "string") return c;
  }
  return undefined;
}
