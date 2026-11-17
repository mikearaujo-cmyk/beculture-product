-- CreateEnum
CREATE TYPE "CompartilhamentoRecurso" AS ENUM ('nota_vault', 'contexto');

-- CreateEnum
CREATE TYPE "CompartilhamentoDestinatario" AS ENUM ('membro', 'equipe', 'area', 'empresa', 'contexto');

-- CreateEnum
CREATE TYPE "CompartilhamentoAbrangencia" AS ENUM ('fixa', 'dinamica');

-- CreateEnum
CREATE TYPE "CompartilhamentoStatus" AS ENUM ('ativo', 'revogado', 'origem_removida');

-- AlterTable
ALTER TABLE "insights" ADD COLUMN     "repositorioId" TEXT,
ADD COLUMN     "usuarioId" TEXT;

-- AlterTable
ALTER TABLE "repositorio_org_documentos" ADD COLUMN     "editadoEm" TIMESTAMP(3),
ADD COLUMN     "editadoPorId" TEXT,
ADD COLUMN     "origemDonoId" TEXT,
ADD COLUMN     "origemDonoNome" TEXT,
ADD COLUMN     "origemTipo" TEXT NOT NULL DEFAULT 'upload',
ADD COLUMN     "origemVaultNotaId" TEXT;

-- CreateTable
CREATE TABLE "vault_repositorios" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "repositorioId" TEXT NOT NULL,
    "donoUsuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_repositorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compartilhamentos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "recursoTipo" "CompartilhamentoRecurso" NOT NULL DEFAULT 'nota_vault',
    "vaultNotaId" TEXT,
    "recursoTitulo" TEXT NOT NULL,
    "donoUsuarioId" TEXT NOT NULL,
    "concedidoPorUsuarioId" TEXT NOT NULL,
    "destinatarioTipo" "CompartilhamentoDestinatario" NOT NULL,
    "destinatarioId" TEXT,
    "abrangencia" "CompartilhamentoAbrangencia" NOT NULL DEFAULT 'fixa',
    "podeVisualizar" BOOLEAN NOT NULL DEFAULT true,
    "podeUsarIa" BOOLEAN NOT NULL DEFAULT false,
    "podeAdministrar" BOOLEAN NOT NULL DEFAULT false,
    "expiraEm" TIMESTAMP(3),
    "status" "CompartilhamentoStatus" NOT NULL DEFAULT 'ativo',
    "revogadoEm" TIMESTAMP(3),
    "revogadoPorUsuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compartilhamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compartilhamento_membros" (
    "compartilhamentoId" TEXT NOT NULL,
    "membroId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "compartilhamento_membros_pkey" PRIMARY KEY ("compartilhamentoId","membroId")
);

-- CreateTable
CREATE TABLE "politicas_compartilhamento" (
    "empresaId" TEXT NOT NULL,
    "permitirMembro" BOOLEAN NOT NULL DEFAULT true,
    "permitirEquipe" BOOLEAN NOT NULL DEFAULT true,
    "permitirArea" BOOLEAN NOT NULL DEFAULT true,
    "permitirEmpresa" BOOLEAN NOT NULL DEFAULT true,
    "permitirUsoIa" BOOLEAN NOT NULL DEFAULT true,
    "permitirPublicacaoOrg" BOOLEAN NOT NULL DEFAULT true,
    "expiracaoMaximaDias" INTEGER,
    "retencaoAuditoriaDias" INTEGER,
    "atualizadoPorId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "politicas_compartilhamento_pkey" PRIMARY KEY ("empresaId")
);

-- CreateTable
CREATE TABLE "auditoria_eventos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "atorUsuarioId" TEXT,
    "atorNome" TEXT,
    "acao" TEXT NOT NULL,
    "recursoTipo" TEXT,
    "recursoId" TEXT,
    "recursoTitulo" TEXT,
    "donoUsuarioId" TEXT,
    "alvoTipo" TEXT,
    "alvoId" TEXT,
    "metadados" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vault_repositorios_empresaId_donoUsuarioId_idx" ON "vault_repositorios"("empresaId", "donoUsuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "vault_repositorios_empresaId_repositorioId_key" ON "vault_repositorios"("empresaId", "repositorioId");

-- CreateIndex
CREATE INDEX "compartilhamentos_empresaId_vaultNotaId_idx" ON "compartilhamentos"("empresaId", "vaultNotaId");

-- CreateIndex
CREATE INDEX "compartilhamentos_empresaId_donoUsuarioId_idx" ON "compartilhamentos"("empresaId", "donoUsuarioId");

-- CreateIndex
CREATE INDEX "compartilhamentos_empresaId_destinatarioTipo_destinatarioId_idx" ON "compartilhamentos"("empresaId", "destinatarioTipo", "destinatarioId");

-- CreateIndex
CREATE INDEX "compartilhamento_membros_usuarioId_idx" ON "compartilhamento_membros"("usuarioId");

-- CreateIndex
CREATE INDEX "auditoria_eventos_empresaId_criadoEm_idx" ON "auditoria_eventos"("empresaId", "criadoEm");

-- CreateIndex
CREATE INDEX "auditoria_eventos_empresaId_recursoTipo_recursoId_idx" ON "auditoria_eventos"("empresaId", "recursoTipo", "recursoId");

-- CreateIndex
CREATE INDEX "auditoria_eventos_empresaId_donoUsuarioId_criadoEm_idx" ON "auditoria_eventos"("empresaId", "donoUsuarioId", "criadoEm");

-- AddForeignKey
ALTER TABLE "vault_repositorios" ADD CONSTRAINT "vault_repositorios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compartilhamentos" ADD CONSTRAINT "compartilhamentos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compartilhamentos" ADD CONSTRAINT "compartilhamentos_vaultNotaId_fkey" FOREIGN KEY ("vaultNotaId") REFERENCES "vault_notas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compartilhamento_membros" ADD CONSTRAINT "compartilhamento_membros_compartilhamentoId_fkey" FOREIGN KEY ("compartilhamentoId") REFERENCES "compartilhamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "politicas_compartilhamento" ADD CONSTRAINT "politicas_compartilhamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_eventos" ADD CONSTRAINT "auditoria_eventos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Dados (aditivo, idempotente). Nada é apagado nem sobrescrito.
-- ---------------------------------------------------------------------------

-- Dono dos repositórios pessoais: herdado das conversas, que já gravam
-- (usuarioId, repositorioId). Só quando o repositório tem UM único usuário —
-- ambíguo fica sem dono e é reivindicado no primeiro uso.
INSERT INTO "vault_repositorios" ("id", "empresaId", "repositorioId", "donoUsuarioId")
SELECT 'vr_' || md5(c."empresaId" || ':' || c."repositorioId"),
       c."empresaId", c."repositorioId", MIN(c."usuarioId")
FROM "conversas" c
WHERE c."repositorioId" IS NOT NULL AND c."repositorioId" <> ''
GROUP BY c."empresaId", c."repositorioId"
HAVING COUNT(DISTINCT c."usuarioId") = 1
ON CONFLICT ("empresaId", "repositorioId") DO NOTHING;

-- Novas permissões do Repositório da organização, sem mudar o comportamento
-- de hoje: quem já visualiza documentos continua podendo usá-los na IA; quem
-- já exclui documentos (perfil administrativo) passa a poder editá-los.
UPDATE "roles"
SET "permissoes" = array_append("permissoes", 'documentos.usar_ia')
WHERE 'documentos.visualizar' = ANY("permissoes")
  AND NOT ('documentos.usar_ia' = ANY("permissoes"));

UPDATE "roles"
SET "permissoes" = array_append("permissoes", 'documentos.editar')
WHERE 'documentos.excluir' = ANY("permissoes")
  AND NOT ('documentos.editar' = ANY("permissoes"));

-- Governança: as roles que já gerenciam acesso passam a poder administrar as
-- políticas de compartilhamento e consultar a auditoria (Owner/Admin já têm
-- tudo pelo bypass do guard).
UPDATE "roles"
SET "permissoes" = array_append("permissoes", 'compartilhamento.politicas')
WHERE 'acesso.gerenciar' = ANY("permissoes")
  AND NOT ('compartilhamento.politicas' = ANY("permissoes"));

UPDATE "roles"
SET "permissoes" = array_append("permissoes", 'auditoria.consultar')
WHERE 'acesso.gerenciar' = ANY("permissoes")
  AND NOT ('auditoria.consultar' = ANY("permissoes"));
