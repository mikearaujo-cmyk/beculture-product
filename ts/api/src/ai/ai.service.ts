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
  planoIa?: PlanoIaB2c;
  /** Quem executa: chave própria, chave própria simulando BeCulture (protótipo) ou .env. */
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
   * B2C (unificado):
   *   - PEDIDO: `modelo` do seletor do Navbar — `'auto'` (orquestrador) ou um
   *     modelo do catálogo BeCulture (Backoffice → Modelos BeCulture).
   *   - EXECUÇÃO NO PROTÓTIPO: os modelos BeCulture são demonstrativos; quem
   *     responde é a fila de chaves que a conta cadastrou em IA & API. O modelo
   *     pedido roda ele mesmo quando há chave própria do mesmo provedor;
   *     senão, roda a fila própria na ordem de prioridade. O consumo é
   *     registrado como `origem = plataforma` (conta na cota) com o pedido em
   *     `solicitadoComo` e `execucao = prototipo`.
   *   - COTA ESGOTADA: só usa as chaves próprias (`origem = usuario`, fora da
   *     cota) se o usuário AUTORIZOU explicitamente neste ciclo. Sem isso, 429
   *     `franquia_esgotada` — nunca há uso automático de BYOK.
   * B2B / legado: fila própria da conta, como sempre (legado/trial ainda cai
   * na chave do servidor). `modelo` é ignorado.
   */
  private async resolveCandidatos(
    empresaId: string,
    usuarioId?: string,
    tamanhoEntrada = 0,
    modelo?: string,
  ): Promise<CandidatoIa[]> {
    const ctx = await this.modalidade.contexto(empresaId);
    const proprias = await this.connections.listDecrypted(empresaId);

    if (ctx.modalidade !== 'beculture') {
      const origem =
        ctx.modalidade === 'legado'
          ? undefined
          : this.modalidade.origemPropria(ctx.modalidade);
      if (proprias.length > 0) {
        return proprias.map((c) => ({
          ...c,
          managed: false,
          origem,
          execucao: 'propria' as const,
        }));
      }
      const trial = await this.candidatoDeTrial(empresaId);
      if (trial) return [trial];
      throw new ServiceUnavailableException({
        statusCode: 503,
        codigo: 'sem_chave',
        message: 'Nenhuma IA conectada. Conecte um provedor em Configurações → IA & API.',
      });
    }

    const plano = ctx.planoIa ?? 'essencial';
    const catalogo = await this.plataforma.disponiveisNoPlano(plano, 'text');
    this.exigirModeloDisponivel(modelo, catalogo);
    const automatico = !modelo || modelo === ORQUESTRADOR_ID;
    const solicitado = automatico ? ORQUESTRADOR_ID : modelo;

    // Cota BeCulture do plano (só com usuário identificado).
    if (usuarioId) {
      const cota = await this.franquia.estado(usuarioId, plano);
      if (cota.esgotada) {
        const { autorizado } = await this.franquia.byokAutorizado(usuarioId);
        if (!autorizado || proprias.length === 0) {
          throw this.franquia.erroEsgotada(cota, proprias.length > 0);
        }
        // Autorizado: chaves próprias na prioridade da fila BYOK, fora da cota.
        return proprias.map((c) => ({
          ...c,
          managed: false,
          origem: 'usuario' as const,
          solicitadoComo: solicitado,
          execucao: 'propria' as const,
        }));
      }
    }

    if (proprias.length === 0) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        codigo: 'sem_chave_prototipo',
        message:
          'No protótipo, as respostas dos modelos BeCulture usam a sua chave de API. Cadastre uma em Configurações → IA & API.',
      });
    }

    const base = {
      managed: true,
      origem: 'plataforma' as const,
      planoIa: plano,
      solicitadoComo: solicitado,
      execucao: 'prototipo' as const,
    };
    const fila: CandidatoIa[] = proprias.map((c) => ({ ...c, ...base }));
    if (!automatico) {
      // O modelo pedido roda ele mesmo se alguma chave própria do provedor o
      // executa; a fila própria segue como reserva do failover.
      const pedido = catalogo.find((m) => m.model === modelo);
      const chave = pedido && proprias.find((c) => c.provider === pedido.provider);
      if (pedido && chave && isKnownModelFor(chave.provider, 'text', pedido.model)) {
        return [
          { ...chave, ...base, model: pedido.model },
          ...fila,
        ];
      }
      return fila;
    }
    return rotearAutomatico(fila, tamanhoEntrada);
  }

  /** Conta em trial (legado/B2B sem chave própria): chave do servidor. */
  private async candidatoDeTrial(empresaId: string): Promise<CandidatoIa | null> {
    const managedKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!managedKey) return null;
    const assinatura = await this.prisma.assinatura.findUnique({
      where: { empresaId },
    });
    const trialAtivo =
      !!assinatura &&
      assinatura.status === 'trial' &&
      assinatura.trialEndsAt.getTime() > Date.now();
    if (!trialAtivo) return null;
    return {
      provider: 'anthropic',
      model: this.config.get<string>('AI_MODEL', 'claude-opus-4-8'),
      apiKey: managedKey,
      managed: true,
      execucao: 'ambiente',
    };
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
        'A chave de IA conectada é inválida ou sem permissão. Reconecte o provedor em Configurações → IA & API.',
      );
    }
    if (status === 429) {
      throw new ServiceUnavailableException(
        'Limite de uso da IA atingido no provedor. Tente novamente em instantes.',
      );
    }
    if (status === 404) {
      throw new ServiceUnavailableException(
        'O modelo de IA configurado não está disponível. Verifique o modelo em Configurações → IA & API.',
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
