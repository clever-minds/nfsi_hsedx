import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../core/http/asyncHandler';
import { validate } from '../../core/validation/validate';
import { requireAuth } from '../../core/rbac/requireAuth';
import { loginSchema, registerSchema, refreshSchema, verifyEmailSchema, googleSchema } from './auth.validation';
import * as ctrl from './auth.controller';

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });

export const authRouter = Router();

authRouter.get('/oauth-config', asyncHandler(ctrl.oauthConfig));
authRouter.post('/register', authLimiter, validate(registerSchema), asyncHandler(ctrl.register));
authRouter.post('/login', authLimiter, validate(loginSchema), asyncHandler(ctrl.login));
authRouter.post('/google', authLimiter, validate(googleSchema), asyncHandler(ctrl.googleLogin));
authRouter.post('/verify-email', validate(verifyEmailSchema), asyncHandler(ctrl.verifyEmail));
authRouter.post('/refresh', validate(refreshSchema), asyncHandler(ctrl.refresh));
authRouter.post('/logout', validate(refreshSchema), asyncHandler(ctrl.logout));
authRouter.get('/me', requireAuth(), asyncHandler(ctrl.me));
authRouter.post('/resend-verification', requireAuth(), asyncHandler(ctrl.resendVerification));
