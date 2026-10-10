import { z } from 'zod';

export const questionTipeEnum = z.enum([
  'single_choice',
  'multiple_choice',
  'true_false',
  'short_answer',
  'essay',
  'file_upload',
  'matching',
]);

export const tipePengumpulanEnum = z.enum(['file', 'text', 'url', 'mixed']);

export const createQuestionBankSchema = z
  .object({
    name: z.string().min(2).max(150),
    course_id: z.string().uuid().nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .refine((d) => d.course_id || d.category_id, { message: 'Either course_id or category_id is required', path: ['course_id'] });

export const updateQuestionBankSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  description: z.string().max(2000).nullable().optional(),
});

const optionSchema = z.object({
  option_text: z.string().min(1).max(1000),
  is_correct: z.boolean().default(false),
  pair_key: z.string().max(50).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});

export const createQuestionSchema = z.object({
  type: questionTipeEnum,
  question_text: z.string().min(1),
  points: z.number().min(0).default(1),
  answer_explanation: z.string().nullable().optional(),
  meta: z.record(z.unknown()).nullable().optional(),
  options: z.array(optionSchema).default([]),
});

export const updateQuestionSchema = z.object({
  question_text: z.string().min(1).optional(),
  points: z.number().min(0).optional(),
  answer_explanation: z.string().nullable().optional(),
  meta: z.record(z.unknown()).nullable().optional(),
  options: z.array(optionSchema).optional(),
});

export const createQuizSchema = z.object({
  course_id: z.string().uuid(),
  section_id: z.string().uuid().nullable().optional(),
  lesson_id: z.string().uuid().nullable().optional(),
  title: z.string().min(2).max(200),
  description: z.string().nullable().optional(),
  time_limit_minutes: z.number().int().positive().nullable().optional(),
  randomize_questions: z.boolean().default(false),
  randomize_options: z.boolean().default(false),
  /** 0 = tanpa batas percobaan. */
  max_attempts: z.number().int().min(0).max(1000).default(1),
  /** Jeda minimum antar-percobaan, menit (0 = boleh langsung mengulang). Maks. 1 year. */
  retry_delay_minutes: z.number().int().min(0).max(525_600).default(0),
  passing_score: z.number().min(0).max(100).nullable().optional(),
  show_answers_after_completion: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export const updateQuizSchema = createQuizSchema.partial().omit({ course_id: true });

export const setQuizQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question_id: z.string().uuid(),
        sort_order: z.number().int().min(0).default(0),
        points_override: z.number().min(0).nullable().optional(),
      }),
    )
    .min(1),
});

export const createAssignmentSchema = z.object({
  course_id: z.string().uuid(),
  section_id: z.string().uuid().nullable().optional(),
  lesson_id: z.string().uuid().nullable().optional(),
  title: z.string().min(2).max(200),
  instructions: z.string().min(1),
  due_at: z.string().datetime().nullable().optional(),
  submission_type: tipePengumpulanEnum.default('file'),
  max_size_mb: z.number().int().positive().nullable().optional(),
  points_maximum: z.number().min(0).default(100),
  is_active: z.boolean().default(true),
});

export const updateAssignmentSchema = createAssignmentSchema.partial().omit({ course_id: true });

export const upsertRubricSchema = z.object({
  criteria: z
    .array(
      z.object({
        name: z.string().min(1).max(150),
        bobot: z.number().min(0).max(100),
        description_level: z.string().optional(),
      }),
    )
    .min(1),
});

export const saveAnswerSchema = z.object({
  question_id: z.string().uuid(),
  answer: z.unknown(),
});

export const submitAssignmentSchema = z.object({
  text_content: z.string().nullable().optional(),
  file_media_id: z.string().uuid().nullable().optional(),
  url: z.string().url().nullable().optional(),
});

export type CreateQuestionBankInput = z.infer<typeof createQuestionBankSchema>;
export type UpdateQuestionBankInput = z.infer<typeof updateQuestionBankSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
export type SetQuizQuestionsInput = z.infer<typeof setQuizQuestionsSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type UpsertRubricInput = z.infer<typeof upsertRubricSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;
