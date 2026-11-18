/**
 * Liga o Google Drive de DEMONSTRAÇÃO na conta "Time BeCulture"
 * (demo@beculture.ai): grava a conexão `google-drive` com `origem = 'demo'`,
 * e o `DriveApiService` passa a responder com os arquivos fictícios de
 * `src/conectores/drive-demo.ts` em vez de chamar o Google.
 *
 * Idempotente e conservador:
 * - nunca cria empresa — sem a conta demo, avisa e sai;
 * - se a conexão já tem token OAuth (alguém autorizou um Drive de verdade),
 *   não mexe: o Drive real tem precedência;
 * - uma conexão "app" sem token (o estado que deixava a tela /drive em erro)
 *   vira "demo".
 *
 * Para voltar ao Drive real basta autorizar em Conectores: o callback OAuth
 * regrava a origem como "oauth".
 *
 * Rodar:
 *   npm run db:seed:demo:drive
 *   # o loader abaixo aponta para o Neon quando existir .env.local
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { DRIVE_DEMO_CONTA } from "../src/conectores/drive-demo";

/** Mesma duplicação consciente de `seed-demo-membros.ts`. */
const DEMO_EMAIL = "demo@beculture.ai";
const CONNECTOR_ID = "google-drive";

function carregarEnvArquivo(nome: string, sobrescrever = false): void {
  const caminho = resolve(__dirname, "..", nome);
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
    const t = linha.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const chave = t.slice(0, i).trim();
    let valor = t.slice(i + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (sobrescrever || process.env[chave] == null || process.env[chave] === "") {
      process.env[chave] = valor;
    }
  }
}

// Mesma precedência dos outros seeds demo: .env, .env.local (Neon) por cima,
// e um DATABASE_URL exportado por quem chamou ganha de ambos.
const urlDoChamador = process.env.DATABASE_URL;
carregarEnvArquivo(".env");
carregarEnvArquivo(".env.local", true);
if (urlDoChamador) {
  process.env.DATABASE_URL = urlDoChamador;
  process.env.DATABASE_URL_UNPOOLED = urlDoChamador;
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const host =
    process.env.DATABASE_URL?.match(/@([^/]+)\//)?.[1] ?? "(desconhecido)";
  console.log(`Banco: ${host}`);

  const owner = await prisma.usuario.findUnique({
    where: { email: DEMO_EMAIL },
    select: { empresaId: true },
  });
  if (!owner) {
    console.log(
      `Conta demo (${DEMO_EMAIL}) não existe — rode "npm run db:seed:demo" primeiro. Nada a fazer.`,
    );
    return;
  }

  const where = {
    empresaId_connectorId: {
      empresaId: owner.empresaId,
      connectorId: CONNECTOR_ID,
    },
  };
  const atual = await prisma.empresaConector.findUnique({ where });

  if (atual?.accessTokenEncrypted) {
    console.log(
      "Google Drive já autorizado com uma conta real — Drive demo não aplicado.",
    );
    return;
  }

  await prisma.empresaConector.upsert({
    where,
    create: {
      empresaId: owner.empresaId,
      connectorId: CONNECTOR_ID,
      origem: "demo",
      teamName: DRIVE_DEMO_CONTA,
    },
    update: { origem: "demo", teamName: DRIVE_DEMO_CONTA },
  });
  console.log(`Google Drive demo ligado (${DRIVE_DEMO_CONTA}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
