import { z } from 'zod';

export const createTemplateSchema = z.object({
  name: z.string().min(2).max(150),
  description: z.string().max(2000).optional(),
  layout: z.record(z.unknown()),
  category_id: z.string().uuid().optional(),
  course_id: z.string().uuid().optional(),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  description: z.string().max(2000).nullable().optional(),
  layout: z.record(z.unknown()).optional(),
  category_id: z.string().uuid().nullable().optional(),
  course_id: z.string().uuid().nullable().optional(),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const issueSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const exceptionIssueSchema = z.object({
  enrollment_id: z.string().uuid(),
  template_id: z.string().uuid().optional(),
  reason: z.string().min(5).max(1000),
});

export const revokeSchema = z.object({
  reason: z.string().min(3).max(1000),
});

export const reissueSchema = z.object({
  reason: z.string().min(3).max(1000),
});

export const createBadgeSchema = z.object({
  kode: z.string().min(2).max(60),
  name: z.string().min(2).max(150),
  description: z.string().max(2000).optional(),
  criteria: z.record(z.unknown()),
  icon_url: z.string().max(500).optional(),
  is_active: z.boolean().default(true),
});

export const awardBadgeSchema = z.object({
  user_id: z.string().uuid(),
  course_id: z.string().uuid().optional(),
});

export const awardPointsSchema = z.object({
  user_id: z.string().uuid(),
  type: z.enum(['earn', 'spend']),
  amount: z.number().int().positive(),
  source_type: z.enum(['lesson_progress', 'quiz_attempt', 'streak', 'badge', 'manual_admin']).optional(),
  source_id: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
});

export const leaderboardSnapshotSchema = z.object({
  period_type: z.enum(['weekly', 'monthly', 'all_time']),
  period_start: z.string().date(),
  period_finish: z.string().date(),
  course_id: z.string().uuid().optional(),
  limit: z.number().int().positive().max(500).default(100),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type IssueInput = z.infer<typeof issueSchema>;
export type ExceptionIssueInput = z.infer<typeof exceptionIssueSchema>;
export type RevokeInput = z.infer<typeof revokeSchema>;
export type ReissueInput = z.infer<typeof reissueSchema>;
export type CreateBadgeInput = z.infer<typeof createBadgeSchema>;
export type AwardBadgeInput = z.infer<typeof awardBadgeSchema>;
export type AwardPointsInput = z.infer<typeof awardPointsSchema>;
export type LeaderboardSnapshotInput = z.infer<typeof leaderboardSnapshotSchema>;
