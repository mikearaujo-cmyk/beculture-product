import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

/** Capacidade pedida sobre um conteúdo compartilhado. */
export type Capacidade = 'visualizar' | 'usar_ia' | 'administrar';

/** Uma concessão que vale AGORA para o usuário. */
export interface ConcessaoValida {
  compartilhamentoId: string;
  vaultNotaId: string;
  donoUsuarioId: string;
  podeVisualizar: boolean;
  /** Já considera a política `permitirUsoIa` da empresa. */
  podeUsarIa: boolean;
  podeAdministrar: boolean;
  expiraEm: Date | null;
  concedidoPorUsuarioId: string;
  /** Rótulo da tag quando a nota chegou por uma coleção compartilhada. */
  viaTag: string | null;
}

/** Capacidades efetivas de um usuário sobre UMA nota (união das concessões). */
export interface AcessoNota {
  vaultNotaId: string;
  donoUsuarioId: string;
  visualizar: boolean;
  usarIa: boolean;
  administrar: boolean;
  /** Expiração mais distante entre as concessões (null = alguma sem prazo). */
  expiraEm: Date | null;
  compartilhamentoIds: string[];
  /** Expiração mais distante entre as concessões com `podeAdministrar`. */
  expiraAdminEm: Date | null;
  /** Tags (coleções) pelas quais a nota foi compartilhada. */
  viaTags: string[];
}

/**
 * ÚNICA fonte de verdade sobre "este usuário pode ver/usar este conteúdo
 * pessoal de outra pessoa?". Toda leitura de conteúdo alheio — tela, busca,
 * RAG da IA, administração de compartilhamento — passa por aqui.
 *
 * Regras (todas no SQL, avaliadas a cada chamada, sem cache — revogação,
 * expiração, mudança de equipe/área e desligamento valem na requisição
 * seguinte):
 *   • concessão `ativo`, não expirada, da MESMA empresa;
 *   • a nota ainda existe e continua no repositório do dono (`VaultRepositorio`);
 *   • o dono não está inativo (desligado ⇒ o que ele compartilhou fica suspenso);
 *   • quem pede não está inativo nem com convite pendente;
 *   • quem pede é destinatário: membro nomeado; ou, em grupo `fixa`, estava no
 *     grupo na concessão; ou, em grupo `dinamica`, está no grupo agora
 *     (convidados nunca entram por grupo);
 *   • a política da empresa ainda permite aquele tipo de destinatário;
 *   • a capacidade foi concedida (usar na IA também exige a política).
 *
 * O que NUNCA entra: hierarquia (gestor não herda acesso a liderado), cargo,
 * papel na plataforma (Owner/Admin não têm bypass aqui).
 */
@Injectable()
export class AcessoConteudoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Concessões válidas agora para `usuarioId`. `notaIds` restringe a notas
   * específicas (verificação pontual); sem ele, todas.
   */
  async concessoesValidas(
    empresaId: string,
    usuarioId: string,
    notaIds?: string[],
  ): Promise<ConcessaoValida[]> {
    if (notaIds && notaIds.length === 0) return [];
    const filtroNotas = notaIds
      ? Prisma.sql`AND alvo.nota_id = ANY(${notaIds}::text[])`
      : Prisma.empty;
    return this.prisma.$queryRaw<ConcessaoValida[]>`
      WITH eu AS (
        SELECT m."id", m."areaId", m."gestorId", m."tipo"::text AS tipo,
               m."status"::text AS status
        FROM "membros" m
        WHERE m."empresaId" = ${empresaId} AND m."usuarioId" = ${usuarioId}
      ),
      pol AS (
        SELECT coalesce(p."permitirMembro", true)  AS membro,
               coalesce(p."permitirEquipe", true)  AS equipe,
               coalesce(p."permitirArea", true)    AS area,
               coalesce(p."permitirEmpresa", true) AS empresa,
               coalesce(p."permitirUsoIa", true)   AS uso_ia,
               p."expiracaoMaximaDias"             AS max_dias
        FROM (SELECT 1) x
        LEFT JOIN "politicas_compartilhamento" p ON p."empresaId" = ${empresaId}
      )
      SELECT c."id"              AS "compartilhamentoId",
             alvo.nota_id        AS "vaultNotaId",
             c."donoUsuarioId"   AS "donoUsuarioId",
             CASE WHEN c."recursoTipo" = 'tag' THEN c."recursoTitulo" END AS "viaTag",
             c."podeVisualizar"  AS "podeVisualizar",
             (c."podeUsarIa" AND pol.uso_ia) AS "podeUsarIa",
             c."podeAdministrar" AS "podeAdministrar",
             c."expiraEm"        AS "expiraEm",
             c."concedidoPorUsuarioId" AS "concedidoPorUsuarioId"
      FROM "compartilhamentos" c
      CROSS JOIN pol
      -- O alvo de uma concessão é a nota OU cada nota da coleção (tag). A
      -- coleção precisa ser do MESMO dono e da mesma empresa; e cada nota
      -- passa pelo mesmo teste de posse abaixo (repositório do dono).
      JOIN LATERAL (
        SELECT c."vaultNotaId" AS nota_id
        WHERE c."recursoTipo" = 'nota_vault' AND c."vaultNotaId" IS NOT NULL
        UNION ALL
        SELECT cn."vaultNotaId"
        FROM "colecao_notas" cn
        JOIN "colecoes_compartilhadas" col ON col."id" = cn."colecaoId"
        WHERE c."recursoTipo" = 'tag'
          AND cn."colecaoId" = c."colecaoId"
          AND col."empresaId" = ${empresaId}
          AND col."donoUsuarioId" = c."donoUsuarioId"
          AND EXISTS (SELECT 1 FROM "vault_notas" vn
                      WHERE vn."id" = cn."vaultNotaId"
                        AND vn."repositorioId" = col."repositorioId")
      ) alvo ON true
      JOIN "vault_notas" n
        ON n."id" = alvo.nota_id AND n."empresaId" = ${empresaId}
      JOIN "vault_repositorios" r
        ON r."empresaId" = ${empresaId}
       AND r."repositorioId" = n."repositorioId"
       AND r."donoUsuarioId" = c."donoUsuarioId"
      WHERE c."empresaId" = ${empresaId}
        AND c."recursoTipo" IN ('nota_vault', 'tag')
        AND c."status" = 'ativo'
        AND (c."expiraEm" IS NULL OR c."expiraEm" > now())
        -- Prazo máximo da política vale também para concessões antigas.
        AND (pol.max_dias IS NULL
             OR c."criadoEm" + make_interval(days => pol.max_dias) > now())
        AND c."donoUsuarioId" <> ${usuarioId}
        ${filtroNotas}
        AND NOT EXISTS (
          SELECT 1 FROM "membros" d
          WHERE d."empresaId" = ${empresaId}
            AND d."usuarioId" = c."donoUsuarioId"
            AND d."status" = 'inativo'
        )
        AND NOT EXISTS (SELECT 1 FROM eu WHERE eu.status <> 'ativo')
        AND (
          (c."destinatarioTipo" = 'membro' AND pol.membro
            AND EXISTS (SELECT 1 FROM eu WHERE eu."id" = c."destinatarioId"))
          OR (c."destinatarioTipo" IN ('equipe', 'area', 'empresa')
            AND NOT EXISTS (SELECT 1 FROM eu WHERE eu.tipo = 'convidado')
            -- Grupo exige um Membro (que pode ser desativado). A única conta
            -- sem Membro aceita é a do Owner da empresa.
            AND (EXISTS (SELECT 1 FROM eu)
                 OR EXISTS (SELECT 1 FROM "usuarios" u
                            WHERE u."id" = ${usuarioId}
                              AND u."empresaId" = ${empresaId}
                              AND u."role" = 'owner'))
            AND (
              (c."destinatarioTipo" = 'equipe' AND pol.equipe)
              OR (c."destinatarioTipo" = 'area' AND pol.area)
              OR (c."destinatarioTipo" = 'empresa' AND pol.empresa)
            )
            AND (
              (c."abrangencia" = 'fixa' AND EXISTS (
                SELECT 1 FROM "compartilhamento_membros" cm
                WHERE cm."compartilhamentoId" = c."id"
                  AND cm."usuarioId" = ${usuarioId}))
              OR (c."abrangencia" = 'dinamica' AND (
                (c."destinatarioTipo" = 'equipe'
                  AND EXISTS (SELECT 1 FROM eu WHERE eu."gestorId" = c."destinatarioId"))
                OR (c."destinatarioTipo" = 'area'
                  AND EXISTS (SELECT 1 FROM eu WHERE eu."areaId" = c."destinatarioId"))
                OR c."destinatarioTipo" = 'empresa'
              ))
            ))
        )
    `;
  }

  /** Concessões agrupadas por nota: a união das capacidades. */
  async acessos(
    empresaId: string,
    usuarioId: string,
    notaIds?: string[],
  ): Promise<Map<string, AcessoNota>> {
    const todas = await this.concessoesValidas(empresaId, usuarioId, notaIds);
    // Concessão DELEGADA (feita por quem administra, não pelo dono) só vale
    // enquanto quem a concedeu ainda administra a nota por concessão do DONO.
    // Revogar o administrador derruba o que ele concedeu. Profundidade 1:
    // quem administra não pode conceder administração (ver o service).
    const delegadas = todas.filter(
      (c) => c.concedidoPorUsuarioId !== c.donoUsuarioId,
    );
    const invalidas = new Set<string>();
    const cache = new Map<string, ConcessaoValida[]>();
    for (const c of delegadas) {
      let doConcedente = cache.get(c.concedidoPorUsuarioId);
      if (!doConcedente) {
        doConcedente = await this.concessoesValidas(
          empresaId,
          c.concedidoPorUsuarioId,
          [...new Set(delegadas.map((d) => d.vaultNotaId))],
        );
        cache.set(c.concedidoPorUsuarioId, doConcedente);
      }
      const ok = doConcedente.some(
        (g) =>
          g.vaultNotaId === c.vaultNotaId &&
          g.podeAdministrar &&
          g.concedidoPorUsuarioId === g.donoUsuarioId,
      );
      if (!ok) invalidas.add(c.compartilhamentoId);
    }
    const concessoes = todas.filter((c) => !invalidas.has(c.compartilhamentoId));
    const porNota = new Map<string, AcessoNota>();
    for (const c of concessoes) {
      const atual = porNota.get(c.vaultNotaId) ?? {
        vaultNotaId: c.vaultNotaId,
        donoUsuarioId: c.donoUsuarioId,
        visualizar: false,
        usarIa: false,
        administrar: false,
        expiraEm: c.expiraEm,
        compartilhamentoIds: [],
        viaTags: [],
        expiraAdminEm: undefined as unknown as Date | null,
      };
      if (c.podeAdministrar) {
        atual.expiraAdminEm =
          atual.expiraAdminEm === undefined
            ? c.expiraEm
            : atual.expiraAdminEm === null || c.expiraEm === null
              ? null
              : c.expiraEm > atual.expiraAdminEm
                ? c.expiraEm
                : atual.expiraAdminEm;
      }
      atual.visualizar ||= c.podeVisualizar;
      atual.usarIa ||= c.podeUsarIa;
      atual.administrar ||= c.podeAdministrar;
      atual.expiraEm =
        atual.expiraEm === null || c.expiraEm === null
          ? null
          : c.expiraEm > atual.expiraEm
            ? c.expiraEm
            : atual.expiraEm;
      atual.compartilhamentoIds.push(c.compartilhamentoId);
      if (c.viaTag && !atual.viaTags.includes(c.viaTag)) atual.viaTags.push(c.viaTag);
      porNota.set(c.vaultNotaId, atual);
    }
    for (const a of porNota.values()) {
      if (a.expiraAdminEm === undefined) a.expiraAdminEm = null;
    }
    return porNota;
  }

  /** Ids das notas alheias que o usuário pode usar com a capacidade dada. */
  async notasAutorizadas(
    empresaId: string,
    usuarioId: string,
    capacidade: Capacidade,
  ): Promise<string[]> {
    const mapa = await this.acessos(empresaId, usuarioId);
    return [...mapa.values()]
      .filter((a) =>
        capacidade === 'visualizar'
          ? a.visualizar
          : capacidade === 'usar_ia'
            ? a.usarIa
            : a.administrar,
      )
      .map((a) => a.vaultNotaId);
  }

  /** Acesso a uma nota específica (null = nenhum). */
  async acessoANota(
    empresaId: string,
    usuarioId: string,
    vaultNotaId: string,
  ): Promise<AcessoNota | null> {
    const mapa = await this.acessos(empresaId, usuarioId, [vaultNotaId]);
    return mapa.get(vaultNotaId) ?? null;
  }
}
