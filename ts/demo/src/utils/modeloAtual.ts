/**
 * Modelo de IA selecionado no momento (por modalidade), publicado pelo
 * `ModeloIaProvider` para quem está fora da árvore React — o interceptor do
 * axios e o streaming do chat. Mesmo padrão de `repositorioPastaAtivo()`.
 *
 * As ações de IA mostram o `SeletorModelo`; o pedido sai com o modelo que está
 * selecionado ali, sem cada cliente de API precisar repassar o campo.
 */

export type KindModeloAtual = "text" | "image" | "video";

const atual: Partial<Record<KindModeloAtual, string>> = {};

export function publicarModeloAtual(
  kind: KindModeloAtual,
  modelo: string | null | undefined,
): void {
  if (modelo) atual[kind] = modelo;
  else delete atual[kind];
}

export function modeloAtual(kind: KindModeloAtual): string | undefined {
  return atual[kind];
}

/**
 * Endpoints de AÇÕES de IA que recebem o modelo escolhido. Lista explícita:
 * rotas internas (classificação do vault, identidade visual, catálogos,
 * chaves) nunca recebem — continuam na ordem padrão.
 */
const ROTAS: { re: RegExp; kind: KindModeloAtual }[] = [
  { re: /^\/ai\/imagem$/, kind: "image" },
  {
    re: /^\/ai\/(prompt|analise|artigo|ata|carrossel|dashboard|melhorar|documento|audio|transcricao|video\/roteiro|apresentacao\/(roteiro|plano|ajustar|slides)|planilha\/(plano|ajustar|conteudo|gerar)|insights\/(gerar|gerar-repositorio))$/,
    kind: "text",
  },
];

export function kindDaRotaDeIa(url: string): KindModeloAtual | null {
  const caminho = url.split("?")[0].replace(/^https?:\/\/[^/]+/, "");
  return ROTAS.find((r) => r.re.test(caminho))?.kind ?? null;
}
