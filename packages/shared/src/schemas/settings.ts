import { z } from 'zod';
import { intervalsSchema, nameSchema, timeSchema } from './common';

export const settingsSchema = z.object({
  intervals: intervalsSchema,
  reminderTime: timeSchema,
  timezone: z.string().min(1).max(64),
  theme: z.enum(['system', 'light', 'dark']),
  dailyReminder: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  intervals: [4, 7, 15, 30, 60, 90],
  reminderTime: '08:00',
  timezone: 'UTC',
  theme: 'system',
  dailyReminder: true,
};

export const updateMeSchema = z.object({
  name: nameSchema(80).optional(),
  settings: settingsSchema.partial().optional(),
  onboardingCompleted: z.literal(true).optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
