-- Uma concessão ATIVA por nota + destinatário. Sem isto, duas requisições
-- simultâneas criariam duas concessões, e revogar uma deixaria a outra valendo.
CREATE UNIQUE INDEX IF NOT EXISTS "compartilhamentos_ativo_unico"
  ON "compartilhamentos" ("vaultNotaId", "destinatarioTipo", coalesce("destinatarioId", ''))
  WHERE "status" = 'ativo';
