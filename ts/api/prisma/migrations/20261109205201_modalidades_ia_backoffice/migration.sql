-- CreateEnum
CREATE TYPE "ModalidadeComercial" AS ENUM ('b2c', 'b2b');

-- CreateEnum
CREATE TYPE "ModalidadeIa" AS ENUM ('beculture', 'byok', 'organizacao');

-- CreateEnum
CREATE TYPE "PlanoIaB2c" AS ENUM ('essencial', 'pro');

-- CreateEnum
CREATE TYPE "OrigemCredencial" AS ENUM ('plataforma', 'usuario', 'organizacao');

-- AlterTable
ALTER TABLE "ai_credentials" ADD COLUMN     "ativa" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ai_usage" ADD COLUMN     "execucaoId" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "origem" "OrigemCredencial",
ADD COLUMN     "planoIa" "PlanoIaB2c",
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "solicitadoComo" TEXT;

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "modalidadeComercial" "ModalidadeComercial",
ADD COLUMN     "modalidadeIa" "ModalidadeIa",
ADD COLUMN     "onboardingEtapas" JSONB,
ADD COLUMN     "planoIa" "PlanoIaB2c";

-- CreateTable
CREATE TABLE "plataforma_credenciais" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "nome" TEXT,
    "apiKeyEncrypted" TEXT NOT NULL,
    "keyLast4" TEXT NOT NULL,
    "status" "AiConnectionStatus" NOT NULL DEFAULT 'ativa',
    "validatedAt" TIMESTAMP(3),
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plataforma_credenciais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plataforma_modelos" (
    "id" TEXT NOT NULL,
    "credencialId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "rotulo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plataforma_modelos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plataforma_modelo_planos" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "plano" "PlanoIaB2c" NOT NULL,
    "limiteTokensCiclo" INTEGER,

    CONSTRAINT "plataforma_modelo_planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plataforma_planos_ia" (
    "plano" "PlanoIaB2c" NOT NULL,
    "franquiaGlobalTokens" INTEGER,
    "observacao" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plataforma_planos_ia_pkey" PRIMARY KEY ("plano")
);

-- CreateIndex
CREATE UNIQUE INDEX "plataforma_modelos_credencialId_kind_model_key" ON "plataforma_modelos"("credencialId", "kind", "model");

-- CreateIndex
CREATE UNIQUE INDEX "plataforma_modelo_planos_modeloId_plano_key" ON "plataforma_modelo_planos"("modeloId", "plano");

-- AddForeignKey
ALTER TABLE "plataforma_modelos" ADD CONSTRAINT "plataforma_modelos_credencialId_fkey" FOREIGN KEY ("credencialId") REFERENCES "plataforma_credenciais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plataforma_modelo_planos" ADD CONSTRAINT "plataforma_modelo_planos_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "plataforma_modelos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
