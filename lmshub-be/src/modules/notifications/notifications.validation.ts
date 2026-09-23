import { z } from 'zod';

/** Kanal notifikasi kanonik (domain 00). */
export const kanalEnum = z.enum(['in_app', 'email', 'whatsapp', 'push']);

// ── notification_event_config (admin) ──────────────────────────────────────
export const updateEventConfigSchema = z.object({
  nama: z.string().min(2).max(150).optional(),
  deskripsi: z.string().max(2000).nullable().optional(),
  role_penerima: z.array(z.string()).optional(),
  kanal: z.array(kanalEnum).optional(),
  template_judul: z.string().min(1).optional(),
  template_isi: z.string().min(1).optional(),
  butuh_respons: z.boolean().optional(),
  is_kritikal: z.boolean().optional(),
  is_aktif: z.boolean().optional(),
});

// ── notifications ────────────────────────────────────────────────────────
export const respondNotificationSchema = z.object({
  isi_respons: z.string().min(1).max(2000),
});

// ── reminders ────────────────────────────────────────────────────────────
export const createReminderSchema = z.object({
  sumber: z.enum(['jadwal_live', 'tenggat_tugas', 'tagihan', 'lainnya']),
  source_id: z.string().uuid().optional(),
  judul: z.string().min(2).max(200),
  deskripsi: z.string().max(2000).optional(),
  jatuh_tempo: z.string().datetime(),
  pengulangan: z.enum(['tidak', 'harian', 'mingguan', 'bulanan']).default('tidak'),
  aturan_eskalasi: z
    .object({
      batas_jam: z.number().int().positive(),
      eskalasi_ke: z.string().min(1),
      maks_level: z.number().int().positive().default(1),
    })
    .optional(),
  penerima: z.array(z.string().uuid()).min(1, 'At least one recipient is required'),
});

export const respondReminderSchema = z.object({
  isi_respons: z.string().min(1).max(2000),
});

// ── announcements ────────────────────────────────────────────────────────
export const createAnnouncementSchema = z
  .object({
    judul: z.string().min(2).max(200),
    isi: z.string().min(1),
    segmen: z
      .object({
        role: z.array(z.string()).optional(),
        course_id: z.string().uuid().optional(),
        cohort_id: z.string().uuid().optional(),
      })
      .refine((s) => !!(s.role?.length || s.course_id || s.cohort_id), {
        message: 'A segment must carry an explicit filter (role/course_id/cohort_id)',
      }),
    tanggal_mulai: z.string().datetime().optional(),
    tanggal_selesai: z.string().datetime().nullable().optional(),
    is_aktif: z.boolean().default(true),
  })
  .refine(
    (d) => !d.tanggal_selesai || !d.tanggal_mulai || new Date(d.tanggal_selesai) >= new Date(d.tanggal_mulai),
    { message: 'tanggal_selesai must be later than tanggal_mulai', path: ['tanggal_selesai'] },
  );

// ── messages (inbox) ─────────────────────────────────────────────────────
export const createMessageSchema = z.object({
  penerima_user_id: z.string().uuid(),
  subjek: z.string().max(200).optional(),
  isi: z.string().min(1),
  parent_message_id: z.string().uuid().optional(),
});

export type UpdateEventConfigInput = z.infer<typeof updateEventConfigSchema>;
export type RespondNotificationInput = z.infer<typeof respondNotificationSchema>;
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type RespondReminderInput = z.infer<typeof respondReminderSchema>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
