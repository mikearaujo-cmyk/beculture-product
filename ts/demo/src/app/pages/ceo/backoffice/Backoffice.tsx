/**
 * Backoffice do PROTÓTIPO.
 *
 * Centraliza os controles da demonstração em áreas com responsabilidades
 * separadas — nenhuma compartilha credencial ou configuração com outra:
 *   - Repositórios: seleção de pasta local por repositório (já existente)
 *   - Configuração de API: chave operacional REAL que executa as chamadas
 *   - Modelos BeCulture: catálogo administrativo DEMONSTRATIVO dos planos B2C
 *   - Conta em demonstração: migração de cenário da conta logada
 *
 * Acesso: no protótipo, qualquer conta. Na versão comercial é área interna da
 * BeCulture (o ponto de restrição é o `BackofficeGuard` da API).
 */

import {
  CircleStackIcon,
  FolderIcon,
  KeyIcon,
  Squares2X2Icon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { useSearchParams } from "react-router";

import { Page } from "@/components/shared/Page";
import { PageTitle } from "@/components/shared/PageTitle";

import { NavegacaoSecoes, type GrupoNavegacao } from "../NavegacaoSecoes";
import { SectionCard } from "../configuracoes-ui";
import { PastaLocalPanel } from "../PastaLocalPanel";
import { ConfiguracaoApiSection } from "./ConfiguracaoApiSection";
import { ContaDemoSection } from "./ContaDemoSection";
import { IaPlataformaSection } from "./IaPlataformaSection";

type SecaoBackoffice = "repositorios" | "api" | "modelos" | "conta";

const GRUPOS: readonly GrupoNavegacao[] = [
  {
    id: "prototipo",
    titulo: "Infraestrutura do protótipo",
    itens: [
      { id: "repositorios", titulo: "Repositórios", icon: FolderIcon },
      { id: "api", titulo: "Configuração de API", icon: KeyIcon },
    ],
  },
  {
    id: "beculture",
    titulo: "Catálogo BeCulture",
    itens: [
      { id: "modelos", titulo: "Modelos BeCulture", icon: Squares2X2Icon },
    ],
  },
  {
    id: "demonstracao",
    titulo: "Demonstração",
    itens: [
      { id: "conta", titulo: "Conta em demonstração", icon: UserCircleIcon },
    ],
  },
];

const SECOES: SecaoBackoffice[] = ["repositorios", "api", "modelos", "conta"];
/** Links antigos (`?secao=ia`) apontavam para o catálogo. */
const ALIASES: Record<string, SecaoBackoffice> = { ia: "modelos" };

export default function Backoffice() {
  const [params, setParams] = useSearchParams();
  const bruta = params.get("secao") ?? "";
  const pedida = (ALIASES[bruta] ?? bruta) as SecaoBackoffice;
  const ativa: SecaoBackoffice = SECOES.includes(pedida) ? pedida : "api";

  return (
    <Page title="Backoffice · protótipo">
      <div className="transition-content w-full px-(--margin-x) py-6">
        <div className="flex flex-col gap-1">
          <PageTitle
            help={{
              title: "Backoffice",
              description: (
                <>
                  <p>
                    O <strong>Backoffice</strong> centraliza os controles do
                    protótipo. Na versão comercial ele será uma área interna da
                    BeCulture, restrita à equipe de produto e desenvolvimento;
                    no protótipo, qualquer conta acessa.
                  </p>
                  <p>
                    <strong>Configuração de API</strong> guarda a chave real que
                    executa as chamadas de IA do protótipo. Não é um plano nem a
                    chave de um usuário.
                  </p>
                  <p>
                    <strong>Modelos BeCulture</strong> demonstra como a equipe
                    interna cadastraria provedores e publicaria modelos nos
                    planos B2C. As credenciais de lá não executam chamadas.
                  </p>
                  <p>
                    <strong>Conta em demonstração</strong> migra a conta logada
                    entre modalidades, para ver como cada uma se comporta.
                  </p>
                </>
              ),
            }}
          >
            Backoffice
          </PageTitle>
          <p className="dark:text-dark-300 flex max-w-xl items-center gap-1.5 text-sm text-gray-500">
            <CircleStackIcon className="size-4" />
            Controles do protótipo — não são configurações da sua conta.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row">
          <NavegacaoSecoes<SecaoBackoffice>
            ativo={ativa}
            onSelecionar={(s) => setParams({ secao: s })}
            grupos={GRUPOS}
            ariaLabel="Seções do Backoffice"
            prefixoId="bo"
          />
          <div className="min-w-0 flex-1">
            {ativa === "repositorios" && (
              <SectionCard
                titulo="Repositórios"
                descricao="Seleção da pasta local de cada repositório do protótipo. É o mesmo controle do rodapé da sidebar (“Pasta local”), que continua funcionando igual."
              >
                <PastaLocalPanel />
              </SectionCard>
            )}
            {ativa === "api" && <ConfiguracaoApiSection />}
            {ativa === "modelos" && <IaPlataformaSection />}
            {ativa === "conta" && <ContaDemoSection />}
          </div>
        </div>
      </div>
    </Page>
  );
}
