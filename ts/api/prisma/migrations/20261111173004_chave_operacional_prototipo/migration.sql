-- AlterTable
ALTER TABLE "ai_usage" ADD COLUMN     "execucao" TEXT;

-- AlterTable
ALTER TABLE "plataforma_credenciais" ADD COLUMN     "nomeProvedor" TEXT;

-- CreateTable
CREATE TABLE "prototipo_credenciais" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "keyLast4" TEXT NOT NULL,
    "status" "AiConnectionStatus" NOT NULL DEFAULT 'ativa',
    "validatedAt" TIMESTAMP(3),
    "modeloPadrao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prototipo_credenciais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prototipo_credenciais_provider_key" ON "prototipo_credenciais"("provider");
