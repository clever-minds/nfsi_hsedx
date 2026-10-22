import { NextFunction, Request, Response } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../http/AppError';

type Part = 'body' | 'query' | 'params';

/**
 * Recovers from form-submission edge cases where an optional field was submitted
 * as `null` or `""` (empty string) instead of `undefined`.
 * Does not bypass genuine validation errors (e.g., required fields or min-length violations).
 */
function tryRecover(schema: ZodSchema, data: unknown, err: ZodError) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const clone = { ...(data as Record<string, unknown>) };
  let modified = false;

  for (const issue of err.issues) {
    if (issue.path.length > 0) {
      let target: Record<string, unknown> = clone;
      for (let i = 0; i < issue.path.length - 1; i++) {
        const seg = issue.path[i];
        if (target && typeof target[seg] === 'object' && target[seg] !== null) {
          target = target[seg] as Record<string, unknown>;
        }
      }
      const lastKey = String(issue.path[issue.path.length - 1]);
      const val = target[lastKey];
      if (val === null || val === '') {
        target[lastKey] = undefined;
        modified = true;
      }
    }
  }

  if (!modified) return null;
  const retry = schema.safeParse(clone);
  return retry.success ? retry : null;
}

/** Middleware validasi zod untuk bagian request tertentu. Mengganti req[part] dengan hasil parse. */
export function validate(schema: ZodSchema, part: Part = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    let result = schema.safeParse(req[part]);
    if (!result.success) {
      const recovered = tryRecover(schema, req[part], result.error as ZodError);
      if (recovered) {
        result = recovered;
      }
    }

    if (!result.success) {
      const err = result.error as ZodError;
      const fieldErrors = err.flatten().fieldErrors;
      const detailsList = Object.entries(fieldErrors)
        .map(([field, msgs]) => `${field}: ${(msgs || []).join(', ')}`)
        .join('; ');
      const message = detailsList ? `Validation failed (${detailsList})` : 'Validation failed';
      return next(
        AppError.unprocessable(message, 'validation.failed', {
          fields: fieldErrors,
        }),
      );
    }
    // save hasil parse di properti terpisah agar no bertabrakan dengan getter Express
    (req as unknown as Record<string, unknown>)[`valid_${part}`] = result.data;
    if (part === 'body') req.body = result.data;
    next();
  };
}

/** Ambil data hasil validasi yang sudah diparse. */
export function validated<T>(req: Request, part: Part = 'body'): T {
  return (req as unknown as Record<string, unknown>)[`valid_${part}`] as T;
}
