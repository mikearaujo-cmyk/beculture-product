import type { DriveArquivo, DriveVisao } from './drive-api.service';

/**
 * Google Drive de DEMONSTRAÇÃO servido pelo backend.
 *
 * Vale para a conexão `google-drive` gravada com `origem = 'demo'` (ver
 * `prisma/seed-demo-drive.ts`, que a cria para a conta "Time BeCulture"). Com
 * ela, a tela /drive segue o caminho do Drive REAL (o conector aparece como
 * conectado) e o `DriveApiService` responde daqui em vez de chamar o Google —
 * mesmo contrato, então listar, buscar, abrir, ver e salvar no Repositório
 * funcionam igual.
 *
 * Diferença deliberada do Drive real: Docs/Sheets/Slides não viram .docx/.xlsx/
 * .pdf ao salvar — não há bytes reais para exportar. O "original" é o próprio
 * texto, e por isso a extensão deles aqui é .md/.csv.
 *
 * Os donos são os colaboradores fictícios de `seed-demo-membros.ts`.
 */

const PASTA = 'application/vnd.google-apps.folder';
const DOC = 'application/vnd.google-apps.document';
const SHEET = 'application/vnd.google-apps.spreadsheet';
const SLIDES = 'application/vnd.google-apps.presentation';

export const DRIVE_DEMO_CONTA = 'drive@timebeculture.exemplo.com.br';

interface ItemDemo {
  id: string;
  nome: string;
  mimeType: string;
  /** Pasta-mãe; "root" = Meu Drive; ausente = compartilhado comigo. */
  pai?: string;
  /** Texto da prévia/nota; ausente = tipo sem extração. */
  texto?: string;
  tamanho?: number;
  /** Dias atrás da última modificação. */
  dias: number;
  dono?: string;
}

const ITENS: ItemDemo[] = [
  // ---------------- Meu Drive ----------------
  { id: 'demo-pasta-cultura', nome: 'Cultura & Pessoas', mimeType: PASTA, pai: 'root', dias: 1 },
  { id: 'demo-pasta-estrategia', nome: 'Estratégia 2027', mimeType: PASTA, pai: 'root', dias: 3 },
  { id: 'demo-pasta-produto', nome: 'Produto', mimeType: PASTA, pai: 'root', dias: 2 },
  { id: 'demo-pasta-reunioes', nome: 'Reuniões', mimeType: PASTA, pai: 'root', dias: 0 },
  { id: 'demo-pasta-financeiro', nome: 'Financeiro', mimeType: PASTA, pai: 'root', dias: 9 },
  {
    id: 'demo-boas-vindas',
    nome: 'Leia-me — Drive do Time BeCulture',
    mimeType: DOC,
    pai: 'root',
    dias: 20,
    texto: `# Drive do Time BeCulture

Este é o Drive compartilhado da operação. Organização das pastas:

- **Cultura & Pessoas** — manual de cultura, onboarding, pesquisas de clima e avaliações.
- **Estratégia 2027** — planejamento anual, OKRs e orçamento.
- **Produto** — roadmap, discovery e especificações.
- **Reuniões** — atas e pautas dos rituais (comitês, all-hands, 1:1 de liderança).
- **Financeiro** — orçamento e acompanhamento mensal.

Dúvidas: fale com a Fernanda Castro (Pessoas & Cultura) ou com o Ricardo Tavares (Tecnologia).`,
  },

  // ---- Cultura & Pessoas ----
  {
    id: 'demo-manual-cultura',
    nome: 'Manual de cultura',
    mimeType: DOC,
    pai: 'demo-pasta-cultura',
    dias: 12,
    dono: 'Fernanda Castro',
    texto: `# Manual de cultura — Time BeCulture

## Propósito
Ajudar empresas a transformar cultura em prática do dia a dia, com dados e com gente.

## Valores
1. **Clareza antes de velocidade** — decisões explicadas viajam mais rápido do que decisões rápidas.
2. **Dono do problema** — quem identifica, puxa; quem puxa, fecha o ciclo.
3. **Feedback é cuidado** — direto, específico e no tempo certo.
4. **Aprender em público** — erros documentados viram aprendizado da empresa, não da pessoa.

## Comportamentos esperados
- Registrar decisões relevantes no Repositório, com contexto e responsáveis.
- Fazer 1:1 quinzenal com o gestor direto, com pauta compartilhada.
- Reconhecer publicamente entregas de colegas no canal #reconhecimento.

## Rituais
| Ritual | Frequência | Dono |
|---|---|---|
| All-hands | Mensal | Carolina Silva |
| Comitê de pessoas | Mensal | Fernanda Castro |
| Review de produto | Quinzenal | Michael Araújo |
| Retro de engenharia | Quinzenal | Patrícia Moura |`,
  },
  {
    id: 'demo-onboarding',
    nome: 'Ritual de onboarding.md',
    mimeType: 'text/markdown',
    pai: 'demo-pasta-cultura',
    dias: 30,
    tamanho: 2_140,
    dono: 'Bruno Carvalho',
    texto: `# Ritual de onboarding (primeiros 30 dias)

**Semana 1 — Chegada**
- Kit de boas-vindas e acessos no D-1 (responsável: Tecnologia).
- Café com a liderança da área e apresentação do manual de cultura.
- Padrinho/madrinha definido pelo gestor.

**Semana 2 — Contexto**
- Sessões com cada área (Produto, Tecnologia, Marketing, Financeiro).
- Leitura guiada do Repositório: decisões e insights dos últimos 3 meses.

**Semanas 3 e 4 — Primeira entrega**
- Uma entrega pequena e visível, combinada com o gestor.
- Check-in de 30 dias com Pessoas & Cultura (Aline Teixeira).`,
  },
  {
    id: 'demo-clima-q3',
    nome: 'Pesquisa de clima — Q3 2026',
    mimeType: SHEET,
    pai: 'demo-pasta-cultura',
    dias: 18,
    dono: 'Aline Teixeira',
    texto: `Área,Respondentes,eNPS,Clareza de objetivos,Reconhecimento,Carga de trabalho,Relação com gestor
Produto,6,52,4.3,3.9,3.1,4.5
Tecnologia,7,41,3.8,3.6,2.9,4.2
Marketing,4,60,4.4,4.1,3.5,4.6
Pessoas & Cultura,4,75,4.6,4.4,3.8,4.7
Financeiro,3,33,3.9,3.2,3.0,4.0
Total,24,50,4.2,3.8,3.2,4.4`,
  },
  {
    id: 'demo-politica-hibrido',
    nome: 'Política de trabalho híbrido.pdf',
    mimeType: 'application/pdf',
    pai: 'demo-pasta-cultura',
    dias: 45,
    tamanho: 186_400,
    dono: 'Natália Ribeiro',
    texto: `Política de trabalho híbrido — versão 2.1

1. Modelo: 2 dias presenciais por semana, definidos por área (Produto e Tecnologia: terça e quinta).
2. Encontros presenciais obrigatórios: all-hands mensal e planejamento trimestral.
3. Horário núcleo de colaboração: 10h às 16h.
4. Auxílio home office: R$ 150/mês, pago na folha.
5. Exceções devem ser combinadas com o gestor direto e registradas com Pessoas & Cultura.`,
  },
  { id: 'demo-pasta-avaliacoes', nome: 'Avaliações', mimeType: PASTA, pai: 'demo-pasta-cultura', dias: 6 },
  {
    id: 'demo-ciclo-avaliacao',
    nome: 'Ciclo de avaliação 2026 — calendário',
    mimeType: DOC,
    pai: 'demo-pasta-avaliacoes',
    dias: 6,
    dono: 'Fernanda Castro',
    texto: `# Ciclo de avaliação 2026

- **01/12 a 12/12** — autoavaliação e avaliação de pares.
- **15/12 a 19/12** — avaliação do gestor e calibração por área.
- **05/01 a 09/01** — comitê de calibração (Fernanda, Carolina, Ricardo, Marcelo).
- **12/01 a 23/01** — conversas de feedback e PDI.

Critérios: entregas (40%), comportamentos de cultura (40%), desenvolvimento (20%).`,
  },
  {
    id: 'demo-foto-offsite',
    nome: 'Foto offsite 2026.jpg',
    mimeType: 'image/jpeg',
    pai: 'demo-pasta-cultura',
    dias: 60,
    tamanho: 2_480_000,
    dono: 'Isabela Freitas',
  },

  // ---- Estratégia 2027 ----
  {
    id: 'demo-okrs-2027',
    nome: 'OKRs 2027 — rascunho',
    mimeType: DOC,
    pai: 'demo-pasta-estrategia',
    dias: 3,
    dono: 'Carolina Silva',
    texto: `# OKRs 2027 (rascunho para o planejamento de dezembro)

## O1 — Tornar a BeCulture a referência em cultura orientada por dados
- KR1: 120 empresas ativas na plataforma (hoje: 64).
- KR2: NPS de clientes ≥ 60.
- KR3: 3 estudos de caso publicados com resultado mensurável.

## O2 — Escalar o produto sem perder qualidade
- KR1: tempo médio de resposta da IA abaixo de 4s.
- KR2: zero incidentes críticos por trimestre.
- KR3: 80% das features novas com discovery documentado no Repositório.

## O3 — Ser um lugar ótimo para trabalhar
- KR1: eNPS interno ≥ 60 (Q3 2026: 50).
- KR2: 100% dos colaboradores com PDI ativo.`,
  },
  {
    id: 'demo-orcamento-2027',
    nome: 'Orçamento 2027',
    mimeType: SHEET,
    pai: 'demo-pasta-estrategia',
    dias: 4,
    dono: 'Marcelo Antunes',
    texto: `Centro de custo,Q1,Q2,Q3,Q4,Total
Pessoas,1.180.000,1.240.000,1.310.000,1.360.000,5.090.000
Infraestrutura e IA,210.000,235.000,260.000,290.000,995.000
Marketing,150.000,180.000,160.000,210.000,700.000
Ferramentas,48.000,48.000,52.000,52.000,200.000
Eventos e offsites,20.000,60.000,20.000,80.000,180.000
Total,1.608.000,1.763.000,1.802.000,1.992.000,7.165.000`,
  },
  {
    id: 'demo-kickoff-2027',
    nome: 'Kickoff 2027',
    mimeType: SLIDES,
    pai: 'demo-pasta-estrategia',
    dias: 5,
    dono: 'Carolina Silva',
    texto: `Kickoff 2027

Slide 1 — De onde viemos: 64 clientes, 24 pessoas, 3 grandes lançamentos.
Slide 2 — O que aprendemos: clientes valorizam o Repositório como memória da cultura.
Slide 3 — Para onde vamos: três objetivos (referência em dados de cultura, escala com qualidade, lugar ótimo para trabalhar).
Slide 4 — Como vamos medir: OKRs trimestrais revisados no all-hands.
Slide 5 — Próximos passos: planejamento por área até 15/01.`,
  },

  // ---- Produto ----
  {
    id: 'demo-roadmap',
    nome: 'Roadmap Q1 2027',
    mimeType: DOC,
    pai: 'demo-pasta-produto',
    dias: 2,
    dono: 'Michael Araújo',
    texto: `# Roadmap Q1 2027

| Tema | Entrega | Responsável | Status |
|---|---|---|---|
| Compartilhamento | Permissões por equipe e área | Renato Costa | Em andamento |
| Conectores | Google Drive e Slack com sincronização | Gustavo Ferreira | Em andamento |
| IA Studio | Atas a partir de áudio e vídeo | Juliana Pacheco | Discovery |
| Insights | Painel de clima por área | Felipe Andrade | Planejado |
| Design System | Tokens de marca por cliente | Larissa Mendes | Planejado |

Riscos: dependência de cota de IA por tenant; revisar limites com o Financeiro.`,
  },
  {
    id: 'demo-discovery-atas',
    nome: 'Discovery — atas automáticas.md',
    mimeType: 'text/markdown',
    pai: 'demo-pasta-produto',
    dias: 8,
    tamanho: 3_020,
    dono: 'Juliana Pacheco',
    texto: `# Discovery — atas automáticas

**Problema:** gestores gastam ~40 min por semana escrevendo atas, e metade das decisões não chega ao Repositório.

**Hipótese:** gerar a ata a partir da gravação, com decisões e responsáveis destacados, aumenta o registro de decisões em 2x.

**Entrevistas (8):**
- 6 de 8 já gravam as reuniões, mas ninguém revisita a gravação.
- O valor percebido está nos *próximos passos com dono*, não no resumo.

**Próximo passo:** protótipo com 3 clientes piloto em janeiro.`,
  },
  {
    id: 'demo-wireframes',
    nome: 'Wireframes — painel de clima.png',
    mimeType: 'image/png',
    pai: 'demo-pasta-produto',
    dias: 7,
    tamanho: 940_000,
    dono: 'Larissa Mendes',
  },

  // ---- Reuniões ----
  {
    id: 'demo-ata-comite',
    nome: 'Ata — comitê de pessoas (novembro)',
    mimeType: DOC,
    pai: 'demo-pasta-reunioes',
    dias: 0,
    dono: 'Bruno Carvalho',
    texto: `# Ata — comitê de pessoas (novembro)

**Participantes:** Fernanda Castro, Carolina Silva, Ricardo Tavares, Marcelo Antunes, Bruno Carvalho.

## Decisões
1. Abrir 2 vagas de engenharia para o Q1 (dono: Patrícia Moura).
2. Programa de reconhecimento trimestral aprovado, com orçamento de R$ 18 mil/ano.
3. Calibração do ciclo de avaliação fica para 05/01.

## Pontos de atenção
- Carga de trabalho em Tecnologia (nota 2,9 na pesquisa de clima). Ricardo traz plano na próxima reunião.

## Próximos passos
- [ ] Publicar a política de reconhecimento — Natália Ribeiro — 30/11
- [ ] Plano de carga de trabalho em Tecnologia — Ricardo Tavares — 10/12`,
  },
  {
    id: 'demo-ata-allhands',
    nome: 'Pauta — all-hands de dezembro',
    mimeType: DOC,
    pai: 'demo-pasta-reunioes',
    dias: 1,
    dono: 'Carolina Silva',
    texto: `# All-hands de dezembro — pauta

1. Resultados do ano (Carolina) — 10 min
2. Kickoff 2027 e OKRs (Carolina, Ricardo) — 15 min
3. Pesquisa de clima: o que muda (Fernanda) — 10 min
4. Reconhecimentos do trimestre (Mariana) — 10 min
5. Perguntas abertas — 15 min`,
  },
  {
    id: 'demo-retro-eng',
    nome: 'Retro de engenharia — sprint 42.txt',
    mimeType: 'text/plain',
    pai: 'demo-pasta-reunioes',
    dias: 4,
    tamanho: 1_150,
    dono: 'Patrícia Moura',
    texto: `Retro — sprint 42

Foi bem:
- Deploy do compartilhamento sem incidentes.
- Pareamento Gustavo + Lucas acelerou o conector do Drive.

Pode melhorar:
- Muitas interrupções por suporte; criar rodízio de plantão.
- Revisões de PR demorando mais de 1 dia.

Ações:
- Rodízio de plantão semanal (Thiago) — a partir da sprint 43.
- Meta de revisão de PR em até 24h (todos).`,
  },

  // ---- Financeiro ----
  {
    id: 'demo-fechamento-out',
    nome: 'Fechamento outubro 2026',
    mimeType: SHEET,
    pai: 'demo-pasta-financeiro',
    dias: 9,
    dono: 'Vanessa Lima',
    texto: `Indicador,Orçado,Realizado,Variação
Receita recorrente (MRR),410.000,432.500,+5,5%
Custo de IA,38.000,44.100,+16,1%
Folha,395.000,391.200,-1,0%
Marketing,55.000,49.800,-9,5%
Caixa final,2.180.000,2.236.000,+2,6%`,
  },
  {
    id: 'demo-orcamento-rh',
    nome: 'Orçamento de RH 2026.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pai: 'demo-pasta-financeiro',
    dias: 70,
    tamanho: 48_200,
    dono: 'Marcelo Antunes',
  },

  // ---------------- Compartilhados comigo ----------------
  {
    id: 'demo-shared-benchmark',
    nome: 'Benchmark de benefícios — consultoria',
    mimeType: DOC,
    dias: 14,
    dono: 'Consultoria Horizonte',
    texto: `# Benchmark de benefícios — empresas de tecnologia (até 100 pessoas)

- Vale-refeição/alimentação médio: R$ 1.250/mês.
- Plano de saúde 100% pago pela empresa: 78% das empresas.
- Auxílio home office: 61% (média de R$ 140/mês).
- Orçamento de educação: 44% (média de R$ 2.400/ano).

Recomendação: priorizar orçamento de educação, hoje inexistente na BeCulture.`,
  },
  {
    id: 'demo-shared-campanha',
    nome: 'Campanha de lançamento — briefing',
    mimeType: DOC,
    dias: 6,
    dono: 'Mariana Duarte',
    texto: `# Briefing — campanha "Cultura que se vê"

**Objetivo:** gerar 300 leads qualificados no Q1.
**Público:** líderes de RH e CEOs de empresas de 50 a 500 pessoas.
**Canais:** LinkedIn, webinar mensal e newsletter.
**Mensagem central:** cultura deixa de ser intuição quando vira dado e memória.
**Responsáveis:** Rafael Monteiro (conteúdo), Isabela Freitas (peças).`,
  },
  {
    id: 'demo-shared-arquitetura',
    nome: 'Arquitetura — conectores v2',
    mimeType: SLIDES,
    dias: 10,
    dono: 'Ricardo Tavares',
    texto: `Arquitetura — conectores v2

Slide 1 — Hoje: leitura sob demanda via OAuth por tenant.
Slide 2 — Proposta: sincronização incremental com fila e webhooks.
Slide 3 — Segurança: tokens criptografados, escopos mínimos, auditoria de acesso.
Slide 4 — Custos: estimativa de R$ 4 mil/mês em infraestrutura.`,
  },
  {
    id: 'demo-shared-video',
    nome: 'Gravação — treinamento de liderança.mp4',
    mimeType: 'video/mp4',
    dias: 22,
    tamanho: 312_000_000,
    dono: 'Natália Ribeiro',
  },
];

const POR_ID = new Map(ITENS.map((i) => [i.id, i]));

const EXT_POR_MIME: Record<string, string> = {
  [DOC]: '.md',
  [SLIDES]: '.md',
  [SHEET]: '.csv',
  'application/pdf': '.pdf',
  'text/markdown': '.md',
  'text/plain': '.txt',
};

function extensao(i: ItemDemo): string {
  const m = /\.[a-z0-9]+$/i.exec(i.nome);
  return m ? m[0].toLowerCase() : (EXT_POR_MIME[i.mimeType] ?? '');
}

function mapear(i: ItemDemo, agora: number): DriveArquivo {
  return {
    id: i.id,
    nome: i.nome,
    mimeType: i.mimeType,
    pasta: i.mimeType === PASTA,
    tamanho: i.tamanho,
    modificadoEm: new Date(agora - i.dias * 86_400_000).toISOString(),
    dono: i.dono ?? 'Time BeCulture',
    webViewLink: 'https://drive.google.com/',
    nativoGoogle: i.mimeType.startsWith('application/vnd.google-apps'),
    extensao: extensao(i),
  };
}

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function ordenarPastaNome(a: ItemDemo, b: ItemDemo): number {
  const pa = a.mimeType === PASTA ? 0 : 1;
  const pb = b.mimeType === PASTA ? 0 : 1;
  return pa - pb || a.nome.localeCompare(b.nome, 'pt-BR');
}

export function listarDemo(opts: {
  pasta?: string;
  busca?: string;
  visao?: DriveVisao;
  pageToken?: string;
  limite?: number;
}): { arquivos: DriveArquivo[]; proximaPagina?: string } {
  const agora = Date.now();
  let itens: ItemDemo[];
  const busca = opts.busca?.trim();
  if (busca) {
    const termo = semAcento(busca);
    itens = ITENS.filter(
      (i) =>
        semAcento(i.nome).includes(termo) ||
        (i.texto ? semAcento(i.texto).includes(termo) : false),
    );
  } else if (opts.pasta) {
    itens = ITENS.filter((i) => i.pai === opts.pasta).sort(ordenarPastaNome);
  } else if (opts.visao === 'compartilhados') {
    itens = ITENS.filter((i) => !i.pai).sort((a, b) => a.dias - b.dias);
  } else if (opts.visao === 'recentes') {
    itens = ITENS.filter((i) => i.mimeType !== PASTA)
      .sort((a, b) => a.dias - b.dias)
      .slice(0, 15);
  } else {
    itens = ITENS.filter((i) => i.pai === 'root').sort(ordenarPastaNome);
  }

  const inicio = Number(opts.pageToken) || 0;
  const max = Math.min(Math.max(1, opts.limite ?? 50), 100);
  const pagina = itens.slice(inicio, inicio + max);
  return {
    arquivos: pagina.map((i) => mapear(i, agora)),
    proximaPagina:
      inicio + max < itens.length ? String(inicio + max) : undefined,
  };
}

export function caminhoDemo(id: string): { id: string; nome: string }[] {
  const trilha: { id: string; nome: string }[] = [];
  let atual = POR_ID.get(id);
  while (atual) {
    trilha.unshift({ id: atual.id, nome: atual.nome });
    atual = atual.pai && atual.pai !== 'root' ? POR_ID.get(atual.pai) : undefined;
  }
  return trilha;
}

/** Item da demo, ou undefined quando o id não existe. */
export function itemDemo(
  id: string,
): { arquivo: DriveArquivo; texto: string | null } | undefined {
  const i = POR_ID.get(id);
  if (!i) return undefined;
  return { arquivo: mapear(i, Date.now()), texto: i.texto ?? null };
}
