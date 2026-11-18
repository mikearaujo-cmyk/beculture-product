/**
 * Organização dona do Repositório da organização — a que vai no header
 * `X-Organizacao-Id` (ver utils/axios.ts e, no backend, OrganizacaoAtual).
 *
 * Mesmo desenho de `definirRepositorioPastaAtivo` (memoria-inventario.ts):
 * um valor de módulo, mantido em sincronia pelo PrototipoContasProvider, para
 * o interceptor do axios ler sem depender de React.
 *
 * É SEPARADO do repositório ativo de propósito: o repositório ativo aponta para
 * a pasta local do protótipo; a organização é dona da base de conhecimento
 * compartilhada. Trocar de pasta não pode trocar os documentos da organização.
 */
let organizacaoAtual: string | null = null;

export function definirOrganizacaoAtiva(organizacaoId: string | null): void {
  organizacaoAtual = organizacaoId;
}

export function organizacaoAtivaId(): string | null {
  return organizacaoAtual;
}

/**
 * Escopo de IA da organização ativa — vai no header `X-Escopo-Ia` (ver
 * utils/axios.ts e, no backend, common/escopo-ia.context.ts).
 *   pessoal     = organização pessoal (sem organização ou pagador PF): B2C —
 *                 seletor de modelos, cota BeCulture, BYOK após a cota.
 *   organizacao = organização empresarial (pagador PJ): telas antigas de IA.
 * Mantido em sincronia pelo PrototipoContasProvider; quem mostra dados de IA
 * se inscreve em `aoMudarEscopoIa` para recarregar ao trocar de organização.
 */
export type EscopoIa = "pessoal" | "organizacao";

let escopoIa: EscopoIa | null = null;
const ouvintesEscopoIa = new Set<(escopo: EscopoIa | null) => void>();

export function definirEscopoIa(escopo: EscopoIa | null): void {
  if (escopo === escopoIa) return;
  escopoIa = escopo;
  for (const ouvir of ouvintesEscopoIa) ouvir(escopo);
}

export function escopoIaAtivo(): EscopoIa | null {
  return escopoIa;
}

/** Inscreve-se nas trocas de escopo. Devolve a função que cancela. */
export function aoMudarEscopoIa(
  ouvir: (escopo: EscopoIa | null) => void,
): () => void {
  ouvintesEscopoIa.add(ouvir);
  return () => {
    ouvintesEscopoIa.delete(ouvir);
  };
}

/**
 * Id do dono do Repositório para o escopo ativo: a organização do repositório
 * aberto, ou — no escopo pessoal, que não tem organização — uma chave própria
 * do usuário, para os documentos dele não caírem num balde comum.
 */
export function donoDoRepositorio(
  organizacaoId: string | null,
  usuarioId: string | null,
): string | null {
  if (organizacaoId) return organizacaoId;
  return usuarioId ? `pessoal:${usuarioId}` : null;
}
