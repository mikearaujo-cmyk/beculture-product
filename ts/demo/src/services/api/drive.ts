import axios from "@/utils/axios";

// Google Drive real do conector (ts/api, DriveApiService). Mesmo desenho do
// cliente do Slack: a listagem é paginada e o conteúdo de cada arquivo só é
// lido quando o usuário o abre (ou o salva no Repositório).

const BASE = "/conectores/arquivos/google-drive";

export interface DriveArquivo {
  id: string;
  nome: string;
  mimeType: string;
  pasta: boolean;
  /** Bytes; ausente nos nativos do Google (Docs/Sheets/Slides) e em pastas. */
  tamanho?: number;
  modificadoEm?: string;
  dono?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  nativoGoogle: boolean;
  /** Extensão com que o arquivo é salvo (ex.: ".pdf"; Docs viram ".docx"). */
  extensao: string;
}

export type DriveVisao = "meu-drive" | "compartilhados" | "recentes";

export interface DrivePagina {
  /** Conta Google autorizada (só vem na primeira página). */
  conta: string | null;
  arquivos: DriveArquivo[];
  proximaPagina?: string;
}

export interface DriveConteudo {
  arquivo: DriveArquivo;
  /** Texto para prévia e para a nota; null quando o tipo não tem extração. */
  texto: string | null;
  suportado: boolean;
  truncado: boolean;
  motivo?: string;
}

/** Uma página de arquivos: de uma pasta, de uma visão ou de uma busca. */
export async function fetchArquivosDriveApi(opts: {
  pasta?: string;
  busca?: string;
  visao?: DriveVisao;
  pageToken?: string;
  limite?: number;
}): Promise<DrivePagina> {
  const { data } = await axios.get<DrivePagina>(`${BASE}/arquivos`, {
    params: opts,
  });
  return {
    conta: data.conta ?? null,
    arquivos: data.arquivos ?? [],
    proximaPagina: data.proximaPagina,
  };
}

/** Caminho de uma pasta até a raiz, do mais alto ao próprio item. */
export async function fetchCaminhoDriveApi(
  id: string,
): Promise<{ id: string; nome: string }[]> {
  const { data } = await axios.get<{ caminho: { id: string; nome: string }[] }>(
    `${BASE}/arquivos/${encodeURIComponent(id)}/caminho`,
  );
  return data.caminho ?? [];
}

/** Metadados + texto extraído do arquivo. */
export async function fetchConteudoDriveApi(id: string): Promise<DriveConteudo> {
  const { data } = await axios.get<DriveConteudo>(
    `${BASE}/arquivos/${encodeURIComponent(id)}/conteudo`,
  );
  return data;
}

/** Bytes do arquivo (nativos do Google já exportados) para guardar no Repositório. */
export async function fetchOriginalDriveApi(id: string): Promise<Blob> {
  const { data } = await axios.get<Blob>(
    `${BASE}/arquivos/${encodeURIComponent(id)}/original`,
    { responseType: "blob" },
  );
  return data;
}
