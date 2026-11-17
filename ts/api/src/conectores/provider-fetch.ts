import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * GET autenticado numa API de provedor OAuth (Gmail, Microsoft Graph, Google
 * Calendar), com as mensagens de erro que o usuário vê no produto.
 *
 * 401/403 quase sempre significam escopo faltando ou autorização revogada —
 * a saída é reconectar, então o texto aponta para Conectores. Os demais
 * códigos viram 503: falha do provedor, não do tenant.
 */
export async function getProviderJson<T>(
  ctx: {
    logger: Logger;
    /** Nome do provedor como aparece na UI (ex.: "Google Calendar"). */
    label: string;
    /** Recurso acessado, para a frase de erro (ex.: "a agenda"). */
    recurso: string;
  },
  url: string,
  token: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    ctx.logger.error(err);
    throw new ServiceUnavailableException(
      `Falha ao falar com o ${ctx.label}. Tente novamente.`,
    );
  }
  if (!res.ok) {
    const detalhe = await res.text().catch(() => '');
    ctx.logger.warn(
      `${ctx.label} ${res.status} em ${url}: ${detalhe.slice(0, 300)}`,
    );
    if (res.status === 401 || res.status === 403) {
      throw new BadRequestException(
        `O ${ctx.label} recusou o acesso ${ctx.recurso}. ` +
          `Abra Conectores → ${ctx.label} → Conectar e autorize a conta novamente.`,
      );
    }
    throw new ServiceUnavailableException(
      `O ${ctx.label} retornou um erro (${res.status}) ao ler ${ctx.recurso}.`,
    );
  }
  return (await res.json()) as T;
}

/**
 * GET autenticado que devolve o corpo em bytes (download/exportação de
 * arquivo). Mesmos erros de `getProviderJson`; acima de `limiteBytes`
 * responde 400, para o arquivo não estourar o limite de resposta da função.
 */
export async function getProviderBinary(
  ctx: { logger: Logger; label: string; recurso: string },
  url: string,
  token: string,
  limiteBytes: number,
): Promise<{ buffer: Buffer; contentType: string }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    ctx.logger.error(err);
    throw new ServiceUnavailableException(
      `Falha ao falar com o ${ctx.label}. Tente novamente.`,
    );
  }
  if (!res.ok) {
    const detalhe = await res.text().catch(() => '');
    ctx.logger.warn(
      `${ctx.label} ${res.status} em ${url}: ${detalhe.slice(0, 300)}`,
    );
    if (res.status === 401 || res.status === 403) {
      // O Drive responde 403 também quando o arquivo é grande demais para
      // exportar — a mensagem dele diz isso; não é caso de reconectar.
      if (/exportSizeLimitExceeded|too large/i.test(detalhe)) {
        throw new BadRequestException(
          `O arquivo é grande demais para o ${ctx.label} exportar.`,
        );
      }
      throw new BadRequestException(
        `O ${ctx.label} recusou o acesso ${ctx.recurso}. ` +
          `Abra Conectores → ${ctx.label} → Conectar e autorize a conta novamente.`,
      );
    }
    throw new ServiceUnavailableException(
      `O ${ctx.label} retornou um erro (${res.status}) ao ler ${ctx.recurso}.`,
    );
  }
  const declarado = Number(res.headers.get('content-length') ?? 0);
  if (declarado > limiteBytes) {
    throw new BadRequestException(
      `Arquivo acima do limite de ${Math.round(limiteBytes / 1024 / 1024)} MB.`,
    );
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > limiteBytes) {
    throw new BadRequestException(
      `Arquivo acima do limite de ${Math.round(limiteBytes / 1024 / 1024)} MB.`,
    );
  }
  return {
    buffer,
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
  };
}
