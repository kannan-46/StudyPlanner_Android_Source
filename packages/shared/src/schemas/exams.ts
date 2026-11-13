import { z } from 'zod';
import { localDateSchema, nameSchema } from './common';

export const examInputSchema = z.object({
  name: nameSchema(80),
  examDate: localDateSchema.nullable().optional(),
});
export type ExamInput = z.infer<typeof examInputSchema>;

export const examUpdateSchema = examInputSchema.partial();
export type ExamUpdate = z.infer<typeof examUpdateSchema>;
