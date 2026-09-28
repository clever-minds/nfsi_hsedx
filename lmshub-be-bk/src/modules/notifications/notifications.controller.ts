import { Request, Response } from 'express';
import { ok, created, noContent } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './notifications.service';
import {
  CreateAnnouncementInput,
  CreateMessageInput,
  CreateReminderInput,
  RespondNotificationInput,
  RespondReminderInput,
  UpdateEventConfigInput,
} from './notifications.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

// ── notification_event_config ───────────────────────────────────────────

export async function listEventConfig(_req: Request, res: Response) {
  return ok(res, await service.listEventConfig());
}

export async function updateEventConfig(req: Request, res: Response) {
  const result = await service.updateEventConfig(
    auth(req),
    req.params.jenisEvent,
    validated<UpdateEventConfigInput>(req),
  );
  return ok(res, result);
}

// ── notifications inbox ──────────────────────────────────────────────────

export async function listInbox(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    jenis: req.query['filter[jenis]'] as string | undefined,
    status: req.query['filter[status]'] as 'dibaca' | 'belum_dibaca' | undefined,
  };
  const { rows, total } = await service.listInbox(auth(req), page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function markRead(req: Request, res: Response) {
  return ok(res, await service.markRead(auth(req), req.params.id));
}

export async function respond(req: Request, res: Response) {
  const { isi_respons } = validated<RespondNotificationInput>(req);
  return ok(res, await service.respond(auth(req), req.params.id, isi_respons));
}

// ── reminders ────────────────────────────────────────────────────────────

export async function listMyReminders(req: Request, res: Response) {
  const page = parsePage(req);
  const { rows, total } = await service.listMyReminders(auth(req), page);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function monitorReminders(req: Request, res: Response) {
  const page = parsePage(req);
  const { rows, total } = await service.monitorReminders(page);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function createReminder(req: Request, res: Response) {
  return created(res, await service.createReminder(auth(req), validated<CreateReminderInput>(req)));
}

export async function markReminderRead(req: Request, res: Response) {
  return ok(res, await service.markReminderRead(auth(req), req.params.id));
}

export async function respondReminder(req: Request, res: Response) {
  const { isi_respons } = validated<RespondReminderInput>(req);
  return ok(res, await service.respondReminder(auth(req), req.params.id, isi_respons));
}

// ── announcements ────────────────────────────────────────────────────────

export async function listAnnouncements(req: Request, res: Response) {
  const page = parsePage(req);
  const { rows, total } = await service.listAnnouncements(page);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function createAnnouncement(req: Request, res: Response) {
  return created(res, await service.createAnnouncement(auth(req), validated<CreateAnnouncementInput>(req)));
}

// ── messages (inbox) ─────────────────────────────────────────────────────

export async function listMessages(req: Request, res: Response) {
  const page = parsePage(req);
  const rawDibaca = req.query['filter[dibaca]'];
  const filters = { dibaca: rawDibaca === undefined ? undefined : rawDibaca === 'true' };
  const { rows, total } = await service.listMessages(auth(req), page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function sendMessage(req: Request, res: Response) {
  return created(res, await service.sendMessage(auth(req), validated<CreateMessageInput>(req)));
}

export async function markMessageRead(req: Request, res: Response) {
  await service.markMessageRead(auth(req), req.params.id);
  return noContent(res);
}
