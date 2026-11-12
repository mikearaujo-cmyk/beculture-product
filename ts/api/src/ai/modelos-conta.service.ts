import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ModalidadeService } from './modalidade.service';
import { PlataformaIaService } from './plataforma.service';
import { type AiModality } from './catalogo';
import {
  ORQUESTRADOR_DESCRICAO,
  ORQUESTRADOR_ID,
  ORQUESTRADOR_ROTULO,
} from './orquestrador';

export interface OpcaoModelo {
  /** Id técnico do modelo (ou "auto" para o orquestrador). */
  id: string;
  rotulo: string;
  providerNome: string | null;
  descricao?: string;
}

export interface ModelosDaModalidade {
  opcoes: OpcaoModelo[];
  /** Último modelo usado (vale para todas as ações até trocar de novo). */
  selecionado: string | null;
}

export type ModelosConta = Record<AiModality, ModelosDaModalidade> & {
  /**
   * O seletor de modelos só existe no B2C com modelos BeCulture. Nas demais
   * modalidades (BYOK, B2B, legado) vem `false` e as listas vêm vazias.
   */
  habilitado: boolean;
};

const KINDS: AiModality[] = ['text', 'image', 'video'];

/**
 * Opções do seletor de modelos de cada ação e o "último modelo usado" do
 * usuário (estilo Adapta: escolher em uma ação vale para todas as outras).
 *
 * Só existe no B2C com modelos BeCulture: as opções são os modelos
 * publicados no plano (Backoffice → Modelos BeCulture), com "Automático"
 * (orquestrador) primeiro no texto. BYOK, B2B e legado não têm seletor.
 */
@Injectable()
export class ModelosContaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modalidade: ModalidadeService,
    private readonly plataforma: PlataformaIaService,
  ) {}

  async listar(empresaId: string, usuarioId: string): Promise<ModelosConta> {
    const [opcoes, preferidos, ctx] = await Promise.all([
      this.opcoes(empresaId),
      this.preferidos(usuarioId),
      this.modalidade.contexto(empresaId),
    ]);
    const out = {
      habilitado: ctx.modalidade === 'beculture',
    } as ModelosConta;
    for (const kind of KINDS) {
      const lista = opcoes[kind];
      const salvo = preferidos[kind];
      out[kind] = {
        opcoes: lista,
        selecionado:
          salvo && lista.some((o) => o.id === salvo)
            ? salvo
            : (lista[0]?.id ?? null),
      };
    }
    return out;
  }

  async salvarUltimo(
    empresaId: string,
    usuarioId: string,
    kind: AiModality,
    modelo: string,
  ): Promise<ModelosConta> {
    const opcoes = (await this.opcoes(empresaId))[kind];
    if (!opcoes.some((o) => o.id === modelo)) {
      throw new BadRequestException(
        'O modelo escolhido não está disponível para esta conta.',
      );
    }
    const atual = await this.preferidos(usuarioId);
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { modelosPreferidos: { ...atual, [kind]: modelo } },
    });
    return this.listar(empresaId, usuarioId);
  }

  /** Opções por modalidade, sem repetir o mesmo id (vazias fora do BeCulture). */
  async opcoes(empresaId: string): Promise<Record<AiModality, OpcaoModelo[]>> {
    const ctx = await this.modalidade.contexto(empresaId);
    const brutas: Record<AiModality, OpcaoModelo[]> = {
      text: [],
      image: [],
      video: [],
    };
    if (ctx.modalidade !== 'beculture') return brutas;

    const publicados = await this.plataforma.disponiveisNoPlano(
      ctx.planoIa ?? 'essencial',
    );
    for (const m of publicados) {
      brutas[m.kind].push({
        id: m.model,
        rotulo: m.rotulo,
        providerNome: m.providerNome,
      });
    }

    const unicas = (lista: OpcaoModelo[]) =>
      lista.filter((o, i) => lista.findIndex((x) => x.id === o.id) === i);
    return {
      text: [
        {
          id: ORQUESTRADOR_ID,
          rotulo: ORQUESTRADOR_ROTULO,
          providerNome: null,
          descricao: ORQUESTRADOR_DESCRICAO,
        },
        ...unicas(brutas.text),
      ],
      image: unicas(brutas.image),
      video: unicas(brutas.video),
    };
  }


  private async preferidos(
    usuarioId: string,
  ): Promise<Partial<Record<AiModality, string>>> {
    const u = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { modelosPreferidos: true },
    });
    return (u?.modelosPreferidos ?? {}) as Partial<Record<AiModality, string>>;
  }
}
