import { z } from 'zod';

export const createThreadSchema = z.object({
  title: z.string().min(2).max(200),
  content: z.string().min(1).max(10000).optional(),
});

export const createPostSchema = z.object({
  parent_post_id: z.string().uuid().optional(),
  content: z.string().min(1).max(10000),
});

export const createQuestionSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const createAnswerSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const createCommentSchema = z.object({
  target_type: z.enum(['lesson_content', 'discussion_post', 'qa_answer']),
  target_id: z.string().uuid(),
  content: z.string().min(1).max(5000),
});

export const toggleReactionSchema = z.object({
  target_type: z.enum(['discussion_post', 'qa_question', 'qa_answer', 'comment']),
  target_id: z.string().uuid(),
  type: z.enum(['like', 'love', 'wow', 'funny']).default('like'),
});

export const createReportSchema = z.object({
  target_type: z.enum(['discussion_post', 'qa_question', 'qa_answer', 'comment']),
  target_id: z.string().uuid(),
  reason: z.string().min(3).max(1000),
});

export const pinThreadSchema = z.object({
  is_pinned: z.boolean().default(true),
});

export const lockThreadSchema = z.object({
  is_locked: z.boolean().default(true),
});

export const markTerjawabSchema = z.object({
  is_answered: z.boolean().default(true),
});

export const actOnReportSchema = z.object({
  status: z.enum(['reviewed', 'actioned', 'rejected']),
  action: z.enum(['hide', 'delete', 'block_user']).optional(),
  handling_notes: z.string().max(1000).optional(),
}).refine((d) => d.status !== 'actioned' || !!d.action, {
  message: 'An action is required when the status is set to acted-upon',
  path: ['action'],
});

export type PinThreadInput = z.infer<typeof pinThreadSchema>;
export type LockThreadInput = z.infer<typeof lockThreadSchema>;
export type MarkTerjawabInput = z.infer<typeof markTerjawabSchema>;
export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type CreateAnswerInput = z.infer<typeof createAnswerSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ActOnReportInput = z.infer<typeof actOnReportSchema>;
