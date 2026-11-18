import axios, { AxiosError, AxiosResponse } from "axios";
import { JWT_HOST_API } from "@/configs/auth";
import { repositorioPastaAtivo } from "@/app/pages/ceo/memoria-inventario";
import {
  escopoIaAtivo,
  organizacaoAtivaId,
} from "@/app/pages/ceo/repositorio-org/escopo";
import { sessaoLocalAtiva, tokenArmazenado } from "@/utils/sessaoLocal";
import { kindDaRotaDeIa, modeloAtual } from "@/utils/modeloAtual";
import { avisarCotaEsgotada, ehCotaEsgotada } from "@/utils/cotaEsgotada";

const axiosInstance = axios.create({
  baseURL: JWT_HOST_API,
});

/**
 * Rejeição usada quando a requisição não obteve resposta HTTP nenhuma: servidor
 * fora do ar, DNS, ou preflight de CORS barrado.
 *
 * É constante exportada, e não um literal solto, porque `motivoLocal`
 * (services/api/contaBackend.ts) compara por identidade para decidir entrar em
 * modo local. Enquanto isso era a string "Something went wrong" repetida nos
 * dois arquivos, mudar o texto de um lado quebrava a detecção do outro em
 * silêncio.
 *
 * O texto muda em dev — a identidade, não. Em produção "servidor indisponível"
 * é tudo o que se pode dizer, mas em dev a causa quase sempre é a API local que
 * não subiu, e o erro genérico mandava procurar no lugar errado. Dizer QUAL
 * servidor não respondeu e QUAL comando o levanta economiza a investigação.
 */
export const ERRO_SEM_RESPOSTA = import.meta.env.DEV
  ? `A API não respondeu em ${JWT_HOST_API}. Rode "npm run start:dev" em ts/api (o Postgres sobe com "npm run db:up").`
  : "Servidor indisponível. Tente novamente.";

/** 401 recebido enquanto a sessão é local — ver utils/sessaoLocal.ts. */
export const ERRO_SESSAO_LOCAL =
  "Sua sessão está em modo local, sem acesso ao servidor. Saia e entre novamente para continuar.";

/**
 * Endpoints que estabelecem a sessão. Um 401 aqui é credencial errada, não
 * sessão local — traduzir seria enganoso, e `credenciaisInvalidas` depende
 * dessa distinção para decidir entre registrar e acusar conflito.
 */
const ROTAS_DE_SESSAO = ["/login", "/registrar"];

/** Header em que o repositório ativo viaja (ver RepositorioAtual, no backend). */
export const HEADER_REPOSITORIO = "X-Repositorio-Id";

/**
 * Header da organização ativa — dona do Repositório da organização (ver
 * OrganizacaoAtual, no backend). Separado do repositório: a pasta local e a
 * base de conhecimento da organização são donos diferentes.
 */
export const HEADER_ORGANIZACAO = "X-Organizacao-Id";

/** Escopo de IA: `pessoal` (B2C) ou `organizacao` (empresarial). */
export const HEADER_ESCOPO_IA = "X-Escopo-Ia";

/**
 * Injeta o repositório (contexto) ativo em toda requisição.
 *
 * Vai por header, e não no corpo, porque o ValidationPipe do backend roda com
 * `forbidNonWhitelisted: true`: um campo extra no body faria a requisição
 * falhar com 400, e incluí-lo exigiria mexer nos DTOs de todos os endpoints e
 * nos 28 clientes deste diretório. Assim nenhum deles muda.
 *
 * É o que isola o índice de notas por repositório: sem isso, sincronizar uma
 * pasta apaga as notas das outras e a IA responde misturando contextos.
 */
axiosInstance.interceptors.request.use((config) => {
  const repositorioId = repositorioPastaAtivo();
  if (repositorioId) config.headers.set(HEADER_REPOSITORIO, repositorioId);
  // Quem já manda o header explícito (services/api/repositorioOrg.ts) vence:
  // o valor de módulo é gravado num efeito do Provider, que roda DEPOIS dos
  // efeitos dos filhos, e no primeiro fetch ainda estaria vazio ou velho.
  const organizacaoId = organizacaoAtivaId();
  if (organizacaoId && !config.headers.has(HEADER_ORGANIZACAO)) {
    config.headers.set(HEADER_ORGANIZACAO, organizacaoId);
  }
  // Pessoal (B2C) ou empresarial (telas antigas): decide a modalidade de IA
  // efetiva no servidor.
  const escopoIa = escopoIaAtivo();
  if (escopoIa) config.headers.set(HEADER_ESCOPO_IA, escopoIa);

  // O token vem do storage a CADA requisição, e não de `axios.defaults`. O
  // header em defaults só existia depois que `setSession` rodava, no efeito
  // async do AuthProvider; como efeito de filho roda antes do efeito do pai,
  // MemoryProvider, ConversasProvider & cia. disparavam a primeira chamada sem
  // Authorization e levavam 401 — que o produto exibia como "servidor
  // indisponível". Aqui o storage é a fonte da verdade: sem token, o header sai
  // fora, para um `defaults` velho não vazar depois do logout.
  const token = tokenArmazenado();
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  else config.headers.delete("Authorization");

  // Modelo escolhido no seletor da ação (SeletorModelo). Só nas rotas de ação
  // de IA listadas em `kindDaRotaDeIa`; quem já manda `modelo` vence. Vai no
  // corpo porque esses endpoints não usam DTO validado (exceto o chat, que
  // declara o campo).
  const kind =
    config.method?.toLowerCase() === "post" && config.url
      ? kindDaRotaDeIa(config.url)
      : null;
  const modelo = kind ? modeloAtual(kind) : undefined;
  if (modelo) {
    if (config.data instanceof FormData) {
      if (!config.data.has("modelo")) config.data.append("modelo", modelo);
    } else if (config.data == null) {
      config.data = { modelo };
    } else if (typeof config.data === "object" && !("modelo" in config.data)) {
      config.data = { ...config.data, modelo };
    }
  }

  return config;
});

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (!error.response) return Promise.reject(ERRO_SEM_RESPOSTA);

    // Um 401 com token de protótipo não é sessão expirada: é uma sessão que
    // nunca existiu no servidor. Sem esta tradução o usuário vê o
    // "Unauthorized" do Nest, que não diz o que fazer a respeito.
    const rota = error.config?.url ?? "";
    if (
      error.response.status === 401 &&
      !ROTAS_DE_SESSAO.some((r) => rota.startsWith(r)) &&
      sessaoLocalAtiva()
    ) {
      return Promise.reject({
        message: ERRO_SESSAO_LOCAL,
        statusCode: 401,
      });
    }

    // Cota BeCulture esgotada (B2C): abre o aviso global com as alternativas.
    // O erro segue para quem chamou, que mantém o próprio tratamento.
    if (ehCotaEsgotada(error.response.data)) {
      avisarCotaEsgotada(error.response.data);
    }

    return Promise.reject(error.response.data || ERRO_SEM_RESPOSTA);
  },
);

export default axiosInstance;
