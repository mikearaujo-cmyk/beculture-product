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
    return v;
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
    titulo: "Modelos BeCulture",
    resumo: "Use a IA pronta, sem configurar chaves.",
    regras: [
      { rotulo: "Quem fornece a IA", valor: "BeCulture" },
      { rotulo: "Custo dos tokens", valor: "Incluído no plano" },
      { rotulo: "Franquia", valor: "Sim, com limites do plano" },
    ],
    destaques: [
      "Modelos escolhidos e mantidos pela BeCulture",
      "Sem cadastro de chaves de API",
      "Disponibilidade de modelos conforme o plano",
    ],
  },
  {
    id: "byok",
    contexto: "B2C",
    titulo: "BYOK — Traga sua chave",
    resumo: "Conecte suas próprias chaves de IA.",
    regras: [
      { rotulo: "Quem fornece a IA", valor: "Você (suas chaves)" },
      { rotulo: "Custo dos tokens", valor: "Pago direto ao provedor" },
      { rotulo: "Franquia", valor: "Não há franquia BeCulture" },
    ],
    destaques: [
      "Várias chaves e provedores compatíveis",
      "Você ativa, desativa e remove credenciais",
      "Escolha os modelos e a ordem de uso",
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
    descricao: "Modelos para o dia a dia, com franquia de entrada.",
  },
  {
    id: "pro",
    titulo: "Pro",
    descricao: "Mais modelos e limites maiores.",
  },
];
