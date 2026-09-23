import { Request, Response } from 'express';
import { ok, created, noContent } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './users.service';
import {
  ChangeMyPasswordInput,
  CreateUserInput,
  SetPermissionsInput,
  UpdateMeInput,
  UpdateUserInput,
  UploadMyPhotoInput,
  VerifyInput,
} from './users.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function list(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    role: req.query['filter[role]'] as string | undefined,
    status: req.query['filter[status]'] as string | undefined,
    created_by: req.query['filter[created_by]'] as string | undefined,
    q: req.query.q as string | undefined,
  };
  const { rows, total } = await service.list(auth(req), page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function detail(req: Request, res: Response) {
  return ok(res, await service.detail(auth(req), req.params.id));
}

export async function create(req: Request, res: Response) {
  return created(res, await service.create(auth(req), validated<CreateUserInput>(req)));
}

export async function update(req: Request, res: Response) {
  return ok(res, await service.update(auth(req), req.params.id, validated<UpdateUserInput>(req)));
}

export async function remove(req: Request, res: Response) {
  await service.remove(auth(req), req.params.id);
  return noContent(res);
}

export async function updateMe(req: Request, res: Response) {
  return ok(res, await service.updateMe(auth(req), validated<UpdateMeInput>(req)));
}

export async function changeMyPassword(req: Request, res: Response) {
  await service.changeMyPassword(auth(req), validated<ChangeMyPasswordInput>(req));
  return noContent(res);
}

export async function uploadMyPhoto(req: Request, res: Response) {
  return ok(res, await service.uploadMyPhoto(auth(req), validated<UploadMyPhotoInput>(req)));
}

export async function getPermissions(req: Request, res: Response) {
  return ok(res, await service.getPermissions(auth(req), req.params.id));
}

export async function setPermissions(req: Request, res: Response) {
  return ok(res, await service.setPermissions(auth(req), req.params.id, validated<SetPermissionsInput>(req)));
}

export async function verify(req: Request, res: Response) {
  return ok(res, await service.verify(auth(req), req.params.id, validated<VerifyInput>(req)));
}

export async function roles(_req: Request, res: Response) {
  return ok(res, await service.roles());
}

export async function permissionsCatalog(_req: Request, res: Response) {
  return ok(res, await service.permissionsCatalog());
}
