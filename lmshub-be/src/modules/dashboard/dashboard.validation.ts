import { z } from 'zod';

/** Filter period opsional (`YYYY-MM-DD`) dipakai beberapa kartu KPI berbasis rentang time. */
export const periodeQuerySchema = z.object({
  from: z.string().date().optional(),
  until: z.string().date().optional(),
});

export type PeriodeQuery = z.infer<typeof periodeQuerySchema>;
