import { z } from 'zod';

/** Beri/ubah ulasan kursus. Enrollment di-resolve server-side dari (user, course). */
export const upsertReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  ulasan: z.string().max(2000).nullable().optional(),
});

export type UpsertReviewInput = z.infer<typeof upsertReviewSchema>;
