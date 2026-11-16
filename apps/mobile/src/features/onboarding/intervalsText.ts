import { intervalsSchema } from '@planner/shared';

/** One name for the field everywhere: the numbers are days after studying. */
export const INTERVALS_LABEL = 'Revision days (after studying)';
export const INTERVALS_HINT =
  'Separate the days with commas, spaces or dots, like 4, 7, 15';

export const WHOLE_NUMBERS_MESSAGE = 'Use whole numbers like 4, 7, 15';

/**
 * Revision days typed as text ("4, 7, 15"). Commas, spaces, dots, dashes,
 * slashes or semicolons separate the numbers (the same as the topic form),
 * since Android number keyboards often lack a comma. Range and order are
 * checked by the shared intervals rules, with their plain messages.
 */
export function parseIntervalsText(text: string): {
  value?: number[];
  error?: string;
} {
  const parts = text.split(/[\s,.;/-]+/).filter(Boolean);
  const nums = parts.map(Number);
  if (parts.length === 0 || nums.some(n => !Number.isInteger(n))) {
    return { error: WHOLE_NUMBERS_MESSAGE };
  }
  const r = intervalsSchema.safeParse(nums);
  return r.success
    ? { value: r.data }
    : { error: r.error.issues[0]?.message ?? WHOLE_NUMBERS_MESSAGE };
}
