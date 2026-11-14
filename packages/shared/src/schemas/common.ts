import { z } from 'zod';
import { isLocalDate } from '../domain/dates';

export const localDateSchema = z
  .string()
  .refine(isLocalDate, { message: 'Must be a valid date (YYYY-MM-DD)' });
export type LocalDateInput = z.infer<typeof localDateSchema>;

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export type ObjectIdInput = z.infer<typeof objectIdSchema>;

export const nameSchema = (max: number) =>
  z
    .string()
    .transform(s => s.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, 'Required').max(max, `At most ${max} characters`));

const intervalRange = 'Each interval must be between 1 and 999 days';
export const intervalsSchema = z
  .array(
    z
      .number()
      .int('Use whole days, like 4, 7, 15')
      .min(1, intervalRange)
      .max(999, intervalRange),
  )
  .min(1, 'Enter at least one interval, like 4, 7, 15')
  .max(20, 'Use 20 intervals or fewer')
  .refine(a => a.every((v, i) => i === 0 || v > (a[i - 1] ?? 0)), {
    message: 'Intervals must increase, e.g. 4, 7, 15',
  });
export type Intervals = z.infer<typeof intervalsSchema>;

export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');

export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
