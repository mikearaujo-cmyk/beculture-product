/**
 * Intenção de uso + configuração da organização.
 *
 * Fluxo próprio (não é “etapa 2” da criação de conta). Usada no cadastro após
 * a confirmação de e-mail e também em `?novo=1` (menu de perfil).
 * Nos dois casos entra direto no produto com a organização recém-criada
 * já ativa — o menu de perfil troca de contexto, sem seletor intermediário.
 */

import { yupResolver } from "@hookform/resolvers/yup";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Navigate, useNavigate, useSearchParams } from "react-router";

import { useAuthContext } from "@/app/contexts/auth/context";
import { Button, InputErrorMsg } from "@/components/ui";
import { HOME_PATH } from "@/constants/app";
import {
  descricaoModoLocal,
  garantirSessaoBackend,
} from "@/services/api/contaBackend";

import { MolduraAuth } from "../components/MolduraAuth";
import { OrganizationFields } from "../components/OrganizationFields";
import { TipoUsoSelector } from "../components/TipoUsoSelector";
import { usePrototipoContas, useUsuario } from "../model/context";
import { lerPlanoEscolhido, MODALIDADES } from "../model/planoEscolhido";
import type { ModalidadeIa } from "@/services/api/modalidade";

/** Plano já escolhido na etapa anterior, com atalho para trocar. */
function PlanoResumo({
  modalidade,
  onTrocar,
}: {
  modalidade: ModalidadeIa;
  onTrocar: () => void;
}) {
  const m = MODALIDADES.find((x) => x.id === modalidade)!;
  return (
    <div className="dark:border-dark-600 dark:bg-dark-800 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="min-w-0">
        <p className="dark:text-dark-300 text-tiny-plus font-semibold tracking-wider text-gray-400 uppercase">
          Plano escolhido · {m.contexto}
        </p>
        <p className="dark:text-dark-100 text-sm font-medium text-gray-800">
          {m.titulo}
        </p>
        <p className="dark:text-dark-300 text-xs text-gray-500">
          {m.contexto === "B2B"
            ? "Informe a organização que vai contratar."
            : "Uso pessoal: sua conta é o próprio espaço de trabalho."}
        </p>
      </div>
      <button
        type="button"
        onClick={onTrocar}
        className="shrink-0 text-xs-plus font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400"
      >
        Trocar plano
      </button>
    </div>
  );
}
import {
  organizacaoSchema,
  type OrganizacaoFormValues,
} from "./organizacao.schema";

export default function ConfigurarOrganizacao() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const novaOrganizacao = searchParams.get("novo") === "1";
  const usuario = useUsuario();
  const { despachar } = usePrototipoContas();
  const { adoptSession } = useAuthContext();
  const [enviando, setEnviando] = useState(false);
  const [erroBackend, setErroBackend] = useState<string | null>(null);
  // No cadastro, o plano escolhido já define o uso: B2C = pessoal, B2B =
  // organização. Pelo menu de perfil (`?novo=1`) continua a escolha livre.
  const plano = novaOrganizacao ? null : lerPlanoEscolhido();
  const tipoDoPlano: OrganizacaoFormValues["tipoUso"] | null = plano
    ? plano.modalidadeIa === "organizacao"
      ? "organization"
      : "personal"
    : null;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<OrganizacaoFormValues>({
    resolver: yupResolver(organizacaoSchema),
    defaultValues: {
      tipoUso:
        tipoDoPlano ?? (novaOrganizacao ? "organization" : "personal"),
      nomeOrganizacao: "",
      emails: [],
    },
  });

  const tipoUso = useWatch({ control, name: "tipoUso" });

  if (!usuario) return <Navigate to="../criar-conta" replace />;
  if (!novaOrganizacao && !plano) return <Navigate to="../plano" replace />;

  const onSubmit = async (valores: OrganizacaoFormValues) => {
    setErroBackend(null);
    setEnviando(true);

    const pessoal = valores.tipoUso === "personal";
    const nome = pessoal
      ? usuario.nome.trim()
      : valores.nomeOrganizacao.trim();

    despachar({
      tipo: "organizacao/configurar",
      payload: {
        nome,
        pagador: {
          tipo: pessoal ? "pf" : "pj",
          documento: "",
          nomeLegal: nome,
        },
        emails: pessoal ? undefined : valores.emails,
      },
    });

    // Pelo perfil a conta já existe: não registrar de novo o mesmo e-mail.
    if (novaOrganizacao) {
      setEnviando(false);
      navigate(HOME_PATH);
      return;
    }

    const sessao = await garantirSessaoBackend({
      nome: usuario.nome,
      email: usuario.email,
      senha: usuario.senha,
      organizacaoNome: nome,
      modalidadeIa: plano?.modalidadeIa,
      planoIa: plano?.planoIa,
    });
    setEnviando(false);

    if (sessao.tipo === "conflito") {
      setErroBackend(sessao.mensagem);
      return;
    }

    if (sessao.tipo !== "ok") {
      setErroBackend(descricaoModoLocal(sessao.motivo));
      return;
    }

    adoptSession(sessao.authToken, sessao.user);
    // Onboarding específico da modalidade (BeCulture, BYOK ou B2B).
    navigate("../onboarding-ia");
  };

  return (
    <MolduraAuth
      tituloPagina={
        novaOrganizacao ? "Nova organização" : "Configurar organização"
      }
      kicker={novaOrganizacao ? "Nova organização" : "Sua organização"}
      titulo="Como você quer usar a beculture?"
      subtitulo="Isso ajuda a personalizar sua experiência"
    >
      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off">
        {tipoDoPlano ? (
          <PlanoResumo
            modalidade={plano!.modalidadeIa}
            onTrocar={() => navigate("../plano")}
          />
        ) : (
        <Controller
          name="tipoUso"
          control={control}
          render={({ field }) => (
            <TipoUsoSelector
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        )}
        {errors.tipoUso?.message && (
          <p className="mt-2 text-xs text-error dark:text-error-lighter">
            {errors.tipoUso.message}
          </p>
        )}

        {tipoUso === "organization" && (
          <div className="mt-5 space-y-4">
            <OrganizationFields
              registration={register("nomeOrganizacao")}
              error={errors?.nomeOrganizacao?.message}
            />
          </div>
        )}

        <div className="mt-2">
          <InputErrorMsg when={!!erroBackend}>{erroBackend}</InputErrorMsg>
        </div>

        <Button
          type="submit"
          className="mt-6 w-full"
          color="primary"
          disabled={enviando}
        >
          {enviando
            ? "Criando…"
            : tipoUso === "personal"
              ? "Continuar"
              : "Criar organização"}
        </Button>
      </form>
    </MolduraAuth>
  );
}
