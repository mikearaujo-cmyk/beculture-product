/**
 * Catálogo de EXEMPLO de "Modelos BeCulture" (Backoffice) — o que os planos
 * B2C com modelos BeCulture (Essencial e Pro) exibem no seletor de modelos e
 * na tela IA & API.
 *
 * As credenciais criadas aqui são DEMONSTRATIVAS: chaves falsas ("exemplo-…"),
 * sem validação, que nunca executam chamadas — no protótipo quem executa é a
 * chave de Backoffice → Configuração de API. O modelo pedido roda de verdade
 * quando a chave operacional é do mesmo provedor e o conhece; senão, roda o
 * modelo padrão operacional.
 *
 * Idempotente: acha a credencial por (provider, nome) e faz upsert dos modelos
 * por (credencial, modalidade, modelo) e dos vínculos por (modelo, plano). Não
 * apaga nada nem mexe em modelos que não estão na lista.
 *
 * Rodar contra o Postgres LOCAL (passe a URL de propósito — sem ela o loader
 * cai no .env.local, que aponta para o banco do DEPLOY):
 *   DATABASE_URL=postgresql://... npm run db:seed:demo:modelos
 */

import { createCipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient, type PlanoIaB2c } from "@prisma/client";

type Kind = "text" | "image" | "video";

interface ModeloExemplo {
  kind: Kind;
  model: string;
  rotulo: string;
  planos: PlanoIaB2c[];
}

interface ProvedorExemplo {
  provider: string;
  /** Nome livre quando o provedor não está no catálogo do sistema. */
  nomeProvedor?: string;
  modelos: ModeloExemplo[];
}

/** Nome da credencial de exemplo (chave de idempotência junto do provider). */
const NOME_CREDENCIAL = "Exemplo BeCulture";

const AMBOS: PlanoIaB2c[] = ["essencial", "pro"];

/**
 * Por ora todo modelo vale para os dois planos (a especificação por plano
 * saiu da tela do Backoffice). A ordem aqui é a ordem de prioridade na
 * modalidade (o primeiro é o principal).
 */
const CATALOGO: ProvedorExemplo[] = [
  {
    provider: "anthropic",
    modelos: [
      { kind: "text", model: "claude-sonnet-5", rotulo: "Claude Sonnet 5", planos: AMBOS },
      { kind: "text", model: "claude-opus-5", rotulo: "Claude Opus 5", planos: AMBOS },
      { kind: "text", model: "claude-haiku-4-5", rotulo: "Claude Haiku 4.5", planos: AMBOS },
    ],
  },
  {
    provider: "openai",
    modelos: [
      { kind: "text", model: "gpt-4.1", rotulo: "GPT-4.1", planos: AMBOS },
      { kind: "text", model: "gpt-4o", rotulo: "GPT-4o", planos: AMBOS },
      { kind: "text", model: "gpt-4o-mini", rotulo: "GPT-4o mini", planos: AMBOS },
      { kind: "image", model: "gpt-image-1", rotulo: "GPT Image 1", planos: AMBOS },
      { kind: "image", model: "dall-e-3", rotulo: "DALL·E 3", planos: AMBOS },
    ],
  },
  {
    provider: "google",
    modelos: [
      // Texto do Google não está no catálogo de execução: fica demonstrativo.
      { kind: "text", model: "gemini-2.5-pro", rotulo: "Gemini 2.5 Pro", planos: AMBOS },
      { kind: "image", model: "imagen-4.0", rotulo: "Imagen 4", planos: AMBOS },
      { kind: "video", model: "veo-3", rotulo: "Veo 3", planos: AMBOS },
    ],
  },
  {
    provider: "black-forest-labs",
    modelos: [
      { kind: "image", model: "flux-1.1-pro", rotulo: "FLUX 1.1 Pro", planos: AMBOS },
    ],
  },
  {
    provider: "runway",
    modelos: [
      { kind: "video", model: "gen-4-turbo", rotulo: "Runway Gen-4 Turbo", planos: AMBOS },
    ],
  },
  {
    provider: "heygen",
    modelos: [
      { kind: "video", model: "avatar-iv", rotulo: "HeyGen Avatar IV", planos: AMBOS },
    ],
  },
];

// ---------- ambiente (mesma precedência dos outros seeds) ----------

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

const urlDoChamador = process.env.DATABASE_URL;
const chaveDoChamador = process.env.ENCRYPTION_KEY;
carregarEnvArquivo(".env");
carregarEnvArquivo(".env.local", true);
if (urlDoChamador) {
  process.env.DATABASE_URL = urlDoChamador;
  process.env.DATABASE_URL_UNPOOLED = urlDoChamador;
}
if (chaveDoChamador) process.env.ENCRYPTION_KEY = chaveDoChamador;

/** Mesmo formato do CryptoService: base64(iv).base64(tag).base64(dados). */
function cifrar(texto: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY ausente ou inválida (32 bytes em base64).");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const dados = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${dados.toString("base64")}`;
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const host =
    process.env.DATABASE_URL?.match(/@([^/]+)\//)?.[1] ?? "(desconhecido)";
  console.log(`Banco: ${host}`);

  const ordemPorKind: Record<Kind, number> = { text: 0, image: 0, video: 0 };
  let novosModelos = 0;

  for (const p of CATALOGO) {
    let cred = await prisma.plataformaCredencial.findFirst({
      where: { provider: p.provider, nome: NOME_CREDENCIAL },
    });
    if (!cred) {
      const chave = `exemplo-${p.provider}-demonstrativa`;
      cred = await prisma.plataformaCredencial.create({
        data: {
          provider: p.provider,
          nomeProvedor: p.nomeProvedor ?? null,
          nome: NOME_CREDENCIAL,
          apiKeyEncrypted: cifrar(chave),
          keyLast4: chave.slice(-4),
          status: "ativa",
          validatedAt: null,
          ativa: true,
        },
      });
      console.log(`+ credencial ${p.provider}`);
    }

    for (const m of p.modelos) {
      const existente = await prisma.plataformaModelo.findUnique({
        where: {
          credencialId_kind_model: {
            credencialId: cred.id,
            kind: m.kind,
            model: m.model,
          },
        },
      });
      const modelo =
        existente ??
        (await prisma.plataformaModelo.create({
          data: {
            credencialId: cred.id,
            kind: m.kind,
            provider: p.provider,
            model: m.model,
            rotulo: m.rotulo,
            ativo: true,
            ordem: ordemPorKind[m.kind],
          },
        }));
      if (!existente) novosModelos++;
      ordemPorKind[m.kind]++;

      for (const plano of m.planos) {
        await prisma.plataformaModeloPlano.upsert({
          where: { modeloId_plano: { modeloId: modelo.id, plano } },
          update: {},
          create: { modeloId: modelo.id, plano },
        });
      }
    }
  }

  console.log(`Modelos de exemplo: ${novosModelos} novo(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
