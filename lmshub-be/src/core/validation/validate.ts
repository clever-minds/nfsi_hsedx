import { NextFunction, Request, Response } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../http/AppError';

type Part = 'body' | 'query' | 'params';

/** Middleware validasi zod untuk bagian request tertentu. Mengganti req[part] dengan hasil parse. */
export function validate(schema: ZodSchema, part: Part = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const err = result.error as ZodError;
      return next(
        AppError.unprocessable('Validation failed', 'validation.failed', {
          fields: err.flatten().fieldErrors,
        }),
      );
    }
    // simpan hasil parse di properti terpisah agar tidak bertabrakan dengan getter Express
    (req as unknown as Record<string, unknown>)[`valid_${part}`] = result.data;
    if (part === 'body') req.body = result.data;
    next();
  };
}

/** Ambil data hasil validasi yang sudah diparse. */
export function validated<T>(req: Request, part: Part = 'body'): T {
  return (req as unknown as Record<string, unknown>)[`valid_${part}`] as T;
}
