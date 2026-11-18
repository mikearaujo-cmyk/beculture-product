import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Escopo de IA da requisição, vindo do header `X-Escopo-Ia`.
 *
 * As organizações do menu de perfil vivem no cliente e ficam todas dentro da
 * mesma Empresa. O front diz em qual está:
 *   pessoal     = organização pessoal (sem organização ou pagador PF) → B2C:
 *                 seletor de modelos, cota BeCulture, BYOK após a cota.
 *   organizacao = organização empresarial (pagador PJ) → telas antigas:
 *                 chaves da conta, modelos e prioridades.
 * Sem header (clientes antigos, jobs), vale a modalidade gravada na Empresa.
 *
 * Fica num AsyncLocalStorage para o `ModalidadeService` ler sem que o escopo
 * precise atravessar todos os controllers e serviços de IA.
 */
export type EscopoIa = 'pessoal' | 'organizacao';

const armazenamento = new AsyncLocalStorage<{ escopo: EscopoIa | null }>();

export function escopoIaAtual(): EscopoIa | null {
  return armazenamento.getStore()?.escopo ?? null;
}

export function escopoIaMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const bruto = req.header('x-escopo-ia');
  const escopo: EscopoIa | null =
    bruto === 'pessoal' || bruto === 'organizacao' ? bruto : null;
  armazenamento.run({ escopo }, () => next());
}
