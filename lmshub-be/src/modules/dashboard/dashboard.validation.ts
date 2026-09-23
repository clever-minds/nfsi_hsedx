import { z } from 'zod';

/** Filter periode opsional (`YYYY-MM-DD`) dipakai beberapa kartu KPI berbasis rentang waktu. */
export const periodeQuerySchema = z.object({
  dari: z.string().date().optional(),
  sampai: z.string().date().optional(),
});

export type PeriodeQuery = z.infer<typeof periodeQuerySchema>;
