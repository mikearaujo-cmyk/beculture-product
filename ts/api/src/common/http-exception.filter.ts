import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Padroniza o corpo de erro para o formato que o frontend espera.
 *
 * O axios do front (ts/demo/src/utils/axios.ts) rejeita com
 * `error.response.data`, então retornamos sempre um JSON com `message`.
 */
/** Campos além de `codigo` que podem ir ao cliente (nada sensível). */
const CAMPOS_EXTRAS = ['temChavePropria', 'renovaEm'] as const;

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno do servidor.';
    /** Código estável opcional (ex.: "sem_chave_usuario") para a UI escolher o estado. */
    let codigo: string | undefined;
    /** Contexto extra seguro de alguns códigos (ex.: cota esgotada). */
    const extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object' && 'message' in res) {
        message = (res as { message: string | string[] }).message;
        const c = (res as { codigo?: unknown }).codigo;
        if (typeof c === 'string') codigo = c;
        for (const k of CAMPOS_EXTRAS) {
          if (k in res) extra[k] = (res as Record<string, unknown>)[k];
        }
      }
    } else {
      this.logger.error(exception);
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(codigo ? { codigo, ...extra } : {}),
    });
  }
}
