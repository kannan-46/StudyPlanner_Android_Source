import { z } from 'zod';
import { nameSchema } from './common';

export const subjectInputSchema = z.object({ name: nameSchema(80) });
export type SubjectInput = z.infer<typeof subjectInputSchema>;
