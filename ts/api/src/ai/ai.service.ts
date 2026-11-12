import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  AiProvider,
  OrigemCredencial,
  PlanoIaB2c,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ModalidadeService } from './modalidade.service';
import { PlataformaIaService } from './plataforma.service';
import { FranquiaService } from './franquia.service';
import { ORQUESTRADOR_ID, rotearAutomatico } from './orquestrador';
import { PrototipoIaService } from './prototipo.service';
import { isKnownModelFor } from './catalogo';
import { getProvider, type LlmWebResult } from './providers';
import { AiConnectionsService } from './connections.service';
import {
  ehChaveRejeitada,
  ehFalhaDeProvedor,
  statusDoErro,
} from './falha-provedor';
import { blocoTitulosVault, REGRA_CONEXOES_VAULT } from './conexoes-vault';
import { VaultService } from '@/vault/vault.service';
import { UsoTokensService } from '@/uso/uso-tokens.service';
import { MemoriasService } from '@/memorias/memorias.service';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatInput {
  empresaId: string;
  /** Repositório ativo — escopa o vault lido para montar as conexões. */
  repositorioId: string | null;
  usuarioId: string;
  squadId: string;
  agentId?: string;
  messages: ChatTurn[];
  /** Modelo escolhido no seletor ("auto" = orquestrador). */
  modelo?: string;
}

/** Um modelo candidato a atender a chamada, na ordem de prioridade do tenant. */
interface CandidatoIa {
  /** Id da conexão BYOK; ausente no modo gerenciado (trial). */
  id?: string;
  provider: AiProvider;
  model: string;
  apiKey: string;
  managed: boolean;
  /** Dono da credencial (plataforma, usuário ou organização). */
  origem?: OrigemCredencial;
  /** Provedor da chave operacional do protótipo, quando ela executou. */
  prototipoProvider?: string;
  planoIa?: PlanoIaB2c;
  /** Infraestrutura que executa: chave própria, operacional ou .env. */
  execucao?: 'propria' | 'prototipo' | 'ambiente';
  /** "auto" (orquestrador) ou o id do modelo pedido no seletor. */
  solicitadoComo?: string;
}

/** Enquadramento da plataforma, anexado ao prompt da persona. */
const PLATFORM_FRAMING = `Você atua dentro do beculture, uma plataforma de inteligência de pessoas para líderes e CEOs.
Responda em português do Brasil, de forma prática, estruturada e objetiva.
Quando fizer sentido, finalize com recomendações acionáveis e próximos passos.
Não invente métricas, dados de conectores ou fatos que não tenham sido fornecidos no contexto.`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly connections: AiConnectionsService,
    private readonly uso: UsoTokensService,
    private readonly vault: VaultService,
    private readonly memorias: MemoriasService,
    private readonly modalidade: ModalidadeService,
    private readonly plataforma: PlataformaIaService,
    private readonly franquia: FranquiaService,
    private readonly prototipo: PrototipoIaService,
  ) {}

  /**
   * Anexa as DIRETRIZES ativas do tenant ao fim do system prompt. Toda chamada
   * de IA passa por aqui (chat de squad, completar e completarWeb), então uma
   * diretriz criada na tela Diretrizes vale para qualquer coisa que a IA
   * produza — não só para o chat. Fica no fim de propósito: é a última coisa
   * que o modelo lê antes da tarefa, o que reforça a precedência das regras.
   *
   * Se a consulta ao banco falhar, a chamada segue sem as diretrizes: melhor
   * responder sem os guardrails do que derrubar a funcionalidade inteira.
   */
  private async comDiretrizes(
    empresaId: string,
    system: string,
  ): Promise<string> {
    try {
      const bloco = await this.memorias.blocoSystem(empresaId);
      return bloco ? `${system}\n\n${bloco}` : system;
    } catch (err) {
      this.logger.warn(`Falha ao carregar Diretrizes: ${String(err)}`);
      return system;
    }
  }

  /**
   * Persona de um AGENTE (o antigo "squad") no nível consolidado: uma voz só,
   * com o repertório dos conselheiros como base interna. É o mesmo texto que o
   * chat de squad sempre usou; saiu daqui para o Assistente (/ai/prompt)
   * poder usá-lo quando um agente participa da conversa. `null` = agente
   * inexistente ou inativo.
   *
   * Com `dono`, o id também pode ser de um agente PERSONALIZADO — mas só do
   * próprio usuário (empresa + usuário do JWT) e não excluído. Agente de outra
   * pessoa simplesmente não existe para quem pergunta.
   */
  async personaDoAgente(
    id: string,
    dono?: {
      empresaId: string;
      usuarioId: string;
      /** Organização ativa: libera os agentes DELA além dos pessoais. */
      organizacaoId?: string | null;
    },
  ): Promise<{ id: string; titulo: string; texto: string } | null> {
    const squad = await this.prisma.squad.findFirst({
      where: { id, active: true },
      include: {
        agents: { where: { active: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!squad) {
      if (!dono) return null;
      const pessoal = await this.prisma.agenteUsuario.findFirst({
        where: {
          id,
          empresaId: dono.empresaId,
          excluidoEm: null,
          // Pessoal do próprio usuário, ou da organização ativa.
          OR: [
            { usuarioId: dono.usuarioId, organizacaoId: null },
            ...(dono.organizacaoId
              ? [{ organizacaoId: dono.organizacaoId }]
              : []),
          ],
        },
      });
      if (!pessoal) return null;

      // Versão da organização de um agente do sistema: mantém o repertório do
      // original e soma o que a organização configurou por cima.
      if (pessoal.sistemaId) {
        const original = await this.prisma.squad.findFirst({
          where: { id: pessoal.sistemaId, active: true },
          include: {
            agents: { where: { active: true }, orderBy: { order: 'asc' } },
          },
        });
        if (original) {
          const partes = [
            `Você é o agente "${pessoal.nome}", configurado pela organização a partir de um agente pré-programado.`,
            textoDoSquad(
              pessoal.descricao || original.description,
              original.agents,
            ),
            pessoal.instrucoes &&
              `Instruções da organização para este agente (siga-as ao responder):\n${pessoal.instrucoes}`,
          ].filter(Boolean);
          return {
            id: pessoal.id,
            titulo: pessoal.nome,
            texto: partes.join('\n\n'),
          };
        }
      }

      const autor = pessoal.organizacaoId ? 'da organização' : 'do usuário';
      const partes = [
        `Você é o agente "${pessoal.nome}", um especialista configurado ${
          pessoal.organizacaoId ? 'pela organização' : 'pelo próprio usuário'
        }.`,
        pessoal.descricao && `Especialidade: ${pessoal.descricao}`,
        pessoal.instrucoes &&
          `Instruções ${autor} para este agente (siga-as ao responder):\n${pessoal.instrucoes}`,
        'Responda a partir desta especialidade, de forma direta, e termine com os próximos passos práticos quando fizer sentido.',
      ].filter(Boolean);
      return { id: pessoal.id, titulo: pessoal.nome, texto: partes.join('\n\n') };
    }

    const texto = textoDoSquad(squad.description, squad.agents);
    return { id: squad.id, titulo: squad.title, texto };
  }

  /** Monta o system prompt: persona do agente, ou nível-squad. Lê do catálogo no banco. */
  private async buildSystem(input: ChatInput): Promise<string> {
    // A resposta do squad pode ser salva como documento/nota na Memória: fecha
    // com o bloco de conexões, ligando-a às notas que já existem no vault.
    if (input.agentId) {
      const agent = await this.prisma.squadAgent.findFirst({
        where: {
          id: input.agentId,
          squadId: input.squadId,
          active: true,
          squad: { active: true },
        },
      });
      if (agent) {
        const conexoes = await this.buildConexoesContext(input);
        return `${agent.prompt}

---
${PLATFORM_FRAMING}${conexoes}`;
      }
    }

    const persona = await this.personaDoAgente(input.squadId);
    if (!persona) {
      throw new NotFoundException('Squad não encontrado.');
    }
    const conexoes = await this.buildConexoesContext(input);
    return `${persona.texto}

---
${PLATFORM_FRAMING}${conexoes}`;
  }

  /**
   * Regra do bloco "🔗 Conexões no Vault" + os títulos das notas do vault que
   * conversam com a pergunta atual (alvos possíveis dos [[wikilinks]]). Se o
   * vault não estiver acessível, a regra vale mesmo assim — o modelo cria os
   * links marcados como "(novo)".
   */
  private async buildConexoesContext(input: ChatInput): Promise<string> {
    const ultima = [...input.messages].reverse().find((m) => m.role === 'user');
    let titulos: string[] = [];
    try {
      titulos = await this.vault.titulos(
        input.empresaId,
        input.repositorioId,
        ultima?.text ?? '',
        40,
      );
    } catch {
      /* sem vault sincronizado: segue só com a regra */
    }
    return `\n${REGRA_CONEXOES_VAULT}\n${blocoTitulosVault(titulos)}`;
  }

  /**
   * Resolve os candidatos de TEXTO de uma chamada, em ordem de prioridade.
   *
   * O PEDIDO vem do que a conta pode usar — B2C BeCulture: catálogo publicado
   * no plano; BYOK/B2B/legado: fila (demonstrativa) da conta — e do `modelo`
   * escolhido no seletor da ação:
   *   - `'auto'`         → Automático (orquestrador) escolhe entre os pedidos
   *   - id de um modelo  → esse modelo vai à frente (precisa estar disponível)
   *   - ausente          → ordem da fila (chamadas internas)
   *
   * A EXECUÇÃO é sempre da chave operacional do Backoffice: o modelo pedido
   * roda ele mesmo se a chave o executa; senão, roda o modelo padrão
   * operacional. Pedido × efetivo ficam registrados no consumo.
   */
  private async resolveCandidatos(
    empresaId: string,
    usuarioId?: string,
    tamanhoEntrada = 0,
    modelo?: string,
  ): Promise<CandidatoIa[]> {
    const ctx = await this.modalidade.contexto(empresaId);
    // O seletor de modelos só existe no B2C BeCulture: nas demais
    // modalidades a fila da conta define a ordem e `modelo` é ignorado.
    if (ctx.modalidade !== 'beculture') modelo = undefined;
    const operacionais = await this.prototipo.chavesTexto();
    const semChaveOperacional = () =>
      new ServiceUnavailableException({
        statusCode: 503,
        codigo: 'sem_chave_prototipo',
        message:
          'O protótipo está sem chave de API operacional. Cadastre uma em Backoffice → Configuração de API.',
      });

    // Pedidos possíveis da conta + metadados comerciais de cada contexto.
    let pedidos: {
      provider: string;
      model: string;
      limiteTokensCiclo: number | null;
    }[];
    let base: Pick<CandidatoIa, 'managed' | 'origem' | 'planoIa'>;

    if (ctx.modalidade === 'beculture') {
      // Catálogo publicado; a fila própria (de um BYOK anterior) nunca entra.
      const plano = ctx.planoIa ?? 'essencial';
      pedidos = (await this.plataforma.disponiveisNoPlano(plano, 'text')).map(
        (m) => ({
          provider: m.provider,
          model: m.model,
          limiteTokensCiclo:
            m.planos.find((p) => p.plano === plano)?.limiteTokensCiclo ?? null,
        }),
      );
      if (pedidos.length === 0) {
        throw new ServiceUnavailableException({
          statusCode: 503,
          codigo: 'sem_modelos_plataforma',
          message:
            'Nenhum modelo BeCulture está disponível no seu plano no momento. A disponibilização é feita pela administração da plataforma.',
        });
      }
      this.exigirModeloDisponivel(modelo, pedidos);
      if (usuarioId) {
        pedidos = await this.franquia.filtrarComSaldo(usuarioId, plano, pedidos);
      }
      base = { managed: true, origem: 'plataforma', planoIa: plano };
    } else {
      // BYOK, B2B e legadas: fila demonstrativa da conta (ver
      // PROTOTIPO_CHAVES_DA_CONTA_DEMONSTRATIVAS).
      pedidos = (await this.connections.listPublic(empresaId))
        .filter((c) => c.ativa && c.status !== 'invalida')
        .map((c) => ({
          provider: c.provider,
          model: c.model,
          limiteTokensCiclo: null,
        }));
      this.exigirModeloDisponivel(modelo, pedidos);
      base = {
        managed: true,
        origem:
          ctx.modalidade === 'legado'
            ? undefined
            : this.modalidade.origemPropria(ctx.modalidade),
      };
    }
    if (operacionais.length === 0) throw semChaveOperacional();

    const automatico = modelo === ORQUESTRADOR_ID;
    const especifico = modelo && !automatico ? modelo : undefined;
    if (especifico) {
      // O escolhido vai à frente; os demais seguem como reserva do failover.
      pedidos = [
        ...pedidos.filter((p) => p.model === especifico),
        ...pedidos.filter((p) => p.model !== especifico),
      ];
    }
    const solicitado = automatico ? ORQUESTRADOR_ID : especifico;
    const execucao = (o: { fonte: string }) =>
      o.fonte === 'backoffice' ? ('prototipo' as const) : ('ambiente' as const);

    const executaveis: CandidatoIa[] = [];
    for (const p of pedidos) {
      const op = operacionais.find((o) => o.provider === p.provider);
      if (op && isKnownModelFor(op.provider, 'text', p.model)) {
        executaveis.push({
          ...base,
          provider: op.provider as AiProvider,
          model: p.model,
          apiKey: op.apiKey,
          prototipoProvider: op.provider,
          solicitadoComo: solicitado ?? p.model,
          execucao: execucao(op),
        });
      }
    }
    // Pedido que a chave operacional não executa (ex.: modelo demonstrativo)
    // cai no modelo padrão operacional, mantendo o pedido registrado.
    const pedidoPrincipal = solicitado ?? pedidos[0]?.model;
    const usaPadrao =
      executaveis.length === 0 ||
      (!!especifico && executaveis[0].model !== especifico);
    const padrao: CandidatoIa[] = operacionais
      .filter((o) => o.model)
      .map((o) => ({
        ...base,
        provider: o.provider as AiProvider,
        model: o.model,
        apiKey: o.apiKey,
        prototipoProvider: o.provider,
        solicitadoComo: pedidoPrincipal,
        execucao: execucao(o),
      }));
    const lista = usaPadrao ? [...padrao, ...executaveis] : executaveis;
    return automatico ? rotearAutomatico(lista, tamanhoEntrada) : lista;
  }

  /** Um modelo específico só vale se estiver entre os disponíveis da conta. */
  private exigirModeloDisponivel(
    modelo: string | undefined,
    pedidos: { model: string }[],
  ): void {
    if (!modelo || modelo === ORQUESTRADOR_ID) return;
    if (!pedidos.some((p) => p.model === modelo)) {
      throw new BadRequestException(
        'O modelo escolhido não está disponível para esta conta. Escolha outro no seletor de modelos.',
      );
    }
  }

  /**
   * Executa a chamada no primeiro modelo da fila e, se ele falhar por culpa do
   * provedor, tenta o próximo. Se todos falharem, traduz o último erro.
   */
  private async comFailover<T>(
    empresaId: string,
    executar: (candidato: CandidatoIa) => Promise<T>,
    usuarioId?: string,
    tamanhoEntrada = 0,
    modelo?: string,
  ): Promise<{ valor: T; candidato: CandidatoIa }> {
    const candidatos = await this.resolveCandidatos(
      empresaId,
      usuarioId,
      tamanhoEntrada,
      modelo,
    );
    let ultimoErro: unknown;

    for (let i = 0; i < candidatos.length; i++) {
      const candidato = candidatos[i];
      try {
        return { valor: await executar(candidato), candidato };
      } catch (err) {
        ultimoErro = err;
        const tentarProximo =
          ehFalhaDeProvedor(err) && i < candidatos.length - 1;
        this.registrarFalha(candidato, err, tentarProximo);
        if (!tentarProximo) break;
      }
    }

    this.traduzErroProvedor(ultimoErro);
  }

  /**
   * Loga a falha de um modelo da fila e, quando o provedor rejeitou a chave,
   * marca a conexão como inválida para a interface sinalizar ao usuário.
   */
  private registrarFalha(
    candidato: CandidatoIa,
    err: unknown,
    tentarProximo: boolean,
  ): void {
    const status = statusDoErro(err);
    this.logger.warn(
      `Falha em ${candidato.provider}/${candidato.model}` +
        (status ? ` (HTTP ${status})` : '') +
        (tentarProximo
          ? ': tentando o próximo modelo da fila.'
          : ': sem outro modelo para assumir.'),
    );
    if (candidato.id && ehChaveRejeitada(err)) {
      void this.connections.marcarInvalida(candidato.id);
    }
    if (candidato.prototipoProvider && ehChaveRejeitada(err)) {
      void this.prototipo.marcarInvalida(candidato.prototipoProvider);
    }
  }

  /** Grava o consumo com o modelo efetivo e o dono da credencial usada. */
  private registrarUso(
    empresaId: string,
    usuarioId: string,
    candidato: CandidatoIa,
    usage: { entrada: number; saida: number },
    fonte: string,
    execucaoId?: string,
  ): void {
    this.uso.registrar({
      empresaId,
      usuarioId,
      entrada: usage.entrada,
      saida: usage.saida,
      fonte,
      provider: candidato.provider,
      model: candidato.model,
      origem: candidato.origem,
      solicitadoComo: candidato.solicitadoComo ?? candidato.model,
      planoIa: candidato.planoIa,
      execucaoId,
      execucao: candidato.execucao,
    });
  }

  /**
   * Gera a resposta do agente em streaming (chunks de texto). O failover só
   * acontece ANTES do primeiro chunk: depois que o cliente já recebeu texto,
   * não há como rebobinar a resposta, então o erro é propagado.
   */
  async *chatStream(input: ChatInput): AsyncGenerator<string> {
    const messages = input.messages.filter((m) => m.text && m.text.trim());
    if (messages.length === 0) {
      throw new BadRequestException('Envie ao menos uma mensagem.');
    }

    const system = await this.comDiretrizes(
      input.empresaId,
      await this.buildSystem(input),
    );
    const ultima = messages[messages.length - 1]?.text ?? '';
    const candidatos = await this.resolveCandidatos(
      input.empresaId,
      input.usuarioId,
      ultima.length,
      input.modelo,
    );
    const execucaoId = randomUUID();
    let ultimoErro: unknown;

    for (let i = 0; i < candidatos.length; i++) {
      const candidato = candidatos[i];
      let emitiu = false;
      try {
        const stream = getProvider(candidato.provider).streamChat({
          apiKey: candidato.apiKey,
          model: candidato.model,
          system,
          messages,
          onUsage: (u) =>
            this.registrarUso(
              input.empresaId,
              input.usuarioId,
              candidato,
              u,
              'chat',
              execucaoId,
            ),
        });
        for await (const chunk of stream) {
          emitiu = true;
          yield chunk;
        }
        return;
      } catch (err) {
        ultimoErro = err;
        const tentarProximo =
          !emitiu && ehFalhaDeProvedor(err) && i < candidatos.length - 1;
        this.registrarFalha(candidato, err, tentarProximo);
        if (!tentarProximo) break;
      }
    }

    this.traduzErroProvedor(ultimoErro);
  }

  /**
   * Traduz erros do provedor de IA (SDK Anthropic/OpenAI) em mensagens claras
   * para o usuário. Sem isto, uma chave inválida ou modelo indisponível vira um
   * 500 opaco ("Erro na busca") sem pista do que corrigir. Só é chamado depois
   * que TODOS os modelos da fila falharam.
   */
  private traduzErroProvedor(err: unknown): never {
    const status = statusDoErro(err);
    if (status === 401 || status === 403) {
      throw new ServiceUnavailableException(
        'A chave de IA conectada é inválida ou sem permissão. Reconecte o provedor em Conexões.',
      );
    }
    if (status === 429) {
      throw new ServiceUnavailableException(
        'Limite de uso da IA atingido no provedor. Tente novamente em instantes.',
      );
    }
    if (status === 404) {
      throw new ServiceUnavailableException(
        'O modelo de IA configurado não está disponível. Verifique o modelo em Conexões.',
      );
    }
    const msg = err instanceof Error ? err.message : 'erro desconhecido';
    throw new ServiceUnavailableException(`Falha ao consultar a IA: ${msg}`);
  }

  /**
   * Resposta única (não-streaming) usada por relatórios longos — ex.: a Análise
   * de conteúdo. Percorre a fila de modelos do tenant com failover e chama o
   * provedor com um limite de tokens maior que o chat.
   */
  async completar(
    empresaId: string,
    usuarioId: string,
    system: string,
    user: string,
    maxTokens = 16000,
    fonte = 'completar',
    /**
     * `semDiretrizes` só para chamadas internas que não produzem texto para o
     * usuário (ex.: o classificador de rota do Prompt, que responde uma única
     * palavra). Em tudo que vira resposta, as diretrizes entram.
     */
    opts: {
      semDiretrizes?: boolean;
      /** Modelo escolhido no seletor da ação ("auto" = orquestrador). */
      modelo?: string;
    } = {},
  ): Promise<{ text: string; truncated: boolean }> {
    const systemFinal = opts.semDiretrizes
      ? system
      : await this.comDiretrizes(empresaId, system);
    const { valor: result, candidato } = await this.comFailover(
      empresaId,
      (c) =>
        getProvider(c.provider).complete({
          apiKey: c.apiKey,
          model: c.model,
          system: systemFinal,
          user,
          maxTokens,
        }),
      usuarioId,
      user.length,
      opts.modelo,
    );
    if (result.usage) {
      this.registrarUso(empresaId, usuarioId, candidato, result.usage, fonte);
    }
    return { text: result.text, truncated: result.truncated };
  }

  /**
   * Resposta única com busca na web (fontes citadas) — usada pelo modo "Web" do
   * Prompt. Se o provedor do tenant não oferece busca (ex.: OpenAI aqui), cai
   * numa resposta comum sem fontes, apenas com o conhecimento do modelo.
   */
  async completarWeb(
    empresaId: string,
    usuarioId: string,
    system: string,
    user: string,
    maxTokens = 4000,
    opts: { modelo?: string } = {},
  ): Promise<LlmWebResult> {
    const systemFinal = await this.comDiretrizes(empresaId, system);
    const { valor: result, candidato } = await this.comFailover(
      empresaId,
      (c) => {
        const provider = getProvider(c.provider);
        const params = {
          apiKey: c.apiKey,
          model: c.model,
          system: systemFinal,
          user,
          maxTokens,
        };
        return provider.completeWeb
          ? provider.completeWeb(params)
          : provider.complete(params).then(
              (r): LlmWebResult => ({
                text: r.text,
                fontes: [],
                truncated: r.truncated,
                usage: r.usage,
              }),
            );
      },
      usuarioId,
      user.length,
      opts.modelo,
    );
    if (result.usage) {
      this.registrarUso(empresaId, usuarioId, candidato, result.usage, 'web');
    }
    return result;
  }
}

/**
 * Persona de um agente do sistema (squad): uma voz única que integra o
 * repertório dos conselheiros. Usada pelo original e pela versão que uma
 * organização editou.
 */
function textoDoSquad(
  descricao: string,
  conselheirosAtivos: {
    reference: string;
    position: string;
    contribution: string;
  }[],
): string {
  const conselheiros = conselheirosAtivos
    .map((a) => `- ${a.reference} (${a.position}): ${a.contribution}`)
    .join('\n');
  return `Você responde como a inteligência consolidada deste squad: uma única voz que já integrou internamente o conhecimento dos conselheiros abaixo. Eles são seu repertório interno — o usuário NÃO quer ouvir a opinião de cada um separadamente.
Quando utilizar este squad: ${descricao}

Repertório interno do squad (não enderece um por um):
${conselheiros}

Como responder:
- Entregue UMA resposta única, direta e resumida — sem seções por conselheiro, sem "Fulano diria...", sem listar a contribuição de cada membro.
- Sintetize os pontos em comum e resolva as divergências relevantes, em vez de enumerá-las.
- Mencione o nome de um conselheiro apenas quando uma perspectiva específica for decisiva (no máximo um ou dois, de passagem).
- Priorize a concisão: vá ao ponto e termine com os próximos passos práticos.`;
}
