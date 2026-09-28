import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import * as repo from './notifications.repository';
import {
  CreateAnnouncementInput,
  CreateMessageInput,
  CreateReminderInput,
  UpdateEventConfigInput,
} from './notifications.validation';

const isSuper = (actor: AuthContext) => actor.roles.includes('super_admin');

// ── notification_event_config (admin) ──────────────────────────────────

export async function listEventConfig() {
  return repo.listEventConfig();
}

export async function updateEventConfig(actor: AuthContext, jenisEvent: string, input: UpdateEventConfigInput) {
  const before = await repo.getEventConfigByJenis(jenisEvent);
  if (!before) throw AppError.notFound('Event configuration not found', 'gamification.event_config_not_found');
  await repo.updateEventConfig(jenisEvent, input);
  await recordAudit({
    userId: actor.userId,
    module: 'notifikasi',
    action: 'update_event_config',
    entity: 'notification_event_config',
    entityId: before.id,
    before,
    after: input,
  });
  return repo.getEventConfigByJenis(jenisEvent);
}

// ── Helper lintas modul ──────────────────────────────────────────────────

export interface NotifyPayload {
  judul: string;
  isi: string;
  data?: unknown;
  sourceType?: string;
  sourceId?: string;
  kanal?: string[];
}

/**
 * Helper dipanggil modul lain untuk mengirim notifikasi in-app (+ fan-out kanal lain).
 * `jenis` merujuk `notification_event_config.jenis_event` yang sudah terdaftar.
 * Idempotensi antar-retry menjadi tanggung jawab pemanggil (mis. cek dulu sebelum notify ulang).
 */
export async function notify(userIds: string[], jenis: string, payload: NotifyPayload): Promise<void> {
  const uniqueUserIds = Array.from(new Set(userIds)).filter(Boolean);
  if (!uniqueUserIds.length) return;

  const config = await repo.getEventConfigByJenis(jenis);
  const kanalList = payload.kanal?.length ? payload.kanal : config?.kanal?.length ? config.kanal : ['in_app'];

  const notification = await repo.insertNotification({
    jenis_event: jenis,
    judul: payload.judul,
    isi: payload.isi,
    payload: payload.data ?? null,
    source_type: payload.sourceType ?? null,
    source_id: payload.sourceId ?? null,
  });

  const recipients = uniqueUserIds.flatMap((userId) => kanalList.map((kanal) => ({ userId, kanal })));
  await repo.insertRecipients(notification.id, recipients);
}

// ── notifications inbox ──────────────────────────────────────────────────

export async function listInbox(actor: AuthContext, p: PageParams, f: repo.InboxFilters) {
  return repo.listInboxForUser(actor.userId, p, f);
}

export async function markRead(actor: AuthContext, notificationId: string) {
  const recipient = await repo.getRecipient(notificationId, actor.userId);
  if (!recipient) throw AppError.notFound('Notification not found', 'notification.not_found');
  await repo.markRead(notificationId, actor.userId);
  return { status_dibaca: true };
}

export async function respond(actor: AuthContext, notificationId: string, isiRespons: string) {
  const recipient = await repo.getRecipient(notificationId, actor.userId);
  if (!recipient) throw AppError.notFound('Notification not found', 'notification.not_found');
  await repo.markResponded(notificationId, actor.userId, isiRespons);
  return { status_direspons: true };
}

// ── reminders ────────────────────────────────────────────────────────────

export async function listMyReminders(actor: AuthContext, p: PageParams) {
  return repo.listRemindersForUser(actor.userId, p);
}

export async function monitorReminders(p: PageParams) {
  return repo.monitorReminders(p);
}

export async function createReminder(actor: AuthContext, input: CreateReminderInput) {
  const { id } = await repo.insertReminder({
    sumber: input.sumber,
    source_id: input.source_id ?? null,
    judul: input.judul,
    deskripsi: input.deskripsi ?? null,
    jatuh_tempo: input.jatuh_tempo,
    pengulangan: input.pengulangan,
    aturan_eskalasi: input.aturan_eskalasi ?? null,
    created_by: actor.userId,
  });
  await repo.insertReminderTracking(id, input.penerima);
  await recordAudit({
    userId: actor.userId,
    module: 'notifikasi',
    action: 'create_reminder',
    entity: 'reminders',
    entityId: id,
    after: { sumber: input.sumber, judul: input.judul, penerima: input.penerima.length },
  });
  return { id };
}

export async function markReminderRead(actor: AuthContext, reminderId: string) {
  const tracking = await repo.getReminderTracking(reminderId, actor.userId);
  if (!tracking) throw AppError.notFound('Reminder not found', 'reminder.not_found');
  await repo.markReminderRead(reminderId, actor.userId);
  return { status_dibaca: true };
}

export async function respondReminder(actor: AuthContext, reminderId: string, isiRespons: string) {
  const tracking = await repo.getReminderTracking(reminderId, actor.userId);
  if (!tracking) throw AppError.notFound('Reminder not found', 'reminder.not_found');
  await repo.markReminderResponded(reminderId, actor.userId, actor.userId, isiRespons);
  return { status_direspons: true };
}

// ── announcements ────────────────────────────────────────────────────────

export async function listAnnouncements(p: PageParams) {
  return repo.listAnnouncements(p);
}

export async function createAnnouncement(actor: AuthContext, input: CreateAnnouncementInput) {
  const { id } = await repo.insertAnnouncement({
    judul: input.judul,
    isi: input.isi,
    segmen: input.segmen,
    tanggal_mulai: input.tanggal_mulai ?? new Date().toISOString(),
    tanggal_selesai: input.tanggal_selesai ?? null,
    is_aktif: input.is_aktif,
    dibuat_oleh: actor.userId,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'notifikasi',
    action: 'create_announcement',
    entity: 'announcements',
    entityId: id,
    after: { judul: input.judul, segmen: input.segmen },
  });
  return { id };
}

// ── messages (inbox) ─────────────────────────────────────────────────────

export async function listMessages(actor: AuthContext, p: PageParams, f: repo.MessageFilters) {
  return repo.listInboxMessages(actor.userId, p, f);
}

export async function sendMessage(actor: AuthContext, input: CreateMessageInput) {
  if (input.penerima_user_id === actor.userId) {
    throw AppError.badRequest('You cannot send a message to yourself', 'message.cannot_message_self');
  }
  const { id } = await repo.insertMessage({
    pengirim_user_id: actor.userId,
    penerima_user_id: input.penerima_user_id,
    subjek: input.subjek ?? null,
    isi: input.isi,
    parent_message_id: input.parent_message_id ?? null,
  });
  return { id };
}

export async function markMessageRead(actor: AuthContext, id: string) {
  const message = await repo.getMessage(id);
  if (!message || (message.penerima_user_id !== actor.userId && !isSuper(actor))) {
    throw AppError.notFound('Message not found', 'message.not_found');
  }
  await repo.markMessageRead(id, message.penerima_user_id);
  return { status_dibaca: true };
}
