import { z } from 'zod';
import { localDateSchema } from './common';

export const agendaQuerySchema = z.object({
  today: localDateSchema,
  days: z.coerce.number().int().min(1).max(90).default(30),
});
export type AgendaQuery = z.infer<typeof agendaQuerySchema>;

export const statsQuerySchema = z.object({ today: localDateSchema });
export type StatsQuery = z.infer<typeof statsQuerySchema>;
