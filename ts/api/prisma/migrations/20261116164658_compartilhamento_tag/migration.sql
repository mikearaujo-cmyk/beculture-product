-- AlterEnum
ALTER TYPE "CompartilhamentoRecurso" ADD VALUE 'tag';

-- AlterTable
ALTER TABLE "compartilhamentos" ADD COLUMN     "colecaoId" TEXT;

-- CreateTable
CREATE TABLE "colecoes_compartilhadas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "donoUsuarioId" TEXT NOT NULL,
    "repositorioId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "sincronizada" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colecoes_compartilhadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colecao_notas" (
    "colecaoId" TEXT NOT NULL,
    "vaultNotaId" TEXT NOT NULL,

    CONSTRAINT "colecao_notas_pkey" PRIMARY KEY ("colecaoId","vaultNotaId")
);

-- CreateIndex
CREATE INDEX "colecoes_compartilhadas_empresaId_donoUsuarioId_idx" ON "colecoes_compartilhadas"("empresaId", "donoUsuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "colecoes_compartilhadas_empresaId_repositorioId_chave_key" ON "colecoes_compartilhadas"("empresaId", "repositorioId", "chave");

-- CreateIndex
CREATE INDEX "colecao_notas_vaultNotaId_idx" ON "colecao_notas"("vaultNotaId");

-- CreateIndex
CREATE INDEX "compartilhamentos_empresaId_colecaoId_idx" ON "compartilhamentos"("empresaId", "colecaoId");

-- AddForeignKey
ALTER TABLE "compartilhamentos" ADD CONSTRAINT "compartilhamentos_colecaoId_fkey" FOREIGN KEY ("colecaoId") REFERENCES "colecoes_compartilhadas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colecoes_compartilhadas" ADD CONSTRAINT "colecoes_compartilhadas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colecao_notas" ADD CONSTRAINT "colecao_notas_colecaoId_fkey" FOREIGN KEY ("colecaoId") REFERENCES "colecoes_compartilhadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colecao_notas" ADD CONSTRAINT "colecao_notas_vaultNotaId_fkey" FOREIGN KEY ("vaultNotaId") REFERENCES "vault_notas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Uma concessão ATIVA por coleção + destinatário (mesma regra das notas).
CREATE UNIQUE INDEX IF NOT EXISTS "compartilhamentos_colecao_ativo_unico"
  ON "compartilhamentos" ("colecaoId", "destinatarioTipo", coalesce("destinatarioId", ''))
  WHERE "status" = 'ativo' AND "colecaoId" IS NOT NULL;
