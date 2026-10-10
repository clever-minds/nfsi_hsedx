import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

// ── notification_event_config ───────────────────────────────────────────

export interface EventConfigRow {
  id: string;
  event_type: string;
  name: string;
  description: string | null;
  role_recipient: string[];
  channel: string[];
  template_title: string;
  template_content: string;
  needs_response: boolean;
  is_critical: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listEventConfig(): Promise<EventConfigRow[]> {
  return query<EventConfigRow>(
    `SELECT * FROM notification_event_config WHERE deleted_at IS NULL ORDER BY event_type`,
  );
}

export async function getEventConfigByJenis(jenisEvent: string): Promise<EventConfigRow | null> {
  return queryOne<EventConfigRow>(
    `SELECT * FROM notification_event_config WHERE event_type = $1 AND deleted_at IS NULL`,
    [jenisEvent],
  );
}

export async function updateEventConfig(jenisEvent: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE notification_event_config SET ${set} WHERE event_type = $1`, [
    jenisEvent,
    ...keys.map((k) => fields[k]),
  ]);
}

// ── notifications / notification_recipients ─────────────────────────────

export interface NotificationRow {
  id: string;
  event_type: string;
  title: string;
  content: string;
  payload: unknown;
  source_type: string | null;
  source_id: string | null;
  time: string;
}

export interface NotificationInboxRow extends NotificationRow {
  recipient_id: string;
  channel: string;
  is_read: boolean;
  read_time: string | null;
  is_responded: boolean;
  responded_time: string | null;
  response_content: string | null;
}

export async function insertNotification(data: {
  event_type: string;
  title: string;
  content: string;
  payload: unknown;
  source_type: string | null;
  source_id: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO notifications (event_type, title, content, payload, source_type, source_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      data.event_type,
      data.title,
      data.content,
      data.payload === undefined ? null : JSON.stringify(data.payload),
      data.source_type,
      data.source_id,
    ],
  );
  return row!;
}

export async function insertRecipients(
  notificationId: string,
  recipients: Array<{ userId: string; channel: string }>,
): Promise<void> {
  for (const r of recipients) {
    await query(
      `INSERT INTO notification_recipients (notification_id, user_id, channel)
       VALUES ($1,$2,$3)
       ON CONFLICT (notification_id, user_id, channel) DO NOTHING`,
      [notificationId, r.userId, r.channel],
    );
  }
}

export interface InboxFilters {
  type?: string;
  status?: 'read' | 'belum_read';
}

export async function listInboxForUser(
  userId: string,
  p: PageParams,
  f: InboxFilters,
): Promise<{ rows: NotificationInboxRow[]; total: number }> {
  const where: string[] = ['n.deleted_at IS NULL', 'nr.user_id = $1'];
  const params: unknown[] = [userId];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.type) add('n.event_type = $?', f.type);
  if (f.status === 'read') where.push('nr.is_read = true');
  if (f.status === 'belum_read') where.push('nr.is_read = false');

  const whereSql = where.join(' AND ');
  const rows = await query<NotificationInboxRow>(
    `SELECT n.id, n.event_type, n.title, n.content, n.payload, n.source_type, n.source_id, n.time,
            nr.id AS recipient_id, nr.channel, nr.is_read, nr.read_time,
            nr.is_responded, nr.responded_time, nr.response_content
       FROM notification_recipients nr
       JOIN notifications n ON n.id = nr.notification_id
      WHERE ${whereSql}
      ORDER BY n.time DESC
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM notification_recipients nr JOIN notifications n ON n.id = nr.notification_id WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function getRecipient(notificationId: string, userId: string) {
  return queryOne<{ id: string; is_read: boolean; is_responded: boolean }>(
    `SELECT id, is_read, is_responded FROM notification_recipients
      WHERE notification_id = $1 AND user_id = $2`,
    [notificationId, userId],
  );
}

export async function markRead(notificationId: string, userId: string): Promise<void> {
  await query(
    `UPDATE notification_recipients SET is_read = true, read_time = now(), updated_at = now()
      WHERE notification_id = $1 AND user_id = $2 AND is_read = false`,
    [notificationId, userId],
  );
}

export async function markResponded(notificationId: string, userId: string, isiRespons: string): Promise<void> {
  await query(
    `UPDATE notification_recipients
        SET is_responded = true, responded_time = now(), response_content = $3, updated_at = now(),
            is_read = true, read_time = COALESCE(read_time, now())
      WHERE notification_id = $1 AND user_id = $2`,
    [notificationId, userId, isiRespons],
  );
}

// ── reminders / reminder_tracking ───────────────────────────────────────

export interface ReminderRow {
  id: string;
  source: string;
  source_id: string | null;
  title: string;
  description: string | null;
  due_date: string;
  repetition: string;
  escalation_rules: unknown;
  is_active: boolean;
  next_run_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ReminderTrackingRow {
  id: string;
  reminder_id: string;
  user_id: string;
  is_read: boolean;
  read_time: string | null;
  is_responded: boolean;
  responded_time: string | null;
  response_content: string | null;
  by_user_id: string | null;
  level_escalation: number;
  last_escalation_at: string | null;
}

export async function insertReminder(data: {
  source: string;
  source_id: string | null;
  title: string;
  description: string | null;
  due_date: string;
  repetition: string;
  escalation_rules: unknown;
  created_by: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO reminders (source, source_id, title, description, due_date, repetition, escalation_rules, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      data.source,
      data.source_id,
      data.title,
      data.description,
      data.due_date,
      data.repetition,
      data.escalation_rules === undefined ? null : JSON.stringify(data.escalation_rules),
      data.created_by,
    ],
  );
  return row!;
}

export async function insertReminderTracking(reminderId: string, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await query(
      `INSERT INTO reminder_tracking (reminder_id, user_id) VALUES ($1,$2)
       ON CONFLICT (reminder_id, user_id) DO NOTHING`,
      [reminderId, userId],
    );
  }
}

export async function listRemindersForUser(
  userId: string,
  p: PageParams,
): Promise<{ rows: (ReminderRow & ReminderTrackingRow)[]; total: number }> {
  const rows = await query<ReminderRow & ReminderTrackingRow>(
    `SELECT r.*, rt.id AS tracking_id, rt.is_read, rt.read_time, rt.is_responded,
            rt.responded_time, rt.response_content, rt.by_user_id, rt.level_escalation, rt.last_escalation_at
       FROM reminder_tracking rt
       JOIN reminders r ON r.id = rt.reminder_id AND r.deleted_at IS NULL
      WHERE rt.user_id = $1
      ORDER BY r.due_date DESC
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    [userId],
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM reminder_tracking rt JOIN reminders r ON r.id = rt.reminder_id WHERE rt.user_id = $1 AND r.deleted_at IS NULL`,
    [userId],
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function monitorReminders(p: PageParams): Promise<{ rows: (ReminderRow & ReminderTrackingRow)[]; total: number }> {
  const where = `r.deleted_at IS NULL AND (rt.is_responded = false)`;
  const rows = await query<ReminderRow & ReminderTrackingRow>(
    `SELECT r.*, rt.id AS tracking_id, rt.is_read, rt.read_time, rt.is_responded,
            rt.responded_time, rt.response_content, rt.by_user_id, rt.level_escalation, rt.last_escalation_at
       FROM reminder_tracking rt
       JOIN reminders r ON r.id = rt.reminder_id
      WHERE ${where}
      ORDER BY r.due_date ASC
      LIMIT ${p.limit} OFFSET ${p.offset}`,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM reminder_tracking rt JOIN reminders r ON r.id = rt.reminder_id WHERE ${where}`,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function getReminderTracking(reminderId: string, userId: string): Promise<ReminderTrackingRow | null> {
  return queryOne<ReminderTrackingRow>(
    `SELECT * FROM reminder_tracking WHERE reminder_id = $1 AND user_id = $2`,
    [reminderId, userId],
  );
}

export async function markReminderRead(reminderId: string, userId: string): Promise<void> {
  await query(
    `UPDATE reminder_tracking SET is_read = true, read_time = now(), updated_at = now()
      WHERE reminder_id = $1 AND user_id = $2 AND is_read = false`,
    [reminderId, userId],
  );
}

export async function markReminderResponded(
  reminderId: string,
  userId: string,
  olehUserId: string,
  isiRespons: string,
): Promise<void> {
  await query(
    `UPDATE reminder_tracking
        SET is_responded = true, responded_time = now(), response_content = $3, by_user_id = $4,
            is_read = true, read_time = COALESCE(read_time, now()), updated_at = now()
      WHERE reminder_id = $1 AND user_id = $2`,
    [reminderId, userId, isiRespons, olehUserId],
  );
}

// ── announcements ────────────────────────────────────────────────────────

export interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  segment: unknown;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export async function listAnnouncements(p: PageParams): Promise<{ rows: AnnouncementRow[]; total: number }> {
  const rows = await query<AnnouncementRow>(
    `SELECT * FROM announcements WHERE deleted_at IS NULL
      ORDER BY start_date DESC
      LIMIT ${p.limit} OFFSET ${p.offset}`,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM announcements WHERE deleted_at IS NULL`,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function insertAnnouncement(data: {
  title: string;
  content: string;
  segment: unknown;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_by: string;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO announcements (title, content, segment, start_date, end_date, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      data.title,
      data.content,
      JSON.stringify(data.segment),
      data.start_date,
      data.end_date,
      data.is_active,
      data.created_by,
    ],
  );
  return row!;
}

// ── messages (inbox) ─────────────────────────────────────────────────────

export interface MessageRow {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  subject: string | null;
  content: string;
  is_read: boolean;
  read_time: string | null;
  parent_message_id: string | null;
  created_at: string;
}

export interface MessageFilters {
  read?: boolean;
}

export async function listInboxMessages(
  userId: string,
  p: PageParams,
  f: MessageFilters,
): Promise<{ rows: MessageRow[]; total: number }> {
  const where: string[] = ['m.deleted_at IS NULL', '(m.recipient_user_id = $1 OR m.sender_user_id = $1)'];
  const params: unknown[] = [userId];
  if (f.read !== undefined) {
    params.push(f.read);
    where.push(`m.is_read = $${params.length}`);
  }
  const whereSql = where.join(' AND ');
  const rows = await query<MessageRow>(
    `SELECT * FROM messages m WHERE ${whereSql} ORDER BY m.created_at DESC LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM messages m WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function getMessage(id: string): Promise<MessageRow | null> {
  return queryOne<MessageRow>(`SELECT * FROM messages WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insertMessage(data: {
  sender_user_id: string;
  recipient_user_id: string;
  subject: string | null;
  content: string;
  parent_message_id: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO messages (sender_user_id, recipient_user_id, subject, content, parent_message_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [data.sender_user_id, data.recipient_user_id, data.subject, data.content, data.parent_message_id],
  );
  return row!;
}

export async function markMessageRead(id: string, userId: string): Promise<void> {
  await query(
    `UPDATE messages SET is_read = true, read_time = now(), updated_at = now()
      WHERE id = $1 AND recipient_user_id = $2 AND is_read = false`,
    [id, userId],
  );
}
