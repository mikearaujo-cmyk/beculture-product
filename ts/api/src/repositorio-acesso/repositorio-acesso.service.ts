import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditoriaService } from '@/auditoria/auditoria.service';

/** Prefixo do escopo pessoal no Repositório da organização (`pessoal:<usuarioId>`). */
const PREFIXO_PESSOAL = 'pessoal:';

/**
 * Garante, no servidor, que o repositório pessoal enviado pelo cliente
 * (`X-Repositorio-Id`, ou `repositorioId` no corpo do /ai/prompt) é do usuário
 * da requisição.
 *
 * Antes desta camada o servidor confiava no id: qualquer membro da mesma
 * empresa que enviasse o id de outro lia, sobrescrevia ou apagava as notas
 * dele. Agora o repositório tem dono (`VaultRepositorio`), reivindicado no
 * primeiro uso, e todo acesso de outra pessoa é 403 — inclusive de gestores,
 * Owner e Admin. Ver conteúdo alheio só por `Compartilhamento`.
 *
 * Positivos ficam em cache de memória: a posse nunca muda depois de
 * reivindicada (não há transferência), então um "é dono" não envelhece. Os
 * negativos não são guardados.
 */
@Injectable()
export class RepositorioAcessoService {
  private readonly verificados = new Map<string, true>();
  private static readonly LIMITE_CACHE = 5000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Devolve o `repositorioId` quando ele é do usuário (reivindicando-o se ainda
   * não tiver dono), `null` quando ausente, e 403 quando é de outra pessoa.
   */
  async verificar(
    empresaId: string,
    usuarioId: string,
    repositorioId: string | null | undefined,
  ): Promise<string | null> {
    const id = (repositorioId ?? '').trim();
    if (!id) return null;
    if (id.length > 200) {
      throw new ForbiddenException('Repositório inválido.');
    }
    const chave = `${empresaId}|${id}|${usuarioId}`;
    if (this.verificados.has(chave)) return id;

    let dono = await this.donoDe(empresaId, id);
    if (!dono) {
      try {
        await this.prisma.vaultRepositorio.create({
          data: { empresaId, repositorioId: id, donoUsuarioId: usuarioId },
        });
        dono = usuarioId;
        // Toda reivindicação fica na trilha. A de um repositório que JÁ tinha
        // notas (anterior a esta versão, sem dono conhecido) é a que merece
        // atenção de quem audita.
        const notas = await this.prisma.vaultNota.count({
          where: { empresaId, repositorioId: id },
        });
        await this.auditoria.registrar({
          empresaId,
          atorUsuarioId: usuarioId,
          acao: 'repositorio.reivindicado',
          recursoTipo: 'repositorio',
          recursoId: id,
          donoUsuarioId: usuarioId,
          metadados: { notasExistentes: notas },
        });
      } catch (err) {
        // Corrida: outra requisição reivindicou entre a leitura e a escrita.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          dono = await this.donoDe(empresaId, id);
        } else {
          throw err;
        }
      }
    }
    if (dono !== usuarioId) {
      throw new ForbiddenException(
        'Este repositório é pessoal de outra pessoa. Peça que ela compartilhe o conteúdo com você.',
      );
    }
    if (this.verificados.size >= RepositorioAcessoService.LIMITE_CACHE) {
      this.verificados.clear();
    }
    this.verificados.set(chave, true);
    return id;
  }

  /**
   * O escopo pessoal do Repositório da organização (`pessoal:<id do usuário
   * no protótipo>`) é de UMA pessoa. O id do protótipo não é o id do servidor,
   * então a posse é a mesma de um repositório pessoal: reivindicada no primeiro
   * uso pela conta autenticada e 403 para qualquer outra. Ids de organização
   * do protótipo passam: as organizações do protótipo não são fronteira de
   * acesso no servidor (a fronteira é a Empresa).
   */
  async verificarOrganizacao(
    empresaId: string,
    usuarioId: string,
    organizacaoId: string | null,
  ): Promise<void> {
    if (!organizacaoId || !organizacaoId.startsWith(PREFIXO_PESSOAL)) return;
    await this.verificar(empresaId, usuarioId, organizacaoId);
  }

  private async donoDe(
    empresaId: string,
    repositorioId: string,
  ): Promise<string | null> {
    const r = await this.prisma.vaultRepositorio.findUnique({
      where: { empresaId_repositorioId: { empresaId, repositorioId } },
      select: { donoUsuarioId: true },
    });
    return r?.donoUsuarioId ?? null;
  }
}
