/**
 * Structured application error, mapped onto the `{ error }` envelope.
 *
 * Two identifiers travel with every error and they mean different things:
 *
 * - `code` is the HTTP class (`NOT_FOUND`, `CONFLICT`, …). Coarse, stable, and
 *   what a client switches on to decide how to behave.
 * - `key` names this specific error (`course.not_found`). The frontend looks it
 *   up in its `errors` catalogue to show the message in the reader's language.
 *   When no translation exists, `message` is displayed as-is — which is why
 *   `message` is always written in English.
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  /** Translation key for this exact error, e.g. `order.already_paid`. */
  public readonly key?: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, key?: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.key = key;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message = 'Invalid request', key?: string, details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, key, details);
  }
  static unauthorized(message = 'Not authenticated', key?: string) {
    return new AppError(401, 'UNAUTHORIZED', message, key);
  }
  static forbidden(message = 'Access denied', key?: string, details?: unknown) {
    return new AppError(403, 'FORBIDDEN', message, key, details);
  }
  static notFound(message = 'Not found', key?: string) {
    return new AppError(404, 'NOT_FOUND', message, key);
  }
  static conflict(message = 'Conflicting data', key?: string, details?: unknown) {
    return new AppError(409, 'CONFLICT', message, key, details);
  }
  static unprocessable(message = 'Data could not be processed', key?: string, details?: unknown) {
    return new AppError(422, 'UNPROCESSABLE', message, key, details);
  }
  static internal(message = 'Internal server error', key?: string) {
    return new AppError(500, 'INTERNAL', message, key);
  }
}
