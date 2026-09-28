import { Request, Response } from 'express';
import { ok, created } from '../../core/http/envelope';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './auth.service';
import { isGoogleConfigured, googleClientId } from '../../core/auth/google';
import { isMailConfigured } from '../../core/mail/mailer';
import { LoginInput, RegisterInput, RefreshInput, VerifyEmailInput, GoogleInput } from './auth.validation';

const ctxOf = (req: Request) => ({ ua: req.headers['user-agent'], ip: req.ip });

export async function register(req: Request, res: Response) {
  const input = validated<RegisterInput>(req, 'body');
  const result = await service.register(input, ctxOf(req));
  return created(res, result);
}

export async function login(req: Request, res: Response) {
  const input = validated<LoginInput>(req, 'body');
  const result = await service.login(input, ctxOf(req));
  return ok(res, result);
}

export async function refresh(req: Request, res: Response) {
  const input = validated<RefreshInput>(req, 'body');
  const result = await service.refresh(input.refresh_token, ctxOf(req));
  return ok(res, result);
}

export async function logout(req: Request, res: Response) {
  const input = validated<RefreshInput>(req, 'body');
  const result = await service.logout(input.refresh_token);
  return ok(res, result);
}

export async function me(req: Request, res: Response) {
  if (!req.auth) throw AppError.unauthorized();
  const result = await service.me(req.auth.userId);
  return ok(res, { ...result, permissions: [...req.auth.permissions] });
}

export async function verifyEmail(req: Request, res: Response) {
  const input = validated<VerifyEmailInput>(req, 'body');
  return ok(res, await service.verifyEmail(input.token));
}

export async function resendVerification(req: Request, res: Response) {
  if (!req.auth) throw AppError.unauthorized();
  return ok(res, await service.resendVerification(req.auth.userId));
}

export async function googleLogin(req: Request, res: Response) {
  const input = validated<GoogleInput>(req, 'body');
  return ok(res, await service.loginWithGoogle(input.id_token, ctxOf(req)));
}

// Konfigurasi OAuth/verifikasi untuk FE (client id Google, apakah email aktif).
export async function oauthConfig(_req: Request, res: Response) {
  return ok(res, {
    google_client_id: await googleClientId(),
    google_enabled: await isGoogleConfigured(),
    email_verification_enabled: await isMailConfigured(),
  });
}
