/**
 * Onboarding de IA — etapas específicas de cada modalidade.
 *
 *   B2C BeCulture: conta → plano → modelos do plano → confirmação → conclusão
 *   B2C BYOK:      conta → plano → como obter a chave → cadastro/validação →
 *                  modelos → confirmação → conclusão
 *   B2B:           conta → modelo B2B → organização → configuração inicial →
 *                  chaves da organização → modelos para membros → conclusão
 *
 * O backend decide se a etapa pode avançar (prontidão da IA): a interface não
 * apresenta a plataforma como pronta enquanto BYOK/B2B não tiverem chave
 * válida + modelo. No B2C BeCulture, a falta de modelos é da plataforma — o
 * usuário nunca é mandado cadastrar chave.
 */

import {
  BuildingOffice2Icon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  CubeIcon,
  KeyIcon,
  LightBulbIcon,
  RocketLaunchIcon,
  Squares2X2Icon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";

import { AiConnectionCard, BadgeOrigem } from "@/app/pages/ceo/AiConnectionCard";
import { EstadoIaNaoConfigurada } from "@/app/pages/ceo/ia/EstadoIaNaoConfigurada";
import { Button } from "@/components/ui";
import { HOME_PATH } from "@/constants/app";
import {
  concluirOnboardingIa,
  definirModalidade,
  marcarEtapaOnboarding,
  mensagemDeErro,
  ROTULO_MODALIDADE,
  ROTULO_PLANO,
  useResumoContaIa,
  type ModalidadeEfetiva,
  type ResumoContaIa,
} from "@/services/api/modalidade";
import axios from "@/utils/axios";

import { MolduraAuth } from "../components/MolduraAuth";
import { StepperConta, type EtapaStepper } from "../components/StepperConta";
import {
  lerPlanoEscolhido,
  limparPlanoEscolhido,
} from "../model/planoEscolhido";

type IdEtapa =
  | "conta"
  | "plano"
  | "modelos_plano"
  | "guia_chave"
  | "chave"
  | "modelos"
  | "organizacao"
  | "config_org"
  | "chaves_org"
  | "modelos_membros"
  | "confirmar"
  | "concluido";

const ETAPAS: Record<Exclude<ModalidadeEfetiva, "legado">, (EtapaStepper & { key: IdEtapa })[]> = {
  beculture: [
    { key: "conta", titulo: "Conta", Icon: UserIcon },
    { key: "plano", titulo: "Plano", Icon: CreditCardIcon },
    { key: "modelos_plano", titulo: "Modelos do plano", Icon: CubeIcon },
    { key: "confirmar", titulo: "Confirmação", Icon: ClipboardDocumentCheckIcon },
    { key: "concluido", titulo: "Pronto", Icon: RocketLaunchIcon },
  ],
  byok: [
    { key: "conta", titulo: "Conta", Icon: UserIcon },
    { key: "plano", titulo: "Plano BYOK", Icon: CreditCardIcon },
    { key: "guia_chave", titulo: "Obter chave", Icon: LightBulbIcon },
    { key: "chave", titulo: "Cadastrar chave", Icon: KeyIcon },
    { key: "modelos", titulo: "Modelos", Icon: Squares2X2Icon },
    { key: "confirmar", titulo: "Confirmação", Icon: ClipboardDocumentCheckIcon },
    { key: "concluido", titulo: "Pronto", Icon: RocketLaunchIcon },
  ],
  organizacao: [
    { key: "conta", titulo: "Conta", Icon: UserIcon },
    { key: "plano", titulo: "Modelo B2B", Icon: CreditCardIcon },
    { key: "organizacao", titulo: "Organização", Icon: BuildingOffice2Icon },
    { key: "config_org", titulo: "Configuração", Icon: Cog6ToothIcon },
    { key: "chaves_org", titulo: "Chaves da org.", Icon: KeyIcon },
    { key: "modelos_membros", titulo: "Modelos p/ membros", Icon: Squares2X2Icon },
    { key: "concluido", titulo: "Pronto", Icon: RocketLaunchIcon },
  ],
};

const PROVEDORES_GUIA = [
  {
    nome: "Anthropic (Claude)",
    url: "https://console.anthropic.com/settings/keys",
    passos: [
      "Acesse o console da Anthropic e entre na sua conta.",
      'Abra "API Keys" e clique em "Create Key".',
      "Copie a chave (começa com sk-ant-) — ela só aparece uma vez.",
    ],
  },
  {
    nome: "OpenAI (GPT)",
    url: "https://platform.openai.com/api-keys",
    passos: [
      "Acesse a plataforma da OpenAI e entre na sua conta.",
      'Em "API keys", clique em "Create new secret key".',
      "Copie a chave (começa com sk-) e guarde em local seguro.",
    ],
  },
];

export default function OnboardingIa() {
  const navigate = useNavigate();
  const conta = useResumoContaIa();
  const { resumo, setResumo, recarregar } = conta;
  const [indiceEscolhido, setIndice] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const aplicouPlano = useRef(false);

  // Conta já existente no servidor (login em vez de registro): aplica aqui o
  // plano escolhido, enquanto o onboarding não foi concluído.
  useEffect(() => {
    if (!resumo || aplicouPlano.current) return;
    const plano = lerPlanoEscolhido();
    if (
      resumo.modalidade === "legado" &&
      plano &&
      !resumo.onboarding.concluidoEm
    ) {
      aplicouPlano.current = true;
      definirModalidade(plano.modalidadeIa, plano.planoIa)
        .then(setResumo)
        .catch((e) => setErro(mensagemDeErro(e)));
    }
  }, [resumo, setResumo]);

  const etapas = useMemo(
    () =>
      resumo && resumo.modalidade !== "legado" ? ETAPAS[resumo.modalidade] : [],
    [resumo],
  );

  // Retoma da primeira etapa ainda não concluída (após conta e plano). Depois
  // do primeiro avanço, quem manda é a navegação do próprio usuário.
  const primeiraPendente = resumo
    ? etapas.findIndex((e, i) => i >= 2 && !resumo.onboarding.etapas[e.key])
    : -1;
  const indice =
    indiceEscolhido ??
    (etapas.length === 0
      ? null
      : primeiraPendente === -1
        ? etapas.length - 1
        : primeiraPendente);
  const aplicandoPlano =
    !!resumo &&
    resumo.modalidade === "legado" &&
    !resumo.onboarding.concluidoEm &&
    !!lerPlanoEscolhido() &&
    !erro;

  if ((conta.carregando && !resumo) || aplicandoPlano) {
    return (
      <MolduraAuth tituloPagina="Configurando sua conta" titulo="Carregando…">
        <p className="text-sm text-gray-400">Lendo a configuração da conta…</p>
      </MolduraAuth>
    );
  }

  if (!resumo) {
    return (
      <MolduraAuth
        tituloPagina="Configurando sua conta"
        titulo="Não foi possível carregar sua conta"
      >
        <p className="dark:text-dark-200 text-sm text-gray-600">
          {conta.erro ??
            "O onboarding de IA precisa da sessão no servidor."}
        </p>
        <Button
          className="mt-4 w-full"
          color="primary"
          onClick={() => void recarregar()}
        >
          Tentar novamente
        </Button>
      </MolduraAuth>
    );
  }

  if (resumo.modalidade === "legado") {
    return (
      <MolduraAuth
        tituloPagina="Escolha seu plano"
        titulo="Esta conta ainda não tem um plano"
      >
        <p className="dark:text-dark-200 text-sm text-gray-600">
          Contas criadas antes da seleção de planos mantêm o comportamento
          anterior. Escolha uma modalidade para seguir o onboarding.
        </p>
        <Button
          className="mt-4 w-full"
          color="primary"
          onClick={() => navigate("../plano")}
        >
          Escolher plano
        </Button>
      </MolduraAuth>
    );
  }

  if (indice === null) return null;
  const etapa = etapas[indice];

  const avancar = async () => {
    setErro(null);
    setSalvando(true);
    try {
      let r: ResumoContaIa;
      const proxima = etapas[indice + 1];
      if (proxima?.key === "concluido") {
        r = await concluirOnboardingIa();
        limparPlanoEscolhido();
      } else {
        r = await marcarEtapaOnboarding(etapa.key);
      }
      setResumo(r);
      setIndice(indice + 1);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  };

  const voltar = () => {
    setErro(null);
    if (indice > 2) setIndice(indice - 1);
  };

  const { titulo, subtitulo, conteudo, podeAvancar, rotuloAvancar } =
    renderEtapa(etapa.key, resumo, () => void recarregar());

  return (
    <MolduraAuth
      tituloPagina="Configurar IA"
      kicker={ROTULO_MODALIDADE[resumo.modalidade]}
      titulo={titulo}
      subtitulo={subtitulo}
      largura="max-w-[52rem]"
      antesDoCard={<StepperConta stepIndex={indice} etapas={etapas} />}
    >
      {conteudo}

      {erro && <p className="text-error mt-4 text-sm">{erro}</p>}

      {etapa.key === "concluido" ? (
        <Button
          className="mt-6 w-full"
          color="primary"
          onClick={() => navigate(HOME_PATH)}
        >
          Ir para a plataforma
        </Button>
      ) : (
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button
            variant="flat"
            onClick={voltar}
            disabled={indice <= 2 || salvando}
          >
            Voltar
          </Button>
          <Button
            color="primary"
            onClick={() => void avancar()}
            disabled={!podeAvancar || salvando}
          >
            {salvando ? "Salvando…" : rotuloAvancar}
          </Button>
        </div>
      )}
    </MolduraAuth>
  );
}

function renderEtapa(
  key: IdEtapa,
  r: ResumoContaIa,
  recarregar: () => void,
): {
  titulo: string;
  subtitulo?: ReactNode;
  conteudo: ReactNode;
  podeAvancar: boolean;
  rotuloAvancar: string;
} {
  const chaveOk = r.chavesProprias.utilizaveis > 0;
  switch (key) {
    case "modelos_plano":
      return {
        titulo: "Modelos incluídos no seu plano",
        subtitulo: `Plano ${r.planoIa ? ROTULO_PLANO[r.planoIa] : ""} · IA gerenciada pela BeCulture`,
        conteudo: <ModelosDoPlano r={r} />,
        podeAvancar: true,
        rotuloAvancar:
          r.prontidao === "sem_modelos_plataforma"
            ? "Continuar mesmo assim"
            : "Continuar",
      };
    case "guia_chave":
      return {
        titulo: "Como obter sua chave de API",
        subtitulo:
          "Com chaves próprias a IA roda na sua conta do provedor. O uso é cobrado pelo provedor, não pela BeCulture.",
        conteudo: <GuiaChave />,
        podeAvancar: true,
        rotuloAvancar: "Já tenho minha chave",
      };
    case "chave":
    case "chaves_org":
      return {
        titulo:
          key === "chave"
            ? "Cadastre e valide sua chave"
            : "Chaves de API da organização",
        subtitulo:
          key === "chave"
            ? "A chave é validada no provedor e guardada criptografada."
            : "Obrigatório para habilitar a IA. As chaves pertencem à organização e não são compartilhadas com outras.",
        conteudo: (
          <>
            {!chaveOk && (
              <EstadoIaNaoConfigurada
                compacto
                className="mb-5"
                prontidao={
                  r.prontidao === "sem_modelos_habilitados" ||
                  r.prontidao === "pronta"
                    ? "sem_chave"
                    : r.prontidao
                }
                modalidade={r.modalidade}
                podeAdministrar={r.podeAdministrarIa}
              />
            )}
            <AiConnectionCard exibir="chaves" onAlteracao={recarregar} />
          </>
        ),
        podeAvancar: chaveOk,
        rotuloAvancar: chaveOk ? "Continuar" : "Cadastre uma chave válida",
      };
    case "modelos":
    case "modelos_membros":
      return {
        titulo:
          key === "modelos"
            ? "Escolha os modelos que vai usar"
            : "Modelos disponíveis para os membros",
        subtitulo:
          "O primeiro de cada fila é o principal; os seguintes assumem se ele falhar.",
        conteudo: (
          <>
            {r.prontidao !== "pronta" && (
              <EstadoIaNaoConfigurada
                compacto
                className="mb-5"
                prontidao={r.prontidao}
                modalidade={r.modalidade}
                podeAdministrar={r.podeAdministrarIa}
              />
            )}
            <AiConnectionCard exibir="modelos" onAlteracao={recarregar} />
          </>
        ),
        podeAvancar: r.prontidao === "pronta",
        rotuloAvancar:
          r.prontidao === "pronta"
            ? key === "modelos_membros"
              ? "Concluir configuração"
              : "Continuar"
            : "Habilite ao menos um modelo",
      };
    case "organizacao":
      return {
        titulo: "Sua organização",
        subtitulo: "Confirme a organização que está contratando a beculture.",
        conteudo: <DadosOrganizacao />,
        podeAvancar: true,
        rotuloAvancar: "Confirmar organização",
      };
    case "config_org":
      return {
        titulo: "Configuração inicial da organização",
        subtitulo: "Como a licença e a IA funcionam para a organização.",
        conteudo: <ConfigOrganizacao r={r} />,
        podeAvancar: true,
        rotuloAvancar: "Continuar",
      };
    case "confirmar":
      return {
        titulo: "Confirme as configurações",
        conteudo: <Confirmacao r={r} />,
        podeAvancar:
          r.modalidade === "beculture" || r.prontidao === "pronta",
        rotuloAvancar: "Confirmar e concluir",
      };
    case "concluido":
      return {
        titulo: "Tudo pronto",
        conteudo: <Concluido r={r} />,
        podeAvancar: true,
        rotuloAvancar: "",
      };
    default:
      return {
        titulo: "",
        conteudo: null,
        podeAvancar: true,
        rotuloAvancar: "Continuar",
      };
  }
}

function ModelosDoPlano({ r }: { r: ResumoContaIa }) {
  return (
    <ul className="space-y-2">
      {r.modelosPlataforma.map((m) => (
        <li
          key={m.id}
          className="dark:border-dark-500 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-2"
        >
          <span className="dark:text-dark-100 text-sm font-medium text-gray-800">
            {m.rotulo}
          </span>
          <span className="dark:text-dark-300 text-xs text-gray-400">
            {m.providerNome} ·{" "}
            {m.kind === "text" ? "Texto" : m.kind === "image" ? "Imagem" : "Vídeo"}
          </span>
          <span className="ml-auto">
            <BadgeOrigem origem="plataforma" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function GuiaChave() {
  return (
    <div className="space-y-4">
      <p className="dark:text-dark-200 text-sm text-gray-600">
        Uma <strong>chave de API</strong> é uma senha que autoriza a beculture a
        usar a sua conta no provedor de IA. Escolha um provedor compatível:
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PROVEDORES_GUIA.map((p) => (
          <div
            key={p.nome}
            className="dark:border-dark-500 rounded-lg border border-gray-200 p-4"
          >
            <p className="dark:text-dark-100 text-sm font-semibold text-gray-800">
              {p.nome}
            </p>
            <ol className="dark:text-dark-200 mt-2 list-decimal space-y-1 ps-4 text-xs text-gray-600">
              {p.passos.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              Abrir página de chaves ↗
            </a>
          </div>
        ))}
      </div>
      <p className="dark:text-dark-300 text-xs text-gray-400">
        Provedores de imagem e vídeo também podem ser conectados depois, em
        Configurações → IA & API. Nesses, a validação automática ainda não está
        disponível no protótipo.
      </p>
    </div>
  );
}

function DadosOrganizacao() {
  const [empresa, setEmpresa] = useState<{
    razaoSocial: string;
    nomeFantasia: string | null;
  } | null>(null);
  useEffect(() => {
    axios
      .get("/empresa")
      .then(({ data }) => setEmpresa(data))
      .catch(() => setEmpresa(null));
  }, []);
  return (
    <div className="space-y-4">
      <div className="dark:border-dark-500 rounded-lg border border-gray-200 px-4 py-3">
        <p className="dark:text-dark-300 text-xs text-gray-400">Organização</p>
        <p className="dark:text-dark-100 text-base font-semibold text-gray-800">
          {empresa?.nomeFantasia || empresa?.razaoSocial || "—"}
        </p>
        <p className="dark:text-dark-300 mt-1 text-xs text-gray-500">
          Você é o administrador desta organização.
        </p>
      </div>
      <p className="dark:text-dark-300 text-xs text-gray-400">
        Credenciais, modelos e dados ficam isolados nesta organização: outras
        organizações não os enxergam, mesmo que tenham membros em comum.
      </p>
    </div>
  );
}

function ConfigOrganizacao({ r }: { r: ResumoContaIa }) {
  const itens = [
    {
      t: "Licença SaaS",
      d: "Cobrança por quantidade de membros e módulos contratados. Não depende de consumo de tokens. (Simulada no protótipo.)",
    },
    {
      t: "IA da organização",
      d: "A IA funciona exclusivamente com chaves de API da organização. A BeCulture não fornece modelos, credenciais nem franquia de IA para B2B.",
    },
    {
      t: "Membros",
      d: "Membros autorizados usam os modelos que a organização liberar. Gerir chaves exige a permissão de configurações.",
    },
  ];
  return (
    <div className="space-y-3">
      {itens.map((i) => (
        <div
          key={i.t}
          className="dark:border-dark-500 rounded-lg border border-gray-200 px-4 py-3"
        >
          <p className="dark:text-dark-100 text-sm font-medium text-gray-800">
            {i.t}
          </p>
          <p className="dark:text-dark-300 mt-0.5 text-xs text-gray-500">
            {i.d}
          </p>
        </div>
      ))}
      {!r.podeAdministrarIa && (
        <p className="text-warning text-xs">
          Sua role não permite gerenciar a IA da organização.
        </p>
      )}
    </div>
  );
}

function Confirmacao({ r }: { r: ResumoContaIa }) {
  const linhas: { k: string; v: ReactNode }[] = [
    { k: "Modalidade", v: ROTULO_MODALIDADE[r.modalidade] },
  ];
  if (r.modalidade === "beculture") {
    linhas.push(
      { k: "Plano", v: r.planoIa ? ROTULO_PLANO[r.planoIa] : "—" },
      {
        k: "Modelos",
        v:
          r.modelosPlataforma.length > 0
            ? r.modelosPlataforma.map((m) => m.rotulo).join(", ")
            : "Aguardando disponibilização pela BeCulture",
      },
      { k: "Custos de IA", v: "Incluídos no plano, sujeitos à cota" },
      {
        k: "Chaves próprias",
        v: "Opcionais, em Configurações → IA & API (no protótipo, são elas que geram as respostas)",
      },
    );
  } else {
    linhas.push(
      { k: "Chaves válidas", v: String(r.chavesProprias.utilizaveis) },
      {
        k: "Situação da IA",
        v: r.prontidao === "pronta" ? "Pronta para uso" : "Configuração pendente",
      },
      { k: "Custos de IA", v: "Pagos diretamente ao provedor" },
    );
  }
  linhas.push({ k: "Credenciais", v: <BadgeOrigem origem={r.origemCredenciais} /> });
  return (
    <dl className="dark:divide-dark-500 divide-y divide-gray-100">
      {linhas.map((l) => (
        <div key={l.k} className="flex items-center justify-between gap-4 py-2.5">
          <dt className="dark:text-dark-300 text-sm text-gray-500">{l.k}</dt>
          <dd className="dark:text-dark-100 text-end text-sm font-medium text-gray-800">
            {l.v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Concluido({ r }: { r: ResumoContaIa }) {
  const pronta = r.prontidao === "pronta";
  return (
    <div className="text-center">
      <CheckBadgeIcon className="text-success mx-auto size-12" />
      <p className="dark:text-dark-100 mt-3 text-sm text-gray-700">
        {pronta
          ? "Sua conta está configurada e a IA está pronta para uso."
          : "Sua conta está configurada. Os recursos de IA serão liberados assim que a BeCulture disponibilizar os modelos do seu plano."}
      </p>
      <p className="dark:text-dark-300 mt-2 text-xs text-gray-400">
        Você pode revisar tudo em{" "}
        <Link
          to="/behuman/configuracoes?secao=ia"
          className="text-primary-600 hover:underline dark:text-primary-400"
        >
          Configurações → IA & API
        </Link>
        .
      </p>
    </div>
  );
}
