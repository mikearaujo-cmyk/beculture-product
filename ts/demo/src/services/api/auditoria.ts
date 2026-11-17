import axios from "@/utils/axios";

// Trilha de auditoria (backend: GET /auditoria, exige `auditoria.consultar`).
// Só metadados — nunca o conteúdo das notas, arquivos ou mensagens.

export interface EventoAuditoria {
  id: string;
  acao: string;
  atorUsuarioId: string | null;
  atorNome: string | null;
  recursoTipo: string | null;
  recursoId: string | null;
  recursoTitulo: string | null;
  alvoTipo: string | null;
  alvoId: string | null;
  metadados: Record<string, unknown> | null;
  criadoEm: string;
}

export interface FiltroAuditoria {
  acao?: string;
  de?: string;
  ate?: string;
  antesDe?: string;
  limite?: number;
}

export async function listarAuditoriaApi(
  f: FiltroAuditoria,
): Promise<{ eventos: EventoAuditoria[]; temMais: boolean }> {
  const { data } = await axios.get("/auditoria", { params: f });
  return data;
}
