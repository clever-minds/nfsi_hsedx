import { z } from 'zod';

/** Beri/edit review course. Enrollment di-resolve server-side from (user, course). */
export const upsertReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().max(2000).nullable().optional(),
});

export type UpsertReviewInput = z.infer<typeof upsertReviewSchema>;
