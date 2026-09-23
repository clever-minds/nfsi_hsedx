import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

// ── notification_event_config ───────────────────────────────────────────

export interface EventConfigRow {
  id: string;
  jenis_event: string;
  nama: string;
  deskripsi: string | null;
  role_penerima: string[];
  kanal: string[];
  template_judul: string;
  template_isi: string;
  butuh_respons: boolean;
  is_kritikal: boolean;
  is_aktif: boolean;
  created_at: string;
  updated_at: string;
}

export async function listEventConfig(): Promise<EventConfigRow[]> {
  return query<EventConfigRow>(
    `SELECT * FROM notification_event_config WHERE deleted_at IS NULL ORDER BY jenis_event`,
  );
}

export async function getEventConfigByJenis(jenisEvent: string): Promise<EventConfigRow | null> {
  return queryOne<EventConfigRow>(
    `SELECT * FROM notification_event_config WHERE jenis_event = $1 AND deleted_at IS NULL`,
    [jenisEvent],
  );
}

export async function updateEventConfig(jenisEvent: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE notification_event_config SET ${set} WHERE jenis_event = $1`, [
    jenisEvent,
    ...keys.map((k) => fields[k]),
  ]);
}

// ── notifications / notification_recipients ─────────────────────────────

export interface NotificationRow {
  id: string;
  jenis_event: string;
  judul: string;
  isi: string;
  payload: unknown;
  source_type: string | null;
  source_id: string | null;
  waktu: string;
}

export interface NotificationInboxRow extends NotificationRow {
  recipient_id: string;
  kanal: string;
  status_dibaca: boolean;
  waktu_dibaca: string | null;
  status_direspons: boolean;
  waktu_direspons: string | null;
  isi_respons: string | null;
}

export async function insertNotification(data: {
  jenis_event: string;
  judul: string;
  isi: string;
  payload: unknown;
  source_type: string | null;
  source_id: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO notifications (jenis_event, judul, isi, payload, source_type, source_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      data.jenis_event,
      data.judul,
      data.isi,
      data.payload === undefined ? null : JSON.stringify(data.payload),
      data.source_type,
      data.source_id,
    ],
  );
  return row!;
}

export async function insertRecipients(
  notificationId: string,
  recipients: Array<{ userId: string; kanal: string }>,
): Promise<void> {
  for (const r of recipients) {
    await query(
      `INSERT INTO notification_recipients (notification_id, user_id, kanal)
       VALUES ($1,$2,$3)
       ON CONFLICT (notification_id, user_id, kanal) DO NOTHING`,
      [notificationId, r.userId, r.kanal],
    );
  }
}

export interface InboxFilters {
  jenis?: string;
  status?: 'dibaca' | 'belum_dibaca';
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
  if (f.jenis) add('n.jenis_event = $?', f.jenis);
  if (f.status === 'dibaca') where.push('nr.status_dibaca = true');
  if (f.status === 'belum_dibaca') where.push('nr.status_dibaca = false');

  const whereSql = where.join(' AND ');
  const rows = await query<NotificationInboxRow>(
    `SELECT n.id, n.jenis_event, n.judul, n.isi, n.payload, n.source_type, n.source_id, n.waktu,
            nr.id AS recipient_id, nr.kanal, nr.status_dibaca, nr.waktu_dibaca,
            nr.status_direspons, nr.waktu_direspons, nr.isi_respons
       FROM notification_recipients nr
       JOIN notifications n ON n.id = nr.notification_id
      WHERE ${whereSql}
      ORDER BY n.waktu DESC
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
  return queryOne<{ id: string; status_dibaca: boolean; status_direspons: boolean }>(
    `SELECT id, status_dibaca, status_direspons FROM notification_recipients
      WHERE notification_id = $1 AND user_id = $2`,
    [notificationId, userId],
  );
}

export async function markRead(notificationId: string, userId: string): Promise<void> {
  await query(
    `UPDATE notification_recipients SET status_dibaca = true, waktu_dibaca = now(), updated_at = now()
      WHERE notification_id = $1 AND user_id = $2 AND status_dibaca = false`,
    [notificationId, userId],
  );
}

export async function markResponded(notificationId: string, userId: string, isiRespons: string): Promise<void> {
  await query(
    `UPDATE notification_recipients
        SET status_direspons = true, waktu_direspons = now(), isi_respons = $3, updated_at = now(),
            status_dibaca = true, waktu_dibaca = COALESCE(waktu_dibaca, now())
      WHERE notification_id = $1 AND user_id = $2`,
    [notificationId, userId, isiRespons],
  );
}

// ── reminders / reminder_tracking ───────────────────────────────────────

export interface ReminderRow {
  id: string;
  sumber: string;
  source_id: string | null;
  judul: string;
  deskripsi: string | null;
  jatuh_tempo: string;
  pengulangan: string;
  aturan_eskalasi: unknown;
  is_aktif: boolean;
  next_run_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ReminderTrackingRow {
  id: string;
  reminder_id: string;
  user_id: string;
  status_dibaca: boolean;
  waktu_dibaca: string | null;
  status_direspons: boolean;
  waktu_direspons: string | null;
  isi_respons: string | null;
  oleh_user_id: string | null;
  level_eskalasi: number;
  terakhir_eskalasi_at: string | null;
}

export async function insertReminder(data: {
  sumber: string;
  source_id: string | null;
  judul: string;
  deskripsi: string | null;
  jatuh_tempo: string;
  pengulangan: string;
  aturan_eskalasi: unknown;
  created_by: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO reminders (sumber, source_id, judul, deskripsi, jatuh_tempo, pengulangan, aturan_eskalasi, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      data.sumber,
      data.source_id,
      data.judul,
      data.deskripsi,
      data.jatuh_tempo,
      data.pengulangan,
      data.aturan_eskalasi === undefined ? null : JSON.stringify(data.aturan_eskalasi),
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
    `SELECT r.*, rt.id AS tracking_id, rt.status_dibaca, rt.waktu_dibaca, rt.status_direspons,
            rt.waktu_direspons, rt.isi_respons, rt.oleh_user_id, rt.level_eskalasi, rt.terakhir_eskalasi_at
       FROM reminder_tracking rt
       JOIN reminders r ON r.id = rt.reminder_id AND r.deleted_at IS NULL
      WHERE rt.user_id = $1
      ORDER BY r.jatuh_tempo DESC
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
  const where = `r.deleted_at IS NULL AND (rt.status_direspons = false)`;
  const rows = await query<ReminderRow & ReminderTrackingRow>(
    `SELECT r.*, rt.id AS tracking_id, rt.status_dibaca, rt.waktu_dibaca, rt.status_direspons,
            rt.waktu_direspons, rt.isi_respons, rt.oleh_user_id, rt.level_eskalasi, rt.terakhir_eskalasi_at
       FROM reminder_tracking rt
       JOIN reminders r ON r.id = rt.reminder_id
      WHERE ${where}
      ORDER BY r.jatuh_tempo ASC
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
    `UPDATE reminder_tracking SET status_dibaca = true, waktu_dibaca = now(), updated_at = now()
      WHERE reminder_id = $1 AND user_id = $2 AND status_dibaca = false`,
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
        SET status_direspons = true, waktu_direspons = now(), isi_respons = $3, oleh_user_id = $4,
            status_dibaca = true, waktu_dibaca = COALESCE(waktu_dibaca, now()), updated_at = now()
      WHERE reminder_id = $1 AND user_id = $2`,
    [reminderId, userId, isiRespons, olehUserId],
  );
}

// ── announcements ────────────────────────────────────────────────────────

export interface AnnouncementRow {
  id: string;
  judul: string;
  isi: string;
  segmen: unknown;
  tanggal_mulai: string;
  tanggal_selesai: string | null;
  is_aktif: boolean;
  dibuat_oleh: string | null;
  created_at: string;
}

export async function listAnnouncements(p: PageParams): Promise<{ rows: AnnouncementRow[]; total: number }> {
  const rows = await query<AnnouncementRow>(
    `SELECT * FROM announcements WHERE deleted_at IS NULL
      ORDER BY tanggal_mulai DESC
      LIMIT ${p.limit} OFFSET ${p.offset}`,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM announcements WHERE deleted_at IS NULL`,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function insertAnnouncement(data: {
  judul: string;
  isi: string;
  segmen: unknown;
  tanggal_mulai: string;
  tanggal_selesai: string | null;
  is_aktif: boolean;
  dibuat_oleh: string;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO announcements (judul, isi, segmen, tanggal_mulai, tanggal_selesai, is_aktif, dibuat_oleh)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      data.judul,
      data.isi,
      JSON.stringify(data.segmen),
      data.tanggal_mulai,
      data.tanggal_selesai,
      data.is_aktif,
      data.dibuat_oleh,
    ],
  );
  return row!;
}

// ── messages (inbox) ─────────────────────────────────────────────────────

export interface MessageRow {
  id: string;
  pengirim_user_id: string;
  penerima_user_id: string;
  subjek: string | null;
  isi: string;
  status_dibaca: boolean;
  waktu_dibaca: string | null;
  parent_message_id: string | null;
  created_at: string;
}

export interface MessageFilters {
  dibaca?: boolean;
}

export async function listInboxMessages(
  userId: string,
  p: PageParams,
  f: MessageFilters,
): Promise<{ rows: MessageRow[]; total: number }> {
  const where: string[] = ['m.deleted_at IS NULL', '(m.penerima_user_id = $1 OR m.pengirim_user_id = $1)'];
  const params: unknown[] = [userId];
  if (f.dibaca !== undefined) {
    params.push(f.dibaca);
    where.push(`m.status_dibaca = $${params.length}`);
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
  pengirim_user_id: string;
  penerima_user_id: string;
  subjek: string | null;
  isi: string;
  parent_message_id: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO messages (pengirim_user_id, penerima_user_id, subjek, isi, parent_message_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [data.pengirim_user_id, data.penerima_user_id, data.subjek, data.isi, data.parent_message_id],
  );
  return row!;
}

export async function markMessageRead(id: string, userId: string): Promise<void> {
  await query(
    `UPDATE messages SET status_dibaca = true, waktu_dibaca = now(), updated_at = now()
      WHERE id = $1 AND penerima_user_id = $2 AND status_dibaca = false`,
    [id, userId],
  );
}
