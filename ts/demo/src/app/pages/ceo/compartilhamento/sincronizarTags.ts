import { getVaultCategorias } from "@/services/api/vault";
import {
  sincronizarTagApi,
  tagsCompartilhadasApi,
} from "@/services/api/compartilhamentos";
import { construirGrafoDoVault } from "../memoria-grafo-modelo";
import type { ArquivoMd } from "../memoria-inventario";

// ----------------------------------------------------------------------
// Tags compartilhadas em modo "manter sincronizado": a tag nasce do texto do
// vault inteiro, que só o navegador do dono lê. Por isso é AQUI, depois que o
// vault é sincronizado com o servidor, que os arquivos de cada tag são
// recalculados — com o mesmo modelo do grafo — e enviados. O servidor só
// aceita notas do repositório do próprio dono e ignora tags fixas.
//
// Uma tag que deixou de existir no grafo (o termo parou de recorrer) mantém a
// última composição: sumir do grafo não é motivo para esvaziar um
// compartilhamento sem o dono pedir.
// ----------------------------------------------------------------------

export async function sincronizarTagsCompartilhadas(
  files: ArquivoMd[],
): Promise<void> {
  const tags = (await tagsCompartilhadasApi()).filter((t) => t.sincronizada);
  if (!tags.length) return;
  const categorias = await getVaultCategorias().catch(() => undefined);
  const { entidades } = construirGrafoDoVault(files, categorias);
  const conteudosPorId = new Map(
    entidades.nodes.map((n) => [n.id, n.conteudos ?? []]),
  );
  for (const t of tags) {
    const paths = conteudosPorId.get(t.chave);
    if (!paths) continue;
    await sincronizarTagApi(t.chave, paths);
  }
}
