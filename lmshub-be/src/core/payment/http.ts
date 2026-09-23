import { logger } from '../logger/logger';

/**
 * Minimal REST client shared by every gateway adapter.
 *
 * Vendor SDKs are avoided on purpose: they would add seven dependencies (and
 * their transitive trees) to a product buyers must install themselves, for
 * endpoints that are a handful of JSON calls each. Node 20's global fetch is
 * enough.
 */

export class GatewayError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    readonly payload: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export interface GatewayRequest {
  provider: string;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  /** Sent as JSON unless `form` is set. */
  body?: unknown;
  /** Send `body` as application/x-www-form-urlencoded instead of JSON. */
  form?: boolean;
  timeoutMs?: number;
}

/** Perform one gateway call and parse the JSON response. */
export async function gatewayFetch<T = unknown>(req: GatewayRequest): Promise<T> {
  const method = req.method ?? 'POST';
  const headers: Record<string, string> = { Accept: 'application/json', ...req.headers };

  let payload: string | undefined;
  if (req.body !== undefined) {
    if (req.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(req.body as Record<string, string>).toString();
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(req.body);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 20_000);

  let res: Response;
  try {
    res = await fetch(req.url, { method, headers, body: payload, signal: controller.signal });
  } catch (err) {
    // A timeout or DNS failure must not look like a declined payment.
    throw new GatewayError(req.provider, 0, null, `${req.provider}: request failed — ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    logger.warn({ provider: req.provider, status: res.status, body: parsed }, 'Payment gateway rejected the request');
    throw new GatewayError(req.provider, res.status, parsed, `${req.provider}: HTTP ${res.status}`);
  }

  return parsed as T;
}

/** HTTP Basic credential, used by Midtrans and PayPal. */
export function basicAuth(user: string, pass = ''): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

/** Read a header case-insensitively, collapsing the array form Node may hand us. */
export function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return '';
  const value = headers[key];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
