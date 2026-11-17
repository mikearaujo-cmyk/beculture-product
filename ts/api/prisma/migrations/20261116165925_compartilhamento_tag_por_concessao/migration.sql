-- DropIndex
DROP INDEX "colecoes_compartilhadas_empresaId_repositorioId_chave_key";

-- CreateIndex
CREATE INDEX "colecoes_compartilhadas_empresaId_repositorioId_chave_idx" ON "colecoes_compartilhadas"("empresaId", "repositorioId", "chave");
