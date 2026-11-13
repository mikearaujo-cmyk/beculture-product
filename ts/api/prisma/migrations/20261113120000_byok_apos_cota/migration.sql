-- Autorização explícita do B2C para usar chaves próprias após a cota BeCulture.
ALTER TABLE "usuarios" ADD COLUMN "byokAposCotaEm" TIMESTAMP(3);
