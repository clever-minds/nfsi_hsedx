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
    module: 'notification',
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
  title: string;
  content: string;
  data?: unknown;
  sourceType?: string;
  sourceId?: string;
  channel?: string[];
}

/**
 * Helper dipanggil modul lain untuk mengirim notification in-app (+ fan-out channel lain).
 * `type` merujuk `notification_event_config.event_type` yang sudah terdaftar.
 * Idempotensi antar-retry menjadi tanggung jawab pemanggil (mis. cek dulu sebelum notify ulang).
 */
export async function notify(userIds: string[], type: string, payload: NotifyPayload): Promise<void> {
  const uniqueUserIds = Array.from(new Set(userIds)).filter(Boolean);
  if (!uniqueUserIds.length) return;

  const config = await repo.getEventConfigByJenis(type);
  const channelList = payload.channel?.length ? payload.channel : config?.channel?.length ? config.channel : ['in_app'];

  const notification = await repo.insertNotification({
    event_type: type,
    title: payload.title,
    content: payload.content,
    payload: payload.data ?? null,
    source_type: payload.sourceType ?? null,
    source_id: payload.sourceId ?? null,
  });

  const recipients = uniqueUserIds.flatMap((userId) => channelList.map((channel) => ({ userId, channel })));
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
  return { is_read: true };
}

export async function respond(actor: AuthContext, notificationId: string, isiRespons: string) {
  const recipient = await repo.getRecipient(notificationId, actor.userId);
  if (!recipient) throw AppError.notFound('Notification not found', 'notification.not_found');
  await repo.markResponded(notificationId, actor.userId, isiRespons);
  return { is_responded: true };
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
    source: input.source,
    source_id: input.source_id ?? null,
    title: input.title,
    description: input.description ?? null,
    due_date: input.due_date,
    repetition: input.repetition,
    escalation_rules: input.escalation_rules ?? null,
    created_by: actor.userId,
  });
  await repo.insertReminderTracking(id, input.recipient);
  await recordAudit({
    userId: actor.userId,
    module: 'notification',
    action: 'create_reminder',
    entity: 'reminders',
    entityId: id,
    after: { source: input.source, title: input.title, recipient: input.recipient.length },
  });
  return { id };
}

export async function markReminderRead(actor: AuthContext, reminderId: string) {
  const tracking = await repo.getReminderTracking(reminderId, actor.userId);
  if (!tracking) throw AppError.notFound('Reminder not found', 'reminder.not_found');
  await repo.markReminderRead(reminderId, actor.userId);
  return { is_read: true };
}

export async function respondReminder(actor: AuthContext, reminderId: string, isiRespons: string) {
  const tracking = await repo.getReminderTracking(reminderId, actor.userId);
  if (!tracking) throw AppError.notFound('Reminder not found', 'reminder.not_found');
  await repo.markReminderResponded(reminderId, actor.userId, actor.userId, isiRespons);
  return { is_responded: true };
}

// ── announcements ────────────────────────────────────────────────────────

export async function listAnnouncements(p: PageParams) {
  return repo.listAnnouncements(p);
}

export async function createAnnouncement(actor: AuthContext, input: CreateAnnouncementInput) {
  const { id } = await repo.insertAnnouncement({
    title: input.title,
    content: input.content,
    segment: input.segment,
    start_date: input.start_date ?? new Date().toISOString(),
    end_date: input.end_date ?? null,
    is_active: input.is_active,
    created_by: actor.userId,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'notification',
    action: 'create_announcement',
    entity: 'announcements',
    entityId: id,
    after: { title: input.title, segment: input.segment },
  });
  return { id };
}

// ── messages (inbox) ─────────────────────────────────────────────────────

export async function listMessages(actor: AuthContext, p: PageParams, f: repo.MessageFilters) {
  return repo.listInboxMessages(actor.userId, p, f);
}

export async function sendMessage(actor: AuthContext, input: CreateMessageInput) {
  if (input.recipient_user_id === actor.userId) {
    throw AppError.badRequest('You cannot send a message to yourself', 'message.cannot_message_self');
  }
  const { id } = await repo.insertMessage({
    sender_user_id: actor.userId,
    recipient_user_id: input.recipient_user_id,
    subject: input.subject ?? null,
    content: input.content,
    parent_message_id: input.parent_message_id ?? null,
  });
  return { id };
}

export async function markMessageRead(actor: AuthContext, id: string) {
  const message = await repo.getMessage(id);
  if (!message || (message.recipient_user_id !== actor.userId && !isSuper(actor))) {
    throw AppError.notFound('Message not found', 'message.not_found');
  }
  await repo.markMessageRead(id, message.recipient_user_id);
  return { is_read: true };
}
