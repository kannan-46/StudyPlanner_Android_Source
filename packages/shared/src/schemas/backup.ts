import { z } from 'zod';
import { compareDates, isLocalDate } from '../domain/dates';
import { settingsSchema } from './settings';
import {
  intervalsSchema,
  localDateSchema,
  nameSchema,
  timeSchema,
} from './common';

export const BACKUP_FORMAT_V1 = 'studyplanner.backup.v1';

const fileIdSchema = z.string().min(1).max(128);

function addDuplicateIssues(
  ctx: z.RefinementCtx,
  ids: string[],
  path: string,
): void {
  const seen = new Set<string>();
  ids.forEach((id, i) => {
    if (seen.has(id)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate id ${id}`,
        path: [path, i, 'id'],
      });
    }
    seen.add(id);
  });
}

// ---------- v1 ----------

const v1RevisionSchema = z.object({
  step: z.number().int().min(1).max(20),
  doneOn: localDateSchema.nullable(),
  dueOverride: localDateSchema.nullable(),
});

const v1TopicSchema = z
  .object({
    id: fileIdSchema,
    name: nameSchema(200),
    subjectId: fileIdSchema,
    examIds: z.array(fileIdSchema).max(10),
    studiedOn: localDateSchema,
    intervals: intervalsSchema,
    notes: z.string().max(2000),
    revisions: z.array(v1RevisionSchema).max(20),
    legacyId: fileIdSchema.optional(),
  })
  .superRefine((t, ctx) => {
    const revs = [...t.revisions].sort((a, b) => a.step - b.step);
    const stepsOk =
      revs.length === t.intervals.length &&
      revs.every((r, i) => r.step === i + 1);
    if (!stepsOk) {
      ctx.addIssue({
        code: 'custom',
        message: 'Revisions must have one step per interval',
        path: ['revisions'],
      });
      return;
    }
    let floor = t.studiedOn;
    let pendingSeen = false;
    for (const r of revs) {
      if (r.doneOn === null) {
        pendingSeen = true;
        continue;
      }
      if (pendingSeen || compareDates(r.doneOn, floor) < 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Completed revisions must be in order',
          path: ['revisions'],
        });
        return;
      }
      floor = r.doneOn;
    }
  });

const v1MockTestSchema = z
  .object({
    id: fileIdSchema,
    title: nameSchema(120),
    takenOn: localDateSchema,
    score: z.number().min(0),
    maxScore: z.number().gt(0),
    examId: fileIdSchema.nullable(),
    notes: z.string().max(1000),
  })
  .refine(m => m.score <= m.maxScore, {
    message: 'Score cannot exceed max score',
    path: ['score'],
  });

export const backupV1Schema = z
  .object({
    format: z.literal(BACKUP_FORMAT_V1),
    exportedAt: z.string().max(64),
    settings: settingsSchema,
    exams: z.array(
      z.object({
        id: fileIdSchema,
        name: nameSchema(80),
        examDate: localDateSchema.nullable(),
      }),
    ),
    subjects: z.array(z.object({ id: fileIdSchema, name: nameSchema(80) })),
    topics: z.array(v1TopicSchema),
    mockTests: z.array(v1MockTestSchema),
  })
  .superRefine((b, ctx) => {
    addDuplicateIssues(
      ctx,
      b.exams.map(e => e.id),
      'exams',
    );
    addDuplicateIssues(
      ctx,
      b.subjects.map(s => s.id),
      'subjects',
    );
    addDuplicateIssues(
      ctx,
      b.topics.map(t => t.id),
      'topics',
    );
    addDuplicateIssues(
      ctx,
      b.mockTests.map(m => m.id),
      'mockTests',
    );
    const legacyIds = b.topics.map(t => t.legacyId ?? t.id);
    if (new Set(legacyIds).size !== legacyIds.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate topic legacyId',
        path: ['topics'],
      });
    }
    const exams = new Set(b.exams.map(e => e.id));
    const subjects = new Set(b.subjects.map(s => s.id));
    b.topics.forEach((t, i) => {
      if (!subjects.has(t.subjectId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Unknown subjectId',
          path: ['topics', i, 'subjectId'],
        });
      }
      t.examIds.forEach((e, j) => {
        if (!exams.has(e)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Unknown examId',
            path: ['topics', i, 'examIds', j],
          });
        }
      });
    });
    b.mockTests.forEach((m, i) => {
      if (m.examId !== null && !exams.has(m.examId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Unknown examId',
          path: ['mockTests', i, 'examId'],
        });
      }
    });
  });
export type BackupV1 = z.infer<typeof backupV1Schema>;
export type BackupV1Topic = BackupV1['topics'][number];

// ---------- legacy (old WebView and RN apps) ----------

export const LEGACY_EXAMS = ['MS General Surgery', 'NEET SS'] as const;
const legacyExamSchema = z.enum(['MS General Surgery', 'NEET SS', 'Both']);

/** Old ids were strings; tolerate numeric ids from hand-edited files. */
const legacyIdSchema = z
  .union([z.string().min(1).max(128), z.number()])
  .transform(String);

/** Missing, null or non-text values become ''; long text is truncated. */
const lenientText = (max: number) =>
  z
    .unknown()
    .optional()
    .transform(v => (typeof v === 'string' ? v.slice(0, max) : ''));

const legacyRevisionSchema = z.object({
  day: z.number().int().min(1).max(999),
  date: localDateSchema,
  done: z.boolean(),
  // Lenient: keep the date part of a timestamp, drop anything unusable.
  completedAt: z
    .unknown()
    .optional()
    .transform(v =>
      typeof v === 'string' && isLocalDate(v.slice(0, 10))
        ? v.slice(0, 10)
        : undefined,
    ),
});

const legacyTopicSchema = z.object({
  id: legacyIdSchema,
  name: z
    .string()
    .transform(s => s.trim().replace(/\s+/g, ' ').slice(0, 200))
    .pipe(z.string().min(1, 'Required')),
  exam: legacyExamSchema,
  subject: lenientText(80),
  studyDate: localDateSchema,
  intervals: z.array(z.number()).max(100),
  notes: lenientText(2000),
  revisions: z.array(legacyRevisionSchema).max(100),
});

const legacyMockSchema = z
  .object({
    id: legacyIdSchema,
    exam: legacyExamSchema,
    date: localDateSchema,
    score: z.number().min(0),
    max: z.number().gt(0),
    note: lenientText(1000),
  })
  .refine(m => m.score <= m.max, {
    message: 'Score cannot exceed max',
    path: ['score'],
  });
export type LegacyMock = z.infer<typeof legacyMockSchema>;

export const legacyBackupSchema = z
  .object({
    topics: z.array(legacyTopicSchema),
    settings: z.object({
      intervals: z.array(z.number()).max(100),
      time: timeSchema.optional(),
      dark: z.boolean().optional(),
    }),
    tests: z.array(legacyMockSchema).optional(),
    mockTests: z.array(legacyMockSchema).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.tests !== undefined && b.mockTests !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'The backup contains two mock-test lists',
        path: ['mockTests'],
      });
    }
    addDuplicateIssues(
      ctx,
      b.topics.map(t => t.id),
      'topics',
    );
  });
export type LegacyBackup = z.infer<typeof legacyBackupSchema>;
export type LegacyTopic = LegacyBackup['topics'][number];

export type ParsedBackup =
  { kind: 'v1'; data: BackupV1 } | { kind: 'legacy'; data: LegacyBackup };

/** Throws a ZodError when the value is neither a v1 nor a legacy backup. */
export function parseBackup(value: unknown): ParsedBackup {
  const isV1 = typeof value === 'object' && value !== null && 'format' in value;
  if (isV1) return { kind: 'v1', data: backupV1Schema.parse(value) };
  return { kind: 'legacy', data: legacyBackupSchema.parse(value) };
}

export const backupImportSchema = z.object({
  mode: z.enum(['merge', 'replace']),
  data: z.unknown(),
});
export type BackupImportInput = z.infer<typeof backupImportSchema>;

export interface BackupImportResult {
  imported: {
    exams: number;
    subjects: number;
    topics: number;
    mockTests: number;
  };
  skipped: { topics: number };
}
