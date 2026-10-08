import { Request, Response } from 'express';
import { ok } from '../../core/http/envelope';
import { AppError } from '../../core/http/AppError';
import * as service from './dashboard.service';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function student(req: Request, res: Response) {
  return ok(res, await service.student(auth(req)));
}

export async function instructor(req: Request, res: Response) {
  return ok(res, await service.instructor(auth(req)));
}

export async function admin(req: Request, res: Response) {
  return ok(res, await service.admin(auth(req)));
}

export async function direktur(req: Request, res: Response) {
  return ok(res, await service.direktur(auth(req)));
}

export async function ketua(req: Request, res: Response) {
  return ok(res, await service.ketua(auth(req)));
}

export async function pembina(req: Request, res: Response) {
  return ok(res, await service.pembina(auth(req)));
}

export async function marketing(req: Request, res: Response) {
  return ok(res, await service.marketing(auth(req)));
}
