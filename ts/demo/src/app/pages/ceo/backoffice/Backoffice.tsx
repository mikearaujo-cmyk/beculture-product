/**
 * Backoffice do PROTÓTIPO.
 *
 * Centraliza os controles da demonstração em áreas com responsabilidades
 * separadas — nenhuma compartilha credencial ou configuração com outra:
 *   - Repositórios: seleção de pasta local por repositório (já existente)
 *   - Modelos BeCulture: catálogo DEMONSTRATIVO que alimenta o seletor do
 *     Navbar do B2C, e a cota de tokens por plano
 * As chaves que executam IA no protótipo são as do próprio usuário, em
 * Configurações → IA & API.
 *   - Conta em demonstração: migração de cenário da conta logada
 *
 * Acesso: no protótipo, qualquer conta. Na versão comercial é área interna da
 * BeCulture (o ponto de restrição é o `BackofficeGuard` da API).
 */

import {
  CircleStackIcon,
  FolderIcon,
  Squares2X2Icon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { useSearchParams } from "react-router";

import { Page } from "@/components/shared/Page";
import { PageTitle } from "@/components/shared/PageTitle";

import { NavegacaoSecoes, type GrupoNavegacao } from "../NavegacaoSecoes";
import { SectionCard } from "../configuracoes-ui";
import { PastaLocalPanel } from "../PastaLocalPanel";
import { ContaDemoSection } from "./ContaDemoSection";
import { IaPlataformaSection } from "./IaPlataformaSection";

type SecaoBackoffice = "repositorios" | "modelos" | "conta";

const GRUPOS: readonly GrupoNavegacao[] = [
  {
    id: "prototipo",
    titulo: "Infraestrutura do protótipo",
    itens: [
      { id: "repositorios", titulo: "Repositórios", icon: FolderIcon },
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

const SECOES: SecaoBackoffice[] = ["repositorios", "modelos", "conta"];
/** Links antigos: `?secao=ia` (catálogo) e `?secao=api` (área removida). */
const ALIASES: Record<string, SecaoBackoffice> = { ia: "modelos", api: "modelos" };

export default function Backoffice() {
  const [params, setParams] = useSearchParams();
  const bruta = params.get("secao") ?? "";
  const pedida = (ALIASES[bruta] ?? bruta) as SecaoBackoffice;
  const ativa: SecaoBackoffice = SECOES.includes(pedida) ? pedida : "modelos";

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
                    <strong>Modelos BeCulture</strong> é o catálogo que aparece
                    no seletor do Navbar das contas B2C, e onde se define a cota
                    de tokens de cada plano. As chaves de lá são exemplos e não
                    executam chamadas: no protótipo, quem responde é a chave que
                    o usuário cadastra em Configurações → IA &amp; API.
                  </p>
                  <p>
                    <strong>Conta em demonstração</strong> troca o plano da
                    conta logada (Essencial ↔ Pro), para simular um upgrade.
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
            {ativa === "modelos" && <IaPlataformaSection />}
            {ativa === "conta" && <ContaDemoSection />}
          </div>
        </div>
      </div>
    </Page>
  );
}
