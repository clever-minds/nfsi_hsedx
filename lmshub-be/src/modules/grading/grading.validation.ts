import { z } from 'zod';

export const rubricScoreSchema = z.object({
  nama: z.string().min(1).max(150),
  skor: z.number().min(0),
  skor_maks: z.number().min(0),
  catatan: z.string().optional(),
});

export const gradeSubmissionSchema = z.object({
  skor: z.number().min(0),
  skor_maksimal: z.number().positive(),
  feedback: z.string().max(4000).nullable().optional(),
  rubrik: z.array(rubricScoreSchema).optional(),
});

export const requestRevisionSchema = z.object({
  catatan: z.string().min(3).max(2000),
});

export const releaseGradeSchema = z.object({
  catatan: z.string().max(500).optional(),
});

export const adjustGradeSchema = z.object({
  skor: z.number().min(0),
  skor_maksimal: z.number().positive().optional(),
  alasan: z.string().min(5).max(1000),
});

export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type RequestRevisionInput = z.infer<typeof requestRevisionSchema>;
export type ReleaseGradeInput = z.infer<typeof releaseGradeSchema>;
export type AdjustGradeInput = z.infer<typeof adjustGradeSchema>;
