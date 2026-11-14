import { z } from 'zod';
import { localDateSchema, nameSchema, objectIdSchema } from './common';

const scoreIssue = {
  message: 'Score cannot exceed max score',
  path: ['score'],
};

export const mockTestInputSchema = z
  .object({
    title: nameSchema(120),
    takenOn: localDateSchema,
    score: z.number().min(0, "Score can't be negative"),
    maxScore: z.number().gt(0, 'Max score must be more than 0'),
    examId: objectIdSchema.nullable().optional(),
    notes: z.string().max(1000).default(''),
  })
  .refine(d => d.score <= d.maxScore, scoreIssue);
export type MockTestInput = z.infer<typeof mockTestInputSchema>;

// Update fields have no defaults: omitted keys must stay omitted.
export const mockTestUpdateSchema = z
  .object({
    title: nameSchema(120),
    takenOn: localDateSchema,
    score: z.number().min(0, "Score can't be negative"),
    maxScore: z.number().gt(0, 'Max score must be more than 0'),
    examId: objectIdSchema.nullable(),
    notes: z.string().max(1000),
  })
  .partial()
  .refine(
    d =>
      d.score === undefined ||
      d.maxScore === undefined ||
      d.score <= d.maxScore,
    scoreIssue,
  );
export type MockTestUpdate = z.infer<typeof mockTestUpdateSchema>;
