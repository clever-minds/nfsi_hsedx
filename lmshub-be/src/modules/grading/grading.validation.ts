import { z } from 'zod';

export const rubricScoreSchema = z.object({
  name: z.string().min(1).max(150),
  score: z.number().min(0),
  score_maks: z.number().min(0),
  notes: z.string().optional(),
});

export const gradeSubmissionSchema = z.object({
  score: z.number().min(0),
  score_maximum: z.number().positive(),
  feedback: z.string().max(4000).nullable().optional(),
  rubrik: z.array(rubricScoreSchema).optional(),
});

export const requestRevisionSchema = z.object({
  notes: z.string().min(3).max(2000),
});

export const releaseGradeSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const adjustGradeSchema = z.object({
  score: z.number().min(0),
  score_maximum: z.number().positive().optional(),
  reason: z.string().min(5).max(1000),
});

export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type RequestRevisionInput = z.infer<typeof requestRevisionSchema>;
export type ReleaseGradeInput = z.infer<typeof releaseGradeSchema>;
export type AdjustGradeInput = z.infer<typeof adjustGradeSchema>;
