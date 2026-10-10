import { z } from 'zod';

/** Kanal notification kanonik (domain 00). */
export const channelEnum = z.enum(['in_app', 'email', 'whatsapp', 'push']);

// ── notification_event_config (admin) ──────────────────────────────────────
export const updateEventConfigSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  description: z.string().max(2000).nullable().optional(),
  role_recipient: z.array(z.string()).optional(),
  channel: z.array(channelEnum).optional(),
  template_title: z.string().min(1).optional(),
  template_content: z.string().min(1).optional(),
  needs_response: z.boolean().optional(),
  is_critical: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

// ── notifications ────────────────────────────────────────────────────────
export const respondNotificationSchema = z.object({
  response_content: z.string().min(1).max(2000),
});

// ── reminders ────────────────────────────────────────────────────────────
export const createReminderSchema = z.object({
  source: z.enum(['live_schedule', 'assignment_deadline', 'invoice', 'other']),
  source_id: z.string().uuid().optional(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  due_date: z.string().datetime(),
  repetition: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
  escalation_rules: z
    .object({
      batas_jam: z.number().int().positive(),
      escalation_to: z.string().min(1),
      maks_level: z.number().int().positive().default(1),
    })
    .optional(),
  recipient: z.array(z.string().uuid()).min(1, 'At least one recipient is required'),
});

export const respondReminderSchema = z.object({
  response_content: z.string().min(1).max(2000),
});

// ── announcements ────────────────────────────────────────────────────────
export const createAnnouncementSchema = z
  .object({
    title: z.string().min(2).max(200),
    content: z.string().min(1),
    segment: z
      .object({
        role: z.array(z.string()).optional(),
        course_id: z.string().uuid().optional(),
        cohort_id: z.string().uuid().optional(),
      })
      .refine((s) => !!(s.role?.length || s.course_id || s.cohort_id), {
        message: 'A segmentt must carry an explicit filter (role/course_id/cohort_id)',
      }),
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().nullable().optional(),
    is_active: z.boolean().default(true),
  })
  .refine(
    (d) => !d.end_date || !d.start_date || new Date(d.end_date) >= new Date(d.start_date),
    { message: 'end_date must be later than start_date', path: ['end_date'] },
  );

// ── messages (inbox) ─────────────────────────────────────────────────────
export const createMessageSchema = z.object({
  recipient_user_id: z.string().uuid(),
  subject: z.string().max(200).optional(),
  content: z.string().min(1),
  parent_message_id: z.string().uuid().optional(),
});

export type UpdateEventConfigInput = z.infer<typeof updateEventConfigSchema>;
export type RespondNotificationInput = z.infer<typeof respondNotificationSchema>;
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type RespondReminderInput = z.infer<typeof respondReminderSchema>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
