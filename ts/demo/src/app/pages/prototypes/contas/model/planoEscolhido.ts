/**
 * Plano escolhido na etapa "Seleção de planos" do cadastro.
 *
 * Fica no navegador só até a conta existir no backend: o `/registrar` recebe a
 * escolha e passa a ser a fonte da verdade (Empresa.modalidadeIa/planoIa).
 * Não entra no estado versionado do protótipo (`proto:contas:v8`) para não
 * exigir migração daquele formato.
 */

import type { ModalidadeIa, PlanoIa } from "@/services/api/modalidade";

export interface PlanoEscolhido {
  modalidadeIa: ModalidadeIa;
  planoIa?: PlanoIa;
}

const CHAVE = "proto:contas:plano";

export function lerPlanoEscolhido(): PlanoEscolhido | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const v = JSON.parse(bruto) as PlanoEscolhido;
    if (!["beculture", "byok", "organizacao"].includes(v.modalidadeIa)) {
      return null;
    }
    // B2C unificado: escolhas antigas de "byok" viram B2C.
    return v.modalidadeIa === "byok"
      ? { modalidadeIa: "beculture", planoIa: v.planoIa ?? "essencial" }
      : v;
  } catch {
    return null;
  }
}

export function salvarPlanoEscolhido(p: PlanoEscolhido): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    /* sem storage: a escolha segue só na navegação atual */
  }
}

export function limparPlanoEscolhido(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* noop */
  }
}

/** Conteúdo comercial das modalidades (fonte única para cadastro e Backoffice). */
export const MODALIDADES: {
  id: ModalidadeIa;
  contexto: "B2C" | "B2B";
  titulo: string;
  resumo: string;
  regras: { rotulo: string; valor: string }[];
  destaques: string[];
}[] = [
  {
    id: "beculture",
    contexto: "B2C",
    titulo: "BeCulture B2C",
    resumo: "IA pronta com cota do plano — e suas chaves, se quiser.",
    regras: [
      { rotulo: "Quem fornece a IA", valor: "BeCulture (cota do plano)" },
      { rotulo: "Chaves próprias", valor: "Opcionais, em IA & API" },
      { rotulo: "Cota", valor: "Tokens por ciclo, conforme o plano" },
    ],
    destaques: [
      "Escolha o modelo BeCulture ou o Automático no topo",
      "Cadastre suas chaves para continuar quando a cota acabar",
      "Uso nas suas chaves só com a sua autorização",
    ],
  },
  {
    id: "organizacao",
    contexto: "B2B",
    titulo: "Licenciamento SaaS",
    resumo: "Para organizações, cobrado por membros e módulos.",
    regras: [
      { rotulo: "Quem fornece a IA", valor: "A organização (chaves próprias)" },
      { rotulo: "Custo dos tokens", valor: "Pago pela organização ao provedor" },
      { rotulo: "Cobrança BeCulture", valor: "Por membros e módulos, sem tokens" },
    ],
    destaques: [
      "Chaves da organização, isoladas de outras orgs",
      "Membros usam os modelos liberados pela organização",
      "Sem modelos ou franquia fornecidos pela BeCulture",
    ],
  },
];

export const PLANOS_B2C: {
  id: PlanoIa;
  titulo: string;
  descricao: string;
}[] = [
  {
    id: "essencial",
    titulo: "Essencial",
    descricao: "Todos os modelos BeCulture, com a cota de entrada.",
  },
  {
    id: "pro",
    titulo: "Pro",
    descricao: "Todos os modelos BeCulture, com uma cota maior.",
  },
];
