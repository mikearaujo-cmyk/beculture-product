// ----------------------------------------------------------------------
// Google Drive de demonstração.
//
// Com o Drive autorizado em Conectores, a página /<produto>/drive lê o Drive
// real pelo backend (ts/api, DriveApiService). Sem conector, a tela cai neste
// Drive simulado — mesmo contrato de services/api/drive.ts —, para a
// demonstração continuar navegável: pastas, busca, prévia e "Salvar no
// Repositório" funcionam igual.
// ----------------------------------------------------------------------

import type {
  DriveArquivo,
  DriveConteudo,
  DrivePagina,
  DriveVisao,
} from "@/services/api/drive";

const PASTA = "application/vnd.google-apps.folder";
const DOC = "application/vnd.google-apps.document";
const SHEET = "application/vnd.google-apps.spreadsheet";
const SLIDES = "application/vnd.google-apps.presentation";

interface ItemMock extends DriveArquivo {
  /** Pasta-mãe; "root" = Meu Drive. Ausente = compartilhado comigo. */
  pai?: string;
  /** Texto da prévia; null = tipo sem extração (imagem, .xlsx). */
  texto?: string | null;
  visto?: string;
}

const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const item = (
  o: Partial<ItemMock> & Pick<ItemMock, "id" | "nome" | "mimeType">,
): ItemMock => ({
  pasta: o.mimeType === PASTA,
  nativoGoogle: o.mimeType.startsWith("application/vnd.google-apps"),
  extensao: "",
  dono: "Você",
  webViewLink: "https://drive.google.com/",
  ...o,
});

const ITENS: ItemMock[] = [
  // ---- Meu Drive ----
  item({
    id: "demo-f-cultura",
    nome: "Cultura & Pessoas",
    mimeType: PASTA,
    pai: "root",
    modificadoEm: dias(2),
  }),
  item({
    id: "demo-f-estrategia",
    nome: "Estratégia 2026",
    mimeType: PASTA,
    pai: "root",
    modificadoEm: dias(5),
  }),
  item({
    id: "demo-f-reunioes",
    nome: "Reuniões",
    mimeType: PASTA,
    pai: "root",
    modificadoEm: dias(1),
  }),
  item({
    id: "demo-manual",
    nome: "Manual de cultura",
    mimeType: DOC,
    extensao: ".docx",
    pai: "root",
    modificadoEm: dias(3),
    visto: dias(0),
    texto: `# Manual de cultura

Este manual reúne **quem somos**, como trabalhamos e o que esperamos uns dos outros.

## Nossos valores

1. **Clareza antes de velocidade** — decisões explicadas viajam mais rápido.
2. **Dono do resultado** — quem começa, termina (ou passa o bastão com contexto).
3. **Feedback como presente** — direto, específico e no tempo certo.
4. **Aprender em público** — erros documentados viram atalho para o time.

## Rituais

| Ritual | Frequência | Dono |
|---|---|---|
| Check-in do time | Semanal | Liderança da área |
| Retro do trimestre | Trimestral | People |
| Café com a liderança | Mensal | CEO |

## Como tomamos decisões

Decisões reversíveis são tomadas por quem está mais perto do problema. Decisões irreversíveis passam por um documento curto com contexto, opções e recomendação.`,
  }),
  item({
    id: "demo-politica",
    nome: "Política de trabalho híbrido.pdf",
    mimeType: "application/pdf",
    extensao: ".pdf",
    tamanho: 186_400,
    pai: "root",
    modificadoEm: dias(20),
    visto: dias(4),
    texto: `Política de trabalho híbrido — versão 2026

1. Objetivo
Garantir flexibilidade com momentos presenciais intencionais para colaboração, integração e cultura.

2. Dias presenciais
Cada time define dois dias âncora por semana. Rituais de time e onboarding acontecem nesses dias.

3. Ajuda de custo
Colaboradores recebem ajuda de custo mensal para internet e energia, paga junto com a folha.

4. Comunicação
Assíncrono por padrão: decisões e contexto ficam registrados por escrito no canal do time.`,
  }),
  item({
    id: "demo-offsite",
    nome: "Foto offsite 2026.jpg",
    mimeType: "image/jpeg",
    extensao: ".jpg",
    tamanho: 2_340_000,
    pai: "root",
    modificadoEm: dias(12),
    texto: null,
  }),

  // ---- Cultura & Pessoas ----
  item({
    id: "demo-clima",
    nome: "Pesquisa de clima — Q3",
    mimeType: SHEET,
    extensao: ".xlsx",
    pai: "demo-f-cultura",
    modificadoEm: dias(6),
    visto: dias(1),
    texto: `Dimensão,Q2,Q3,Variação
Liderança,7.8,8.2,+0.4
Reconhecimento,6.9,7.4,+0.5
Carga de trabalho,6.4,6.1,-0.3
Propósito,8.5,8.6,+0.1
eNPS,42,47,+5`,
  }),
  item({
    id: "demo-onboarding",
    nome: "Ritual de onboarding.md",
    mimeType: "text/markdown",
    extensao: ".md",
    tamanho: 2_150,
    pai: "demo-f-cultura",
    modificadoEm: dias(9),
    texto: `# Ritual de onboarding

**Semana 1** — boas-vindas, padrinho/madrinha definido, acesso às ferramentas e leitura do Manual de cultura.

**Semana 2** — sombra em reuniões do time e primeira entrega pequena.

**Dia 30** — conversa de alinhamento com a liderança: o que surpreendeu, o que falta.

> Meta: em 30 dias a pessoa sabe *a quem perguntar* e *onde as decisões ficam registradas*.`,
  }),
  item({
    id: "demo-f-avaliacoes",
    nome: "Avaliações",
    mimeType: PASTA,
    pai: "demo-f-cultura",
    modificadoEm: dias(30),
  }),
  item({
    id: "demo-ciclo",
    nome: "Ciclo de avaliação 2026",
    mimeType: DOC,
    extensao: ".docx",
    pai: "demo-f-avaliacoes",
    modificadoEm: dias(30),
    texto: `# Ciclo de avaliação 2026

- **Autoavaliação:** 1 a 15 de março
- **Avaliação 180°:** 16 a 31 de março
- **Calibração:** primeira semana de abril
- **Conversas de feedback:** até 30 de abril

Critérios: entregas, comportamento alinhado aos valores e desenvolvimento.`,
  }),

  // ---- Estratégia 2026 ----
  item({
    id: "demo-kickoff",
    nome: "Kickoff 2026",
    mimeType: SLIDES,
    extensao: ".pdf",
    pai: "demo-f-estrategia",
    modificadoEm: dias(15),
    visto: dias(2),
    texto: `Kickoff 2026

Onde estamos
Crescimento de 38% na receita recorrente e 12 novas pessoas no time.

Prioridades do ano
1. Expansão para o mercado enterprise
2. Plataforma de IA própria
3. Cultura de alto desempenho com bem-estar

Como vamos medir
OKRs trimestrais, revisados em público no all-hands.`,
  }),
  item({
    id: "demo-orcamento",
    nome: "Orçamento de RH 2026.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensao: ".xlsx",
    tamanho: 48_200,
    pai: "demo-f-estrategia",
    modificadoEm: dias(18),
    texto: null,
  }),

  // ---- Reuniões ----
  item({
    id: "demo-ata",
    nome: "Ata — comitê de pessoas (outubro)",
    mimeType: DOC,
    extensao: ".docx",
    pai: "demo-f-reunioes",
    modificadoEm: dias(1),
    visto: dias(0),
    texto: `# Ata — comitê de pessoas

**Participantes:** Camila (People), Rafael (Produto), Júlia (Financeiro)

## Decisões
- Aprovado o piloto de semana de 4 dias para o time de suporte, por 3 meses.
- Revisão das faixas salariais antecipada para novembro.

## Próximos passos
- Camila: desenhar métricas do piloto até 15/11.
- Júlia: simular impacto das novas faixas no orçamento.`,
  }),

  // ---- Compartilhados comigo ----
  item({
    id: "demo-benchmark",
    nome: "Benchmark de benefícios — consultoria",
    mimeType: DOC,
    extensao: ".docx",
    dono: "Marina Alves",
    modificadoEm: dias(8),
    texto: `# Benchmark de benefícios

Comparativo com 24 empresas de tecnologia de 100 a 500 pessoas.

- **Saúde mental:** 71% oferecem plataforma de terapia.
- **Flexibilidade:** 64% adotam modelo híbrido com dias âncora.
- **Educação:** orçamento médio de R$ 3.200/ano por pessoa.`,
  }),
  item({
    id: "demo-f-squad",
    nome: "Squad Produto — compartilhada",
    mimeType: PASTA,
    dono: "Rafael Costa",
    modificadoEm: dias(4),
  }),
  item({
    id: "demo-roadmap",
    nome: "Roadmap do trimestre.md",
    mimeType: "text/markdown",
    extensao: ".md",
    tamanho: 1_480,
    dono: "Rafael Costa",
    pai: "demo-f-squad",
    modificadoEm: dias(4),
    texto: `# Roadmap do trimestre

- [x] Integração com Slack
- [x] Integração com Google Drive
- [ ] Busca semântica no Repositório
- [ ] Painel de clima em tempo real`,
  }),
];

const publico = (i: ItemMock): DriveArquivo => {
  const { pai, texto, visto, ...a } = i;
  void pai;
  void texto;
  void visto;
  return a;
};

const ordemPadrao = (a: ItemMock, b: ItemMock) =>
  Number(b.pasta) - Number(a.pasta) || a.nome.localeCompare(b.nome, "pt-BR");

/** Pequena espera para a demonstração parecer uma leitura de verdade. */
const espera = () => new Promise((r) => setTimeout(r, 250));

export async function listarDriveDemo(opts: {
  pasta?: string;
  busca?: string;
  visao?: DriveVisao;
}): Promise<DrivePagina> {
  await espera();
  let lista: ItemMock[];
  const termo = opts.busca?.trim().toLowerCase();
  if (termo) {
    lista = ITENS.filter(
      (i) =>
        i.nome.toLowerCase().includes(termo) ||
        (i.texto ?? "").toLowerCase().includes(termo),
    ).sort(ordemPadrao);
  } else if (opts.pasta) {
    lista = ITENS.filter((i) => i.pai === opts.pasta).sort(ordemPadrao);
  } else if (opts.visao === "compartilhados") {
    lista = ITENS.filter((i) => i.dono !== "Você" && !i.pai).sort(ordemPadrao);
  } else if (opts.visao === "recentes") {
    lista = ITENS.filter((i) => !i.pasta && i.visto).sort((a, b) =>
      (b.visto ?? "").localeCompare(a.visto ?? ""),
    );
  } else {
    lista = ITENS.filter((i) => i.pai === "root").sort(ordemPadrao);
  }
  return { conta: null, arquivos: lista.map(publico) };
}

export async function caminhoDriveDemo(
  id: string,
): Promise<{ id: string; nome: string }[]> {
  const trilha: { id: string; nome: string }[] = [];
  let atual = ITENS.find((i) => i.id === id);
  while (atual && atual.pai && atual.pai !== "root") {
    trilha.unshift({ id: atual.id, nome: atual.nome });
    atual = ITENS.find((i) => i.id === atual!.pai);
  }
  if (atual) trilha.unshift({ id: atual.id, nome: atual.nome });
  return trilha;
}

export async function conteudoDriveDemo(id: string): Promise<DriveConteudo> {
  await espera();
  const i = ITENS.find((x) => x.id === id);
  if (!i) throw new Error("Arquivo não encontrado no Drive de demonstração.");
  if (!i.texto) {
    return {
      arquivo: publico(i),
      texto: null,
      suportado: false,
      truncado: false,
      motivo: "Prévia de texto indisponível para este tipo de arquivo.",
    };
  }
  return {
    arquivo: publico(i),
    texto: i.texto,
    suportado: true,
    truncado: false,
  };
}

/**
 * "Original" da demonstração: só os arquivos de texto têm bytes de verdade
 * (o próprio texto); os demais são salvos apenas como nota.
 */
export async function originalDriveDemo(id: string): Promise<Blob | null> {
  const i = ITENS.find((x) => x.id === id);
  if (!i?.texto || !/^\.(md|txt|csv)$/.test(i.extensao)) return null;
  return new Blob([i.texto], {
    type: i.extensao === ".csv" ? "text/csv" : "text/markdown",
  });
}
