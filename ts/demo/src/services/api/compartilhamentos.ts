import axios from "@/utils/axios";

// Cliente do compartilhamento explícito de notas pessoais
// (backend: /compartilhamentos). O repositório ativo vai no header
// X-Repositorio-Id pelo interceptor de utils/axios.ts e o servidor confere que
// ele é do usuário. Nada aqui dá acesso automático: o servidor só entrega
// conteúdo alheio quando há uma concessão válida AGORA.

export type TipoDestinatario = "membro" | "equipe" | "area" | "empresa";
export type Abrangencia = "fixa" | "dinamica";

export interface Destinatario {
  tipo: TipoDestinatario;
  id?: string;
}

export interface Compartilhamento {
  id: string;
  vaultNotaId: string | null;
  titulo: string;
  path: string | null;
  destinatario: { tipo: TipoDestinatario; id: string | null; nome: string };
  abrangencia: Abrangencia;
  pessoas: number;
  podeVisualizar: boolean;
  podeUsarIa: boolean;
  podeAdministrar: boolean;
  expiraEm: string | null;
  status: "ativo" | "revogado" | "origem_removida";
  concedidoPor: string;
  donoNome: string;
  criadoEm: string;
  /** Preenchido quando a concessão é de uma tag (agrupamento de arquivos). */
  tag: {
    chave: string;
    rotulo: string;
    sincronizada: boolean;
    notas: number;
  } | null;
}

/** Tag compartilhada do repositório ativo. */
export interface TagCompartilhada {
  chave: string;
  rotulo: string;
  sincronizada: boolean;
  notas: number;
  compartilhamentos: number;
}

export interface Recebido {
  vaultNotaId: string;
  titulo: string;
  donoUsuarioId: string;
  donoNome: string;
  visualizar: boolean;
  usarIa: boolean;
  administrar: boolean;
  expiraEm: string | null;
  atualizadoEm: string;
  /** Tags pelas quais a nota chegou (vazio = compartilhada individualmente). */
  viaTags: string[];
}

export interface ConteudoRecebido
  extends Omit<Recebido, "donoUsuarioId" | "viaTags"> {
  conteudo: string;
}

export interface MembroDestino {
  id: string;
  nome: string;
  cargo: string | null;
  area: string | null;
  convidado: boolean;
}

export interface Destinatarios {
  eu: { membroId: string; areaId: string | null; gestorId: string | null } | null;
  membros: MembroDestino[];
  areas: { id: string; nome: string; pessoas: number }[];
  sugestoes: {
    gestorDireto: string | null;
    lideranca: string[];
    minhaEquipe: string | null;
    meusLiderados: string | null;
    minhaArea: string | null;
  };
}

export interface Politica {
  permitirMembro: boolean;
  permitirEquipe: boolean;
  permitirArea: boolean;
  permitirEmpresa: boolean;
  permitirUsoIa: boolean;
  permitirPublicacaoOrg: boolean;
  expiracaoMaximaDias: number | null;
  retencaoAuditoriaDias: number | null;
}

export interface CapacidadesOrg {
  visualizar: boolean;
  usarIa: boolean;
  enviar: boolean;
  editar: boolean;
  excluir: boolean;
  politicas: boolean;
  auditoria: boolean;
}

export interface EventoHistorico {
  id: string;
  acao: string;
  atorNome: string | null;
  alvoTipo: string | null;
  alvoId: string | null;
  criadoEm: string;
}

export interface NovoCompartilhamento {
  path?: string;
  vaultNotaId?: string;
  /** Compartilhar uma tag inteira em vez de uma nota. */
  tag?: { chave: string; rotulo: string; paths: string[]; sincronizada: boolean };
  destinatarios: Destinatario[];
  abrangencia: Abrangencia;
  podeUsarIa: boolean;
  podeAdministrar: boolean;
  expiraEm?: string;
}

type Alvo = { path?: string; vaultNotaId?: string; tag?: string };

/** Tags compartilhadas do repositório ativo. */
export async function tagsCompartilhadasApi(): Promise<TagCompartilhada[]> {
  const { data } = await axios.get<{ tags: TagCompartilhada[] }>(
    "/compartilhamentos/tags",
  );
  return data.tags ?? [];
}

/** Atualiza os arquivos de uma tag sincronizada (o servidor ignora as fixas). */
export async function sincronizarTagApi(
  chave: string,
  paths: string[],
): Promise<void> {
  await axios.put("/compartilhamentos/tags/notas", { chave, paths });
}

export async function compartilharApi(
  dados: NovoCompartilhamento,
): Promise<Compartilhamento[]> {
  const { data } = await axios.post<{ compartilhamentos: Compartilhamento[] }>(
    "/compartilhamentos",
    dados,
  );
  return data.compartilhamentos ?? [];
}

export async function concedidosApi(): Promise<Compartilhamento[]> {
  const { data } = await axios.get<{ compartilhamentos: Compartilhamento[] }>(
    "/compartilhamentos/concedidos",
  );
  return data.compartilhamentos ?? [];
}

export async function compartilhamentosDaNotaApi(alvo: Alvo): Promise<{
  nota: { id: string; titulo: string; ehDono: boolean };
  compartilhamentos: Compartilhamento[];
}> {
  const { data } = await axios.get("/compartilhamentos/nota", { params: alvo });
  return data;
}

export async function historicoDaNotaApi(
  alvo: Alvo,
): Promise<EventoHistorico[]> {
  const { data } = await axios.get<{ eventos: EventoHistorico[] }>(
    "/compartilhamentos/nota/historico",
    { params: alvo },
  );
  return data.eventos ?? [];
}

export async function recebidosApi(): Promise<Recebido[]> {
  const { data } = await axios.get<{ recebidos: Recebido[] }>(
    "/compartilhamentos/recebidos",
  );
  return data.recebidos ?? [];
}

export async function conteudoRecebidoApi(
  vaultNotaId: string,
): Promise<ConteudoRecebido> {
  const { data } = await axios.get<ConteudoRecebido>(
    `/compartilhamentos/recebidos/${encodeURIComponent(vaultNotaId)}`,
  );
  return data;
}

export async function destinatariosApi(): Promise<Destinatarios> {
  const { data } = await axios.get<Destinatarios>(
    "/compartilhamentos/destinatarios",
  );
  return data;
}

export async function politicaApi(): Promise<{
  politica: Politica;
  capacidades: CapacidadesOrg;
}> {
  const { data } = await axios.get("/compartilhamentos/politica");
  return data;
}

export async function salvarPoliticaApi(p: Politica): Promise<Politica> {
  const { data } = await axios.put<{ politica: Politica }>(
    "/compartilhamentos/politica",
    {
      ...p,
      expiracaoMaximaDias: p.expiracaoMaximaDias ?? undefined,
      retencaoAuditoriaDias: p.retencaoAuditoriaDias ?? undefined,
    },
  );
  return data.politica;
}

export async function alterarCompartilhamentoApi(
  id: string,
  dados: {
    podeUsarIa?: boolean;
    podeAdministrar?: boolean;
    expiraEm?: string;
    semExpiracao?: boolean;
  },
): Promise<Compartilhamento> {
  const { data } = await axios.patch<{ compartilhamento: Compartilhamento }>(
    `/compartilhamentos/${encodeURIComponent(id)}`,
    dados,
  );
  return data.compartilhamento;
}

export async function revogarCompartilhamentoApi(id: string): Promise<void> {
  await axios.delete(`/compartilhamentos/${encodeURIComponent(id)}`);
}

/**
 * Mensagem de erro do servidor, quando houver. O interceptor de utils/axios.ts
 * rejeita com o CORPO da resposta ({ message, statusCode }).
 */
export function mensagemDeErro(err: unknown, padrao: string): string {
  const m = (err as { message?: unknown } | null)?.message;
  if (typeof m === "string" && m.trim()) return m;
  if (Array.isArray(m) && typeof m[0] === "string") return m[0];
  return padrao;
}
