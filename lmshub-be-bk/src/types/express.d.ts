import { AuthContext } from '../core/rbac/types';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      /**
       * Exact request bytes, captured by the JSON body parser. Payment
       * webhooks sign the raw payload, so the re-serialised `req.body` cannot
       * be used to check their signatures.
       */
      rawBody?: Buffer;
    }
  }
}

export {};
