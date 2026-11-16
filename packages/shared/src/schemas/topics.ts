import { z } from 'zod';
import {
  intervalsSchema,
  localDateSchema,
  nameSchema,
  objectIdSchema,
} from './common';

export const topicCreateSchema = z.object({
  name: nameSchema(200),
  subjectId: objectIdSchema,
  examIds: z.array(objectIdSchema).max(10).default([]),
  studiedOn: localDateSchema,
  intervals: intervalsSchema.optional(),
  notes: z.string().max(2000).default(''),
});
export type TopicCreateInput = z.infer<typeof topicCreateSchema>;

// Update fields have no defaults: omitted keys must stay omitted.
export const topicUpdateSchema = z
  .object({
    name: nameSchema(200),
    subjectId: objectIdSchema,
    examIds: z.array(objectIdSchema).max(10),
    studiedOn: localDateSchema,
    intervals: intervalsSchema,
    notes: z.string().max(2000),
  })
  .partial()
  .refine(o => Object.values(o).some(v => v !== undefined), {
    message: 'At least one field is required',
  });
export type TopicUpdateInput = z.infer<typeof topicUpdateSchema>;

export const topicListQuerySchema = z.object({
  examId: objectIdSchema.optional(),
  subjectId: objectIdSchema.optional(),
  q: z.string().max(100).optional(),
  status: z.enum(['active', 'completed']).optional(),
});
export type TopicListQuery = z.infer<typeof topicListQuerySchema>;

export const completeRevisionSchema = z.object({ doneOn: localDateSchema });
export type CompleteRevisionInput = z.infer<typeof completeRevisionSchema>;

export const snoozeRevisionSchema = z.object({
  today: localDateSchema,
  days: z.number().int().min(1).max(30).default(1),
});
export type SnoozeRevisionInput = z.infer<typeof snoozeRevisionSchema>;

/** The date the revision showed before the snooze being undone. */
export const unsnoozeRevisionSchema = z.object({ dueOn: localDateSchema });
export type UnsnoozeRevisionInput = z.infer<typeof unsnoozeRevisionSchema>;
