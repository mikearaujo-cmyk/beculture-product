import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompartilhamentoAbrangencia,
  CompartilhamentoDestinatario,
  CompartilhamentoRecurso,
  CompartilhamentoStatus,
  MembroStatus,
  MembroTipo,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { AuthenticatedUser } from '@/auth/jwt.strategy';
import { AuditoriaService } from '@/auditoria/auditoria.service';
import { AcessoConteudoService } from './acesso-conteudo.service';
import { CapacidadesOrgService } from './capacidades-org.service';
import type {
  AlterarCompartilhamentoDto,
  CriarCompartilhamentoDto,
  DestinatarioDto,
  TagDto,
} from './dto/compartilhamento.dto';

export interface Politica {
  permitirMembro: boolean;
  permitirEquipe: boolean;
  permitirArea: boolean;
  permitirEmpresa: boolean;
  permitirUsoIa: boolean;
  permitirPublicacaoOrg: boolean;
  expiracaoMaximaDias: number | null;
}

const POLITICA_PADRAO: Politica = {
  permitirMembro: true,
  permitirEquipe: false,
  permitirArea: false,
  permitirEmpresa: false,
  permitirUsoIa: true,
  permitirPublicacaoOrg: true,
  expiracaoMaximaDias: null,
};

/** Concessão como a interface a mostra a quem administra a nota. */
export interface CompartilhamentoPublico {
  id: string;
  vaultNotaId: string | null;
  titulo: string;
  path: string | null;
  destinatario: { tipo: string; id: string | null; nome: string };
  abrangencia: string;
  /** Quantas pessoas a concessão abrange agora (fixa: as materializadas). */
  pessoas: number;
  podeVisualizar: boolean;
  podeUsarIa: boolean;
  podeAdministrar: boolean;
  expiraEm: Date | null;
  status: string;
  concedidoPor: string;
  donoNome: string;
  criadoEm: Date;
  /** Preenchido quando a concessão é de uma tag (coleção de arquivos). */
  tag: {
    chave: string;
    rotulo: string;
    sincronizada: boolean;
    notas: number;
  } | null;
}

/** Item recebido: metadados, sem conteúdo. */
export interface RecebidoPublico {
  vaultNotaId: string;
  titulo: string;
  donoUsuarioId: string;
  donoNome: string;
  visualizar: boolean;
  usarIa: boolean;
  administrar: boolean;
  expiraEm: Date | null;
  atualizadoEm: Date;
  /** Tags pelas quais a nota chegou (vazio = compartilhada individualmente). */
  viaTags: string[];
}

interface Membro {
  id: string;
  usuarioId: string | null;
  nome: string;
  areaId: string | null;
  gestorId: string | null;
  cargoId: string | null;
  tipo: MembroTipo;
  status: MembroStatus;
}

/**
 * Compartilhamento explícito de notas pessoais entre membros da Empresa.
 *
 * Quem pode conceder/alterar/revogar numa nota: o DONO (a nota está no
 * repositório verificado dele) ou quem recebeu `podeAdministrar` naquela nota.
 * Quem administra não concede o que não tem (ex.: usar na IA) e o poder vale só
 * para aquela nota — nunca para outros conteúdos do dono.
 */
@Injectable()
export class CompartilhamentoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acesso: AcessoConteudoService,
    private readonly capacidades: CapacidadesOrgService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ------------------------------------------------------------------
  // Política
  // ------------------------------------------------------------------

  async politica(empresaId: string): Promise<Politica> {
    const p = await this.prisma.politicaCompartilhamento.findUnique({
      where: { empresaId },
    });
    if (!p) return { ...POLITICA_PADRAO };
    // Compartilhamento só com pessoas: grupos (equipe, área, organização)
    // não existem mais como destinatário, qualquer que seja o valor salvo.
    return {
      permitirMembro: p.permitirMembro,
      permitirEquipe: false,
      permitirArea: false,
      permitirEmpresa: false,
      permitirUsoIa: p.permitirUsoIa,
      permitirPublicacaoOrg: p.permitirPublicacaoOrg,
      expiracaoMaximaDias: p.expiracaoMaximaDias,
    };
  }

  // ------------------------------------------------------------------
  // Conceder
  // ------------------------------------------------------------------

  async criar(
    user: AuthenticatedUser,
    repositorioId: string | null,
    dto: CriarCompartilhamentoDto,
  ): Promise<CompartilhamentoPublico[]> {
    const empresaId = user.empresaId;
    // Alvo: uma nota OU uma tag (coleção). Tag só o dono compartilha — a
    // coleção é montada a partir do repositório verificado dele.
    const nota: NotaAdministrada & {
      ehTag?: boolean;
      notasNaTag?: number;
      colecao?: { repositorioId: string; tag: TagDto; notaIds: string[] };
    } = dto.tag
      ? await this.prepararColecao(user, repositorioId, dto.tag)
      : await this.notaParaAdministrar(user, repositorioId, {
          path: dto.path,
          vaultNotaId: dto.vaultNotaId,
        });
    // Para tag, o id da coleção nasce dentro da transação (abaixo).
    let alvoDaConcessao: { colecaoId: string } | { vaultNotaId: string } =
      nota.ehTag ? { colecaoId: '' } : { vaultNotaId: nota.id };
    const recursoAuditoria = nota.ehTag ? 'colecao' : 'nota_vault';
    const politica = await this.politica(empresaId);

    // Permissões AUTOMÁTICAS: a interface sempre pede as três, e o pedido é
    // RECORTADO aqui ao que pode valer — nunca ampliado. Quem administra (não
    // dono) não concede o que não tem nem amplia o próprio poder: sem usar na
    // IA se não tem, sem conceder administração e sem prazo além do da própria
    // concessão de administração. Política sem IA desliga o uso pela IA.
    const podeUsarIa =
      dto.podeUsarIa &&
      politica.permitirUsoIa &&
      (nota.ehDono || !!nota.acesso?.usarIa);
    const podeAdministrar = dto.podeAdministrar && nota.ehDono;
    // Sem escolha de expiração na interface: vale a da política, se houver.
    const max = politica.expiracaoMaximaDias;
    const expiraPedido =
      dto.expiraEm ??
      (max ? new Date(Date.now() + max * 86_400_000 - 60_000).toISOString() : null);
    const expiraEm = this.limitarAoAdministrador(
      this.validarExpiracao(expiraPedido, politica),
      nota.ehDono ? null : nota.acesso,
    );

    await this.exigirPodeCompartilhar(user);

    const destinos = dedupe(dto.destinatarios);
    const resolvidos: {
      tipo: CompartilhamentoDestinatario;
      id: string | null;
      fixos: { membroId: string; usuarioId: string }[];
    }[] = [];
    for (const d of destinos) {
      this.exigirTipoPermitido(d.tipo, politica);
      const id = await this.validarDestinatario(empresaId, nota.donoUsuarioId, d);
      if (!nota.ehDono && d.tipo === 'membro') {
        const alvo = await this.prisma.membro.findFirst({
          where: { id: id!, empresaId },
          select: { usuarioId: true },
        });
        if (alvo?.usuarioId === user.id) {
          throw new ForbiddenException(
            'Você não pode alterar o próprio acesso a uma nota de outra pessoa.',
          );
        }
      }
      const fixos =
        d.tipo !== 'membro'
          ? await this.membrosDoGrupo(empresaId, d.tipo, id, nota.donoUsuarioId)
          : [];
      resolvidos.push({
        tipo: d.tipo as CompartilhamentoDestinatario,
        id,
        fixos,
      });
    }

    // Grupos recebem sempre só os membros de agora (congelados em `fixos`);
    // `dto.abrangencia` é ignorado, inclusive `dinamica` de clientes antigos.
    const abrangencia = CompartilhamentoAbrangencia.fixa;

    const ids: string[] = [];
    const eventos: Prisma.AuditoriaEventoCreateManyInput[] = [];
    await this.prisma.$transaction(async (tx) => {
      // Tag: só agora, com tudo validado, a coleção é gravada — nova, nunca
      // reaproveitada (ver `prepararColecao`).
      if (nota.colecao) {
        const col = await tx.colecaoCompartilhada.create({
          data: {
            empresaId,
            repositorioId: nota.colecao.repositorioId,
            donoUsuarioId: user.id,
            chave: nota.colecao.tag.chave,
            rotulo: nota.colecao.tag.rotulo,
            sincronizada: nota.colecao.tag.sincronizada,
          },
          select: { id: true },
        });
        await tx.colecaoNota.createMany({
          data: nota.colecao.notaIds.map((vaultNotaId) => ({
            colecaoId: col.id,
            vaultNotaId,
          })),
          skipDuplicates: true,
        });
        nota.id = col.id;
        alvoDaConcessao = { colecaoId: col.id };
      }
      for (const r of resolvidos) {
        // Mesma nota + mesmo destinatário ativo: atualiza em vez de duplicar.
        const existente = await tx.compartilhamento.findFirst({
          where: {
            empresaId,
            ...alvoDaConcessao,
            destinatarioTipo: r.tipo,
            destinatarioId: r.id,
            status: CompartilhamentoStatus.ativo,
          },
          select: { id: true, concedidoPorUsuarioId: true },
        });
        // Quem administra só reescreve concessões que ele mesmo fez — nunca a
        // do dono, nem a que o próprio administrador recebeu.
        if (
          existente &&
          !nota.ehDono &&
          existente.concedidoPorUsuarioId !== user.id
        ) {
          throw new ForbiddenException(
            'Já existe um compartilhamento para este destinatário. Só o dono da nota pode alterá-lo.',
          );
        }
        const dados = {
          podeVisualizar: true,
          podeUsarIa,
          podeAdministrar,
          expiraEm,
          abrangencia: r.tipo === 'membro' ? CompartilhamentoAbrangencia.fixa : abrangencia,
          // O dono reescreve uma concessão existente como SUA: herdar o
          // concedente delegado a deixaria inválida quando ele perder a
          // administração.
          ...(nota.ehDono ? { concedidoPorUsuarioId: user.id } : {}),
        };
        let id: string;
        if (existente) {
          id = existente.id;
          await tx.compartilhamento.update({ where: { id }, data: dados });
          await tx.compartilhamentoMembro.deleteMany({
            where: { compartilhamentoId: id },
          });
        } else {
          const criado = await tx.compartilhamento.create({
            data: {
              empresaId,
              ...alvoDaConcessao,
              recursoTipo: nota.ehTag
                ? CompartilhamentoRecurso.tag
                : CompartilhamentoRecurso.nota_vault,
              recursoTitulo: nota.titulo,
              donoUsuarioId: nota.donoUsuarioId,
              concedidoPorUsuarioId: user.id,
              destinatarioTipo: r.tipo,
              destinatarioId: r.id,
              ...dados,
            },
            select: { id: true },
          });
          id = criado.id;
        }
        if (r.fixos.length) {
          await tx.compartilhamentoMembro.createMany({
            data: r.fixos.map((f) => ({ compartilhamentoId: id, ...f })),
            skipDuplicates: true,
          });
        }
        ids.push(id);
        eventos.push(
          await this.auditoria.dados({
            empresaId,
            atorUsuarioId: user.id,
            acao: existente ? 'compartilhamento.alterado' : 'compartilhamento.criado',
            recursoTipo: recursoAuditoria,
            recursoId: nota.id,
            recursoTitulo: nota.titulo,
            donoUsuarioId: nota.donoUsuarioId,
            alvoTipo: r.tipo,
            alvoId: r.id,
            metadados: {
              compartilhamentoId: id,
              ...(nota.ehTag ? { notasNaTag: nota.notasNaTag ?? 0 } : {}),
              abrangencia: dados.abrangencia,
              pessoasFixas: r.fixos.length,
              podeVisualizar: true,
              podeUsarIa,
              podeAdministrar,
              expiraEm: expiraEm?.toISOString() ?? null,
            },
          }),
        );
      }
      await tx.auditoriaEvento.createMany({ data: eventos });
    });
    return this.publicos(empresaId, { id: { in: ids } }, nota.ehDono);
  }

  // ------------------------------------------------------------------
  // Consultar
  // ------------------------------------------------------------------

  /** Concessões das notas do usuário no repositório ativo (todas as notas). */
  async concedidos(
    user: AuthenticatedUser,
    repositorioId: string | null,
  ): Promise<CompartilhamentoPublico[]> {
    if (!repositorioId) return [];
    return this.publicos(user.empresaId, {
      donoUsuarioId: user.id,
      status: CompartilhamentoStatus.ativo,
      OR: [
        { vaultNota: { repositorioId } },
        { colecao: { repositorioId, donoUsuarioId: user.id } },
      ],
    });
  }

  // ------------------------------------------------------------------
  // Tags (coleções)
  // ------------------------------------------------------------------

  /**
   * Prepara (SÓ LEITURA) o compartilhamento de uma tag do repositório ATIVO
   * do usuário (verificado como dele): resolve os arquivos que o navegador
   * dele calculou. Paths fora do repositório dele são ignorados — nunca entra
   * nota de outra pessoa. A coleção só é gravada depois de TODAS as checagens,
   * dentro da transação de `criar`.
   *
   * Cada compartilhamento de tag ganha a SUA coleção: compartilhar a mesma
   * tag de novo nunca altera o que outras pessoas já receberam (uma tag "só os
   * arquivos de agora" não muda nunca).
   */
  private async prepararColecao(
    user: AuthenticatedUser,
    repositorioId: string | null,
    tag: TagDto,
  ): Promise<
    NotaAdministrada & {
      ehTag: true;
      notasNaTag: number;
      colecao: {
        repositorioId: string;
        tag: TagDto;
        notaIds: string[];
      };
    }
  > {
    if (!repositorioId) throw new BadRequestException('Nenhum repositório ativo.');
    const notas = await this.prisma.vaultNota.findMany({
      where: {
        empresaId: user.empresaId,
        repositorioId,
        path: { in: [...new Set(tag.paths)] },
      },
      select: { id: true },
    });
    if (notas.length === 0) {
      throw new BadRequestException(
        'Nenhum arquivo desta tag está sincronizado. Sincronize o Repositório e tente de novo.',
      );
    }
    return {
      id: '',
      titulo: tag.rotulo,
      donoUsuarioId: user.id,
      ehDono: true,
      acesso: null,
      ehTag: true,
      notasNaTag: notas.length,
      colecao: { repositorioId, tag, notaIds: notas.map((n) => n.id) },
    };
  }

  /** Substitui as notas da coleção pelas dos `paths` (só do repositório dado). */
  private async definirNotasDaColecao(
    empresaId: string,
    repositorioId: string,
    colecaoId: string,
    paths: string[],
  ): Promise<{ total: number; entraram: number; sairam: number }> {
    // Leitura e escrita na MESMA transação, com a linha da coleção travada:
    // duas sincronizações simultâneas não se intercalam.
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "colecoes_compartilhadas" WHERE "id" = ${colecaoId} FOR UPDATE`;
      const notas = await tx.vaultNota.findMany({
        where: { empresaId, repositorioId, path: { in: [...new Set(paths)] } },
        select: { id: true },
      });
      const novos = new Set(notas.map((x) => x.id));
      const atuais = await tx.colecaoNota.findMany({
        where: { colecaoId },
        select: { vaultNotaId: true },
      });
      const velhos = new Set(atuais.map((a) => a.vaultNotaId));
      const sair = [...velhos].filter((id) => !novos.has(id));
      const entrar = [...novos].filter((id) => !velhos.has(id));
      await tx.colecaoNota.deleteMany({
        where: { colecaoId, vaultNotaId: { in: sair } },
      });
      await tx.colecaoNota.createMany({
        data: entrar.map((vaultNotaId) => ({ colecaoId, vaultNotaId })),
        skipDuplicates: true,
      });
      return { total: novos.size, entraram: entrar.length, sairam: sair.length };
    });
  }

  /** Tags compartilhadas do repositório ativo (para sincronizar e mostrar selo). */
  async tags(user: AuthenticatedUser, repositorioId: string | null) {
    if (!repositorioId) return [];
    const cols = await this.prisma.colecaoCompartilhada.findMany({
      where: { empresaId: user.empresaId, repositorioId, donoUsuarioId: user.id },
      select: {
        chave: true,
        rotulo: true,
        sincronizada: true,
        _count: {
          select: {
            notas: true,
            compartilhamentos: { where: { status: CompartilhamentoStatus.ativo } },
          },
        },
      },
    });
    // Uma tag pode ter várias coleções (cada compartilhamento tem a sua):
    // agrega por chave.
    const porChave = new Map<
      string,
      {
        chave: string;
        rotulo: string;
        sincronizada: boolean;
        notas: number;
        compartilhamentos: number;
      }
    >();
    for (const c of cols) {
      const a = porChave.get(c.chave) ?? {
        chave: c.chave,
        rotulo: c.rotulo,
        sincronizada: false,
        notas: 0,
        compartilhamentos: 0,
      };
      a.sincronizada ||= c.sincronizada;
      a.notas = Math.max(a.notas, c._count.notas);
      a.compartilhamentos += c._count.compartilhamentos;
      porChave.set(c.chave, a);
    }
    return [...porChave.values()];
  }

  /**
   * Atualiza os arquivos de uma tag SINCRONIZADA com o que o navegador do dono
   * calculou agora. Tag "só os arquivos de agora" não muda (devolve
   * `ignorada`). Mudanças entram na auditoria (só contagens).
   */
  async sincronizarTag(
    user: AuthenticatedUser,
    repositorioId: string | null,
    chave: string,
    paths: string[],
  ) {
    if (!repositorioId) throw new BadRequestException('Nenhum repositório ativo.');
    const cols = await this.prisma.colecaoCompartilhada.findMany({
      where: { empresaId: user.empresaId, repositorioId, chave, donoUsuarioId: user.id },
      select: { id: true, sincronizada: true },
    });
    if (!cols.length) throw new NotFoundException('Tag não encontrada.');
    // Só as coleções "manter sincronizado" mudam; as "só os arquivos de agora"
    // ficam exatamente como foram compartilhadas.
    const sincronizadas = cols.filter((c) => c.sincronizada);
    if (!sincronizadas.length) return { ignorada: true as const };
    let entraram = 0;
    let sairam = 0;
    let total = 0;
    for (const col of sincronizadas) {
      const r = await this.definirNotasDaColecao(user.empresaId, repositorioId, col.id, paths);
      entraram += r.entraram;
      sairam += r.sairam;
      total = r.total;
      if (r.entraram || r.sairam) {
        await this.auditoria.registrar({
          empresaId: user.empresaId,
          atorUsuarioId: user.id,
          acao: 'colecao.atualizada',
          recursoTipo: 'colecao',
          recursoId: col.id,
          donoUsuarioId: user.id,
          metadados: { entraram: r.entraram, sairam: r.sairam, total: r.total },
        });
      }
    }
    return { ignorada: false as const, entraram, sairam, total };
  }

  /** Concessões de uma tag — só para o dono. */
  private async daTag(
    user: AuthenticatedUser,
    repositorioId: string | null,
    chave: string,
  ) {
    const cols = repositorioId
      ? await this.prisma.colecaoCompartilhada.findMany({
          where: { empresaId: user.empresaId, repositorioId, chave, donoUsuarioId: user.id },
          select: { id: true, rotulo: true },
          orderBy: { criadoEm: 'desc' },
        })
      : [];
    if (!cols.length) {
      return { nota: { id: '', titulo: '', ehDono: true }, compartilhamentos: [], colecaoIds: [] };
    }
    const colecaoIds = cols.map((c) => c.id);
    return {
      nota: { id: cols[0].id, titulo: cols[0].rotulo, ehDono: true },
      colecaoIds,
      compartilhamentos: await this.publicos(user.empresaId, {
        colecaoId: { in: colecaoIds },
        status: CompartilhamentoStatus.ativo,
      }),
    };
  }

  /** Concessões de UMA nota — para o dono ou quem administra aquela nota. */
  async daNota(
    user: AuthenticatedUser,
    repositorioId: string | null,
    alvo: { path?: string; vaultNotaId?: string; tag?: string },
  ): Promise<{ nota: { id: string; titulo: string; ehDono: boolean }; compartilhamentos: CompartilhamentoPublico[] }> {
    if (alvo.tag) return this.daTag(user, repositorioId, alvo.tag);
    const nota = await this.notaParaAdministrar(user, repositorioId, alvo, true);
    if (!nota) return { nota: { id: '', titulo: '', ehDono: true }, compartilhamentos: [] };
    return {
      nota: { id: nota.id, titulo: nota.titulo, ehDono: nota.ehDono },
      compartilhamentos: await this.publicos(
        user.empresaId,
        { vaultNotaId: nota.id, status: CompartilhamentoStatus.ativo },
        // Quem só administra não vê a estrutura de pastas do dono.
        nota.ehDono,
      ),
    };
  }

  /** O que foi compartilhado COM o usuário e vale agora. Só metadados. */
  async recebidos(user: AuthenticatedUser): Promise<RecebidoPublico[]> {
    const mapa = await this.acesso.acessos(user.empresaId, user.id);
    const ids = [...mapa.keys()];
    if (!ids.length) return [];
    const notas = await this.prisma.vaultNota.findMany({
      where: { empresaId: user.empresaId, id: { in: ids } },
      select: { id: true, titulo: true, atualizadoEm: true },
    });
    const nomes = await this.nomesDeUsuarios(
      user.empresaId,
      [...mapa.values()].map((a) => a.donoUsuarioId),
    );
    return notas
      .map((n) => {
        const a = mapa.get(n.id)!;
        return {
          vaultNotaId: n.id,
          titulo: n.titulo,
          donoUsuarioId: a.donoUsuarioId,
          donoNome: nomes.get(a.donoUsuarioId) ?? 'Membro',
          visualizar: a.visualizar,
          usarIa: a.usarIa,
          administrar: a.administrar,
          expiraEm: a.expiraEm,
          atualizadoEm: n.atualizadoEm,
          viaTags: a.viaTags,
        };
      })
      .sort((x, y) => y.atualizadoEm.getTime() - x.atualizadoEm.getTime());
  }

  /** Conteúdo de uma nota recebida. 404 para quem não tem `visualizar`. */
  async conteudoRecebido(user: AuthenticatedUser, vaultNotaId: string) {
    const a = await this.acesso.acessoANota(user.empresaId, user.id, vaultNotaId);
    if (!a?.visualizar) {
      throw new NotFoundException('Conteúdo não encontrado ou não compartilhado com você.');
    }
    const nota = await this.prisma.vaultNota.findFirst({
      where: { id: vaultNotaId, empresaId: user.empresaId },
      select: { id: true, titulo: true, conteudo: true, atualizadoEm: true },
    });
    if (!nota) throw new NotFoundException('Conteúdo não encontrado.');
    const nomes = await this.nomesDeUsuarios(user.empresaId, [a.donoUsuarioId]);
    // Gravada ANTES de devolver o conteúdo e sem engolir falha: acesso a
    // conteúdo de terceiro sem registro não acontece.
    await this.prisma.auditoriaEvento.create({
      data: await this.auditoria.dados({
        empresaId: user.empresaId,
        atorUsuarioId: user.id,
        acao: 'conteudo.visualizado',
        recursoTipo: 'nota_vault',
        recursoId: nota.id,
        donoUsuarioId: a.donoUsuarioId,
        metadados: { compartilhamentoIds: a.compartilhamentoIds },
      }),
    });
    return {
      vaultNotaId: nota.id,
      titulo: nota.titulo,
      conteudo: nota.conteudo,
      atualizadoEm: nota.atualizadoEm,
      donoNome: nomes.get(a.donoUsuarioId) ?? 'Membro',
      visualizar: a.visualizar,
      usarIa: a.usarIa,
      administrar: a.administrar,
      expiraEm: a.expiraEm,
    };
  }

  /** Histórico (auditoria) de uma nota — para o dono ou quem a administra. */
  async historico(
    user: AuthenticatedUser,
    repositorioId: string | null,
    alvo: { path?: string; vaultNotaId?: string; tag?: string },
  ) {
    let nota: { id: string; ehDono: boolean } | null;
    let recursoTipo = 'nota_vault';
    let recursoIds: string[] = [];
    if (alvo.tag) {
      const t = await this.daTag(user, repositorioId, alvo.tag);
      nota = t.nota.id ? { id: t.nota.id, ehDono: true } : null;
      recursoTipo = 'colecao';
      recursoIds = t.colecaoIds;
    } else {
      nota = await this.notaParaAdministrar(user, repositorioId, alvo, true);
      if (nota) recursoIds = [nota.id];
    }
    if (!nota) return { eventos: [] };
    const eventos = await this.prisma.auditoriaEvento.findMany({
      where: {
        empresaId: user.empresaId,
        recursoTipo,
        recursoId: { in: recursoIds },
        // Quem só administra vê as mudanças de compartilhamento, não quem
        // leu ou usou a nota — isso é do dono.
        ...(nota.ehDono ? {} : { acao: { startsWith: 'compartilhamento.' } }),
      },
      orderBy: { criadoEm: 'desc' },
      take: 100,
      select: {
        id: true,
        acao: true,
        atorNome: true,
        alvoTipo: true,
        alvoId: true,
        criadoEm: true,
      },
    });
    return { eventos };
  }

  // ------------------------------------------------------------------
  // Alterar / revogar
  // ------------------------------------------------------------------

  async alterar(
    user: AuthenticatedUser,
    id: string,
    dto: AlterarCompartilhamentoDto,
  ): Promise<CompartilhamentoPublico> {
    const c = await this.concessaoParaAdministrar(user, id);
    if (!c.ehDono) {
      // Quem administra não mexe na concessão do dono nem na que recebeu.
      if (
        c.concedidoPorUsuarioId !== user.id ||
        c.acesso?.compartilhamentoIds.includes(c.id)
      ) {
        throw new ForbiddenException(
          'Só o dono da nota pode alterar este compartilhamento.',
        );
      }
      if (dto.podeAdministrar) {
        throw new ForbiddenException(
          'Só o dono da nota pode conceder a administração do compartilhamento.',
        );
      }
    }
    const politica = await this.politica(user.empresaId);
    const data: Prisma.CompartilhamentoUpdateInput = {};
    if (dto.podeUsarIa !== undefined) {
      if (dto.podeUsarIa && !c.ehDono && !c.acesso?.usarIa) {
        throw new ForbiddenException(
          'Você não pode conceder o uso pela IA: você mesmo não tem essa permissão nesta nota.',
        );
      }
      if (dto.podeUsarIa && !politica.permitirUsoIa) {
        throw new ForbiddenException(
          'A política da organização não permite compartilhar conteúdo para uso pela IA.',
        );
      }
      data.podeUsarIa = dto.podeUsarIa;
    }
    if (dto.podeAdministrar !== undefined) data.podeAdministrar = dto.podeAdministrar;
    const adm = c.ehDono ? null : c.acesso;
    if (dto.semExpiracao) {
      data.expiraEm = this.limitarAoAdministrador(
        this.validarExpiracao(null, politica),
        adm,
      );
    } else if (dto.expiraEm !== undefined) {
      data.expiraEm = this.limitarAoAdministrador(
        this.validarExpiracao(dto.expiraEm, politica),
        adm,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.compartilhamento.update({ where: { id: c.id }, data });
      await tx.auditoriaEvento.create({
        data: await this.auditoria.dados({
          empresaId: user.empresaId,
          atorUsuarioId: user.id,
          acao: 'compartilhamento.alterado',
          recursoTipo: c.colecaoId ? 'colecao' : 'nota_vault',
          recursoId: c.colecaoId ?? c.vaultNotaId,
          recursoTitulo: c.recursoTitulo,
          donoUsuarioId: c.donoUsuarioId,
          alvoTipo: c.destinatarioTipo,
          alvoId: c.destinatarioId,
          metadados: {
            compartilhamentoId: c.id,
            podeUsarIa: dto.podeUsarIa ?? null,
            podeAdministrar: dto.podeAdministrar ?? null,
            expiraEm:
              data.expiraEm instanceof Date
                ? data.expiraEm.toISOString()
                : (data.expiraEm ?? null),
          } as Prisma.InputJsonValue,
        }),
      });
    });
    const [pub] = await this.publicos(user.empresaId, { id: c.id }, c.ehDono);
    return pub;
  }

  async revogar(user: AuthenticatedUser, id: string): Promise<void> {
    const c = await this.concessaoParaAdministrar(user, id);
    if (!c.ehDono && c.concedidoPorUsuarioId !== user.id) {
      throw new ForbiddenException(
        'Só o dono da nota pode revogar este compartilhamento.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.compartilhamento.update({
        where: { id: c.id },
        data: {
          status: CompartilhamentoStatus.revogado,
          revogadoEm: new Date(),
          revogadoPorUsuarioId: user.id,
        },
      });
      await tx.auditoriaEvento.create({
        data: await this.auditoria.dados({
          empresaId: user.empresaId,
          atorUsuarioId: user.id,
          acao: 'compartilhamento.revogado',
          recursoTipo: c.colecaoId ? 'colecao' : 'nota_vault',
          recursoId: c.colecaoId ?? c.vaultNotaId,
          recursoTitulo: c.recursoTitulo,
          donoUsuarioId: c.donoUsuarioId,
          alvoTipo: c.destinatarioTipo,
          alvoId: c.destinatarioId,
          metadados: { compartilhamentoId: c.id },
        }),
      });
    });
  }

  // ------------------------------------------------------------------
  // Destinatários (para a interface)
  // ------------------------------------------------------------------

  /**
   * Pessoas da organização que o usuário pode escolher (só pessoas — não há
   * mais compartilhamento com equipe, área ou organização), mais as SUGESTÕES
   * da hierarquia (gestor, liderança). Sugestão é só um atalho de seleção —
   * nada aqui concede acesso.
   *
   * Dados mínimos: nome, cargo e área de membros ativos com conta.
   */
  async destinatarios(user: AuthenticatedUser) {
    // Convidados não compartilham e não recebem o diretório da organização.
    await this.exigirPodeCompartilhar(user);
    const empresaId = user.empresaId;
    const [membros, areas, cargos] = await Promise.all([
      // Todos os colaboradores ativos ou com convite pendente — com ou sem
      // conta. Quem ainda não tem conta recebe o acesso ao entrar.
      this.prisma.membro.findMany({
        where: {
          empresaId,
          status: { in: [MembroStatus.ativo, MembroStatus.convite_pendente] },
        },
        select: {
          id: true,
          usuarioId: true,
          nome: true,
          areaId: true,
          gestorId: true,
          cargoId: true,
          tipo: true,
          status: true,
        },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.area.findMany({
        where: { empresaId, status: 'ativo' },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.cargo.findMany({
        where: { empresaId },
        select: { id: true, nome: true },
      }),
    ]);
    const nomeCargo = new Map(cargos.map((c) => [c.id, c.nome]));
    const nomeArea = new Map(areas.map((a) => [a.id, a.nome]));
    const porId = new Map<string, Membro>(membros.map((m) => [m.id, m]));
    const eu = membros.find((m) => m.usuarioId === user.id) ?? null;

    const lideranca: string[] = [];
    let atual = eu?.gestorId ? porId.get(eu.gestorId) : undefined;
    const vistos = new Set<string>();
    while (atual && !vistos.has(atual.id) && lideranca.length < 12) {
      vistos.add(atual.id);
      lideranca.push(atual.id);
      atual = atual.gestorId ? porId.get(atual.gestorId) : undefined;
    }

    return {
      eu: eu ? { membroId: eu.id, areaId: eu.areaId, gestorId: eu.gestorId } : null,
      membros: membros
        .filter((m) => m.usuarioId !== user.id)
        .map((m) => ({
          id: m.id,
          nome: m.nome,
          cargo: m.cargoId ? (nomeCargo.get(m.cargoId) ?? null) : null,
          area: m.areaId ? (nomeArea.get(m.areaId) ?? null) : null,
          convidado: m.tipo === MembroTipo.convidado,
          /** Ainda não entrou na plataforma: o acesso vale quando entrar. */
          semConta: !m.usuarioId,
        })),
      // Só pessoas: as sugestões preenchem membros, nunca grupos.
      sugestoes: {
        gestorDireto: eu?.gestorId ?? null,
        lideranca,
      },
    };
  }

  // ------------------------------------------------------------------
  // Internos
  // ------------------------------------------------------------------

  /**
   * Resolve a nota que o usuário quer administrar: pelo `path` no repositório
   * ATIVO dele (dono), ou pelo `vaultNotaId` quando ele tem `podeAdministrar`.
   * 404 em qualquer outro caso — nunca revela se a nota existe.
   */
  private async notaParaAdministrar(
    user: AuthenticatedUser,
    repositorioId: string | null,
    alvo: { path?: string; vaultNotaId?: string },
    permitirAusente?: false,
  ): Promise<NotaAdministrada>;
  private async notaParaAdministrar(
    user: AuthenticatedUser,
    repositorioId: string | null,
    alvo: { path?: string; vaultNotaId?: string },
    permitirAusente: true,
  ): Promise<NotaAdministrada | null>;
  private async notaParaAdministrar(
    user: AuthenticatedUser,
    repositorioId: string | null,
    alvo: { path?: string; vaultNotaId?: string },
    permitirAusente = false,
  ): Promise<NotaAdministrada | null> {
    const empresaId = user.empresaId;
    if (alvo.path) {
      if (!repositorioId) {
        throw new BadRequestException('Nenhum repositório ativo.');
      }
      // O interceptor global já garantiu que `repositorioId` é do usuário.
      const nota = await this.prisma.vaultNota.findUnique({
        where: {
          empresaId_repositorioId_path: { empresaId, repositorioId, path: alvo.path },
        },
        select: { id: true, titulo: true },
      });
      if (!nota) {
        if (permitirAusente) return null;
        throw new NotFoundException(
          'Nota não sincronizada. Sincronize o Repositório e tente de novo.',
        );
      }
      return { ...nota, donoUsuarioId: user.id, ehDono: true, acesso: null };
    }
    if (alvo.vaultNotaId) {
      const a = await this.acesso.acessoANota(empresaId, user.id, alvo.vaultNotaId);
      if (!a?.administrar) throw new NotFoundException('Conteúdo não encontrado.');
      const nota = await this.prisma.vaultNota.findFirst({
        where: { id: alvo.vaultNotaId, empresaId },
        select: { id: true, titulo: true },
      });
      if (!nota) throw new NotFoundException('Conteúdo não encontrado.');
      return { ...nota, donoUsuarioId: a.donoUsuarioId, ehDono: false, acesso: a };
    }
    throw new BadRequestException('Informe a nota.');
  }

  /** Concessão que o usuário pode alterar/revogar (dono ou administrador). */
  private async concessaoParaAdministrar(user: AuthenticatedUser, id: string) {
    const c = await this.prisma.compartilhamento.findFirst({
      where: { id, empresaId: user.empresaId, status: CompartilhamentoStatus.ativo },
    });
    if (!c) throw new NotFoundException('Compartilhamento não encontrado.');
    // Concessão de TAG: só o dono administra (a coleção é dele, do repositório
    // verificado dele). Quem recebeu "administrar" por uma tag administra cada
    // nota individualmente, não a concessão da tag.
    if (c.colecaoId) {
      const col = await this.prisma.colecaoCompartilhada.findFirst({
        where: { id: c.colecaoId, empresaId: user.empresaId, donoUsuarioId: user.id },
        select: { repositorioId: true },
      });
      const repo = col
        ? await this.prisma.vaultRepositorio.findUnique({
            where: {
              empresaId_repositorioId: {
                empresaId: user.empresaId,
                repositorioId: col.repositorioId,
              },
            },
            select: { donoUsuarioId: true },
          })
        : null;
      if (c.donoUsuarioId !== user.id || repo?.donoUsuarioId !== user.id) {
        throw new NotFoundException('Compartilhamento não encontrado.');
      }
      return { ...c, ehDono: true, acesso: null };
    }
    if (!c.vaultNotaId) throw new NotFoundException('Compartilhamento não encontrado.');
    if (c.donoUsuarioId === user.id) {
      // Defesa extra: a nota precisa estar num repositório do próprio usuário.
      const ok = await this.prisma.vaultNota.findFirst({
        where: { id: c.vaultNotaId, empresaId: user.empresaId },
        select: { repositorioId: true },
      });
      const repo = ok
        ? await this.prisma.vaultRepositorio.findUnique({
            where: {
              empresaId_repositorioId: {
                empresaId: user.empresaId,
                repositorioId: ok.repositorioId,
              },
            },
            select: { donoUsuarioId: true },
          })
        : null;
      if (repo?.donoUsuarioId !== user.id) {
        throw new NotFoundException('Compartilhamento não encontrado.');
      }
      return { ...c, ehDono: true, acesso: null };
    }
    const a = await this.acesso.acessoANota(user.empresaId, user.id, c.vaultNotaId);
    if (!a?.administrar) throw new NotFoundException('Compartilhamento não encontrado.');
    return { ...c, ehDono: false, acesso: a };
  }

  /**
   * Quem pode iniciar um compartilhamento: membro ativo e não convidado (ou a
   * conta proprietária, que não tem Membro).
   */
  private async exigirPodeCompartilhar(user: AuthenticatedUser): Promise<void> {
    const m = await this.prisma.membro.findUnique({
      where: {
        empresaId_usuarioId: { empresaId: user.empresaId, usuarioId: user.id },
      },
      select: { status: true, tipo: true },
    });
    if (m && m.status !== MembroStatus.ativo) {
      throw new ForbiddenException('Seu acesso está inativo nesta organização.');
    }
    if (m?.tipo === MembroTipo.convidado) {
      throw new ForbiddenException('Convidados não compartilham conteúdo.');
    }
  }

  /**
   * Quem administra (não dono) não concede prazo além do da própria
   * administração: se a dele expira, a concessão nova expira até lá.
   */
  private limitarAoAdministrador(
    expiraEm: Date | null,
    acesso: { expiraAdminEm: Date | null } | null | undefined,
  ): Date | null {
    const teto = acesso?.expiraAdminEm ?? null;
    if (!acesso || !teto) return expiraEm;
    if (!expiraEm || expiraEm > teto) return teto;
    return expiraEm;
  }

  private exigirTipoPermitido(tipo: string, p: Politica): void {
    // Só pessoas específicas da mesma organização. Equipe, área e toda a
    // organização não são mais aceitas como destinatário.
    if (tipo !== 'membro') {
      throw new BadRequestException(
        'Só é possível compartilhar com pessoas específicas da organização.',
      );
    }
    if (!p.permitirMembro) {
      throw new ForbiddenException(
        'A política da organização não permite este tipo de compartilhamento.',
      );
    }
  }

  private validarExpiracao(valor: string | null, p: Politica): Date | null {
    const max = p.expiracaoMaximaDias;
    if (!valor) {
      if (max) {
        throw new BadRequestException(
          `A política da organização exige uma data de expiração (máximo de ${max} dias).`,
        );
      }
      return null;
    }
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Data de expiração inválida.');
    if (d.getTime() <= Date.now()) {
      throw new BadRequestException('A expiração precisa ser uma data futura.');
    }
    if (max && d.getTime() > Date.now() + max * 86_400_000) {
      throw new BadRequestException(
        `A política da organização limita o compartilhamento a ${max} dias.`,
      );
    }
    return d;
  }

  /** Confere o destinatário contra o tenant. Devolve o id normalizado. */
  private async validarDestinatario(
    empresaId: string,
    donoUsuarioId: string,
    d: DestinatarioDto,
  ): Promise<string | null> {
    if (d.tipo !== 'membro') {
      throw new BadRequestException(
        'Só é possível compartilhar com pessoas específicas da organização.',
      );
    }
    if (!d.id) throw new BadRequestException('Destinatário sem identificação.');
    const m = await this.prisma.membro.findFirst({
      where: { id: d.id, empresaId },
      select: { id: true, usuarioId: true, status: true },
    });
    if (!m) throw new BadRequestException('Membro não encontrado.');
    // Colaborador ativo ou com convite pendente, mesmo sem conta ainda: a
    // concessão é pelo Membro e passa a valer quando ele entrar na plataforma
    // (a leitura exige Membro ativo vinculado à conta).
    if (
      m.status !== MembroStatus.ativo &&
      m.status !== MembroStatus.convite_pendente
    ) {
      throw new BadRequestException(
        'Só é possível compartilhar com colaboradores ativos da organização.',
      );
    }
    if (m.usuarioId && m.usuarioId === donoUsuarioId) {
      throw new BadRequestException('O dono já tem acesso à própria nota.');
    }
    return m.id;
  }

  /** Membros de um grupo AGORA (para abrangência fixa). */
  private async membrosDoGrupo(
    empresaId: string,
    tipo: string,
    id: string | null,
    donoUsuarioId: string,
  ): Promise<{ membroId: string; usuarioId: string }[]> {
    if (tipo === 'empresa') {
      // Toda conta da empresa, menos inativos, convites pendentes e convidados.
      const [usuarios, membros] = await Promise.all([
        this.prisma.usuario.findMany({
          where: { empresaId },
          select: { id: true, role: true },
        }),
        this.prisma.membro.findMany({
          where: { empresaId, usuarioId: { not: null } },
          select: { id: true, usuarioId: true, status: true, tipo: true },
        }),
      ]);
      const porUsuario = new Map(membros.map((m) => [m.usuarioId!, m]));
      return usuarios
        .filter((u) => u.id !== donoUsuarioId)
        .flatMap((u) => {
          const m = porUsuario.get(u.id);
          if (m && (m.status !== MembroStatus.ativo || m.tipo === MembroTipo.convidado)) {
            return [];
          }
          // Conta sem Membro não pode ser desativada; só a do Owner entra.
          if (!m && u.role !== 'owner') return [];
          return [{ membroId: m?.id ?? `u:${u.id}`, usuarioId: u.id }];
        });
    }
    const where: Prisma.MembroWhereInput = {
      empresaId,
      status: MembroStatus.ativo,
      tipo: MembroTipo.membro,
      usuarioId: { not: null },
      ...(tipo === 'equipe' ? { gestorId: id } : { areaId: id }),
    };
    const membros = await this.prisma.membro.findMany({
      where,
      select: { id: true, usuarioId: true },
    });
    return membros
      .filter((m) => m.usuarioId && m.usuarioId !== donoUsuarioId)
      .map((m) => ({ membroId: m.id, usuarioId: m.usuarioId! }));
  }

  private async publicos(
    empresaId: string,
    where: Prisma.CompartilhamentoWhereInput,
    incluirPath = true,
  ): Promise<CompartilhamentoPublico[]> {
    const linhas = await this.prisma.compartilhamento.findMany({
      where: { ...where, empresaId },
      include: {
        vaultNota: { select: { path: true, titulo: true } },
        colecao: {
          select: {
            chave: true,
            rotulo: true,
            sincronizada: true,
            _count: { select: { notas: true } },
          },
        },
        _count: { select: { membrosFixos: true } },
      },
      orderBy: { criadoEm: 'desc' },
    });
    if (!linhas.length) return [];
    const membroIds = linhas
      .filter((l) => l.destinatarioTipo === 'membro' || l.destinatarioTipo === 'equipe')
      .map((l) => l.destinatarioId!)
      .filter(Boolean);
    const areaIds = linhas
      .filter((l) => l.destinatarioTipo === 'area')
      .map((l) => l.destinatarioId!)
      .filter(Boolean);
    const [membros, areas, nomes, contagem] = await Promise.all([
      this.prisma.membro.findMany({
        where: { empresaId, id: { in: membroIds } },
        select: { id: true, nome: true },
      }),
      this.prisma.area.findMany({
        where: { empresaId, id: { in: areaIds } },
        select: { id: true, nome: true },
      }),
      this.nomesDeUsuarios(
        empresaId,
        linhas.flatMap((l) => [l.concedidoPorUsuarioId, l.donoUsuarioId]),
      ),
      this.contagemDinamica(empresaId, linhas),
    ]);
    const nomeMembro = new Map(membros.map((m) => [m.id, m.nome]));
    const nomeArea = new Map(areas.map((a) => [a.id, a.nome]));
    return linhas.map((l) => {
      let nome = 'Toda a organização';
      if (l.destinatarioTipo === 'membro') nome = nomeMembro.get(l.destinatarioId!) ?? 'Membro';
      if (l.destinatarioTipo === 'equipe')
        nome = `Equipe de ${nomeMembro.get(l.destinatarioId!) ?? 'gestor'}`;
      if (l.destinatarioTipo === 'area') nome = `Área ${nomeArea.get(l.destinatarioId!) ?? ''}`.trim();
      const pessoas =
        l.destinatarioTipo === 'membro'
          ? 1
          : l.abrangencia === 'fixa'
            ? l._count.membrosFixos
            : (contagem.get(l.id) ?? 0);
      return {
        id: l.id,
        vaultNotaId: l.vaultNotaId,
        titulo: l.colecao
          ? `#${l.colecao.rotulo}`
          : (l.vaultNota?.titulo ?? l.recursoTitulo),
        path: incluirPath ? (l.vaultNota?.path ?? null) : null,
        tag: l.colecao
          ? {
              chave: l.colecao.chave,
              rotulo: l.colecao.rotulo,
              sincronizada: l.colecao.sincronizada,
              notas: l.colecao._count.notas,
            }
          : null,
        destinatario: { tipo: l.destinatarioTipo, id: l.destinatarioId, nome },
        abrangencia: l.abrangencia,
        pessoas,
        podeVisualizar: l.podeVisualizar,
        podeUsarIa: l.podeUsarIa,
        podeAdministrar: l.podeAdministrar,
        expiraEm: l.expiraEm,
        status: l.status,
        concedidoPor: nomes.get(l.concedidoPorUsuarioId) ?? 'Membro',
        donoNome: nomes.get(l.donoUsuarioId) ?? 'Membro',
        criadoEm: l.criadoEm,
      };
    });
  }

  /** Quantas pessoas um grupo dinâmico abrange agora. */
  private async contagemDinamica(
    empresaId: string,
    linhas: { id: string; destinatarioTipo: string; destinatarioId: string | null; abrangencia: string; donoUsuarioId: string }[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const l of linhas) {
      if (l.abrangencia !== 'dinamica' || l.destinatarioTipo === 'membro') continue;
      const grupo = await this.membrosDoGrupo(
        empresaId,
        l.destinatarioTipo,
        l.destinatarioId,
        l.donoUsuarioId,
      );
      out.set(l.id, grupo.length);
    }
    return out;
  }

  private async nomesDeUsuarios(
    empresaId: string,
    ids: string[],
  ): Promise<Map<string, string>> {
    const unicos = [...new Set(ids)];
    if (!unicos.length) return new Map();
    const us = await this.prisma.usuario.findMany({
      where: { empresaId, id: { in: unicos } },
      select: { id: true, nome: true, email: true },
    });
    return new Map(us.map((u) => [u.id, u.nome || u.email]));
  }

  /** Para o controller: capacidades no Repositório da organização. */
  capacidadesOrg(user: AuthenticatedUser) {
    return this.capacidades.de(user);
  }
}

interface NotaAdministrada {
  id: string;
  titulo: string;
  donoUsuarioId: string;
  ehDono: boolean;
  acesso: Awaited<ReturnType<AcessoConteudoService['acessoANota']>>;
}

function dedupe(ds: DestinatarioDto[]): DestinatarioDto[] {
  const vistos = new Set<string>();
  return ds.filter((d) => {
    const k = `${d.tipo}:${d.id ?? ''}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}
