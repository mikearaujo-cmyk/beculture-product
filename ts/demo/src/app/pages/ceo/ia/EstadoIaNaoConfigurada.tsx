/**
 * Estados de IA sem configuração — um por situação, cada um respondendo:
 *   1. o que está acontecendo
 *   2. o que precisa ser configurado
 *   3. a ação disponível (sempre há uma saída)
 *   4. o que acontece depois
 *
 * Regra importante: no B2C com modelos BeCulture o usuário NUNCA é orientado a
 * cadastrar chave própria — a ausência de modelos depende da administração da
 * plataforma (representada pelo Backoffice do protótipo).
 */

import {
  ExclamationTriangleIcon,
  KeyIcon,
  NoSymbolIcon,
  ServerStackIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import type { ElementType, ReactNode } from "react";

import type {
  ModalidadeEfetiva,
  ProntidaoIa,
} from "@/services/api/modalidade";

interface Conteudo {
  Icon: ElementType;
  tom: "warning" | "info" | "error";
  titulo: string;
  acontecendo: string;
  configurar: string;
  depois: string;
}

function conteudoDoEstado(
  prontidao: ProntidaoIa,
  modalidade: ModalidadeEfetiva,
  podeAdministrar: boolean,
): Conteudo | null {
  const org = modalidade === "organizacao";
  const dono = org ? "a organização" : "você";
  switch (prontidao) {
    case "pronta":
      return null;
    case "sem_modelos_plataforma":
      return {
        Icon: ServerStackIcon,
        tom: "info",
        titulo: "Os modelos BeCulture ainda não estão disponíveis no seu plano",
        acontecendo:
          "Seu plano inclui IA gerenciada pela BeCulture, mas a plataforma ainda não disponibilizou nenhum modelo para ele.",
        configurar:
          "Nada do seu lado. A BeCulture precisa cadastrar um provedor, uma credencial e liberar ao menos um modelo para o seu plano.",
        depois:
          "Assim que um modelo for liberado, ele aparece aqui e os recursos de IA passam a funcionar automaticamente, sem nenhuma chave sua.",
      };
    case "sem_chave":
      return {
        Icon: KeyIcon,
        tom: "warning",
        titulo: org
          ? "A organização ainda não conectou um provedor de IA"
          : "Conecte seu primeiro provedor de IA",
        acontecendo: org
          ? "No licenciamento B2B a IA usa exclusivamente as chaves da organização. Nenhuma chave foi cadastrada ainda."
          : "A IA usa as suas próprias chaves. Nenhuma chave foi cadastrada ainda.",
        configurar:
          "Uma chave de API de um provedor compatível (ex.: Anthropic ou OpenAI) e ao menos um modelo habilitado.",
        depois: `Com a chave validada e um modelo habilitado, os recursos de IA ficam disponíveis${org ? " para os membros" : ""}. O uso é cobrado pelo provedor diretamente ${org ? "à organização" : "a você"}.`,
      };
    case "chave_invalida":
      return {
        Icon: ExclamationTriangleIcon,
        tom: "error",
        titulo: "O provedor recusou a chave cadastrada",
        acontecendo:
          "A última verificação ou chamada foi rejeitada pelo provedor (chave revogada, expirada ou sem permissão). A IA está indisponível.",
        configurar: `Substituir a chave por uma válida ou revalidá-la, se o problema já foi resolvido no provedor.`,
        depois:
          "Com uma chave aceita, os modelos dela voltam às filas automaticamente.",
      };
    case "chaves_desativadas":
      return {
        Icon: NoSymbolIcon,
        tom: "warning",
        titulo: "Todas as chaves estão desativadas",
        acontecendo: `As chaves continuam guardadas, mas ${dono} desativou todas — nenhuma é usada nas chamadas.`,
        configurar: "Reativar uma chave ou cadastrar outra.",
        depois: "Os modelos da chave reativada voltam a atender imediatamente.",
      };
    case "sem_modelos_habilitados":
      return {
        Icon: Squares2X2Icon,
        tom: "warning",
        titulo: "Provedor conectado, mas nenhum modelo habilitado",
        acontecendo:
          "Há chave válida, porém nenhum modelo foi adicionado às filas de Texto, Imagem ou Vídeo.",
        configurar: `Escolher ao menos um modelo${org ? " para os membros" : ""} em "Modelos e Prioridades".`,
        depois:
          "O primeiro modelo da fila passa a ser o principal; os seguintes assumem se ele falhar.",
      };
  }
  // Sem permissão administrativa, o texto continua o mesmo — muda só a ação.
  void podeAdministrar;
  return null;
}

const TONS = {
  warning: "border-warning/30 bg-warning/5 text-warning",
  info: "border-info/30 bg-info/5 text-info",
  error: "border-error/30 bg-error/5 text-error",
} as const;

export function EstadoIaNaoConfigurada({
  prontidao,
  modalidade,
  podeAdministrar = true,
  acao,
  compacto = false,
  className,
}: {
  prontidao: ProntidaoIa;
  modalidade: ModalidadeEfetiva;
  podeAdministrar?: boolean;
  /** Botão/link que resolve a situação. Sem ele, o texto explica quem resolve. */
  acao?: ReactNode;
  compacto?: boolean;
  className?: string;
}) {
  const c = conteudoDoEstado(prontidao, modalidade, podeAdministrar);
  if (!c) return null;
  const semPermissao =
    !podeAdministrar &&
    prontidao !== "sem_modelos_plataforma" &&
    modalidade === "organizacao";

  return (
    <div
      role="status"
      className={clsx("rounded-xl border p-4", TONS[c.tom], className)}
    >
      <div className="flex items-start gap-3">
        <c.Icon className="mt-0.5 size-5 shrink-0" strokeWidth="1.7" />
        <div className="min-w-0 flex-1">
          <p className="dark:text-dark-50 text-sm font-semibold text-gray-800">
            {c.titulo}
          </p>
          <dl
            className={clsx(
              "dark:text-dark-200 mt-2 grid gap-2 text-xs text-gray-600",
              !compacto && "sm:grid-cols-3",
            )}
          >
            <div>
              <dt className="dark:text-dark-300 font-medium text-gray-400">
                O que está acontecendo
              </dt>
              <dd>{c.acontecendo}</dd>
            </div>
            <div>
              <dt className="dark:text-dark-300 font-medium text-gray-400">
                O que configurar
              </dt>
              <dd>
                {c.configurar}
                {semPermissao &&
                  " Somente administradores da organização podem fazer isso."}
              </dd>
            </div>
            <div>
              <dt className="dark:text-dark-300 font-medium text-gray-400">
                Depois da configuração
              </dt>
              <dd>{c.depois}</dd>
            </div>
          </dl>
          {acao && !semPermissao && <div className="mt-3">{acao}</div>}
        </div>
      </div>
    </div>
  );
}
