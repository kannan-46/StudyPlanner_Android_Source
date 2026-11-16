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
/** Where an imported mock test came from; used to skip it on a re-merge. */
const sourceIdSchema = z.string().min(1).max(512);

/**
 * Size limits for a backup import request. The API accepts up to
 * BACKUP_MAX_BODY_BYTES of decoded JSON (a gzip request body is inflated
 * first). Vercel rejects any request body over 4.5 MB before it reaches the
 * API, so an uncompressed upload must stay within BACKUP_MAX_UPLOAD_BYTES.
 */
export const BACKUP_MAX_BODY_BYTES = 8 * 1024 * 1024;
export const BACKUP_MAX_UPLOAD_BYTES = 4_000_000;
/** The most topics an account can hold; an import may not go past it. */
export const BACKUP_MAX_TOPICS = 5000;

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
    sourceId: sourceIdSchema.optional(),
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
    const subjects = new Set(b.subjects.map(s => s.id));
    b.topics.forEach((t, i) => {
      if (!subjects.has(t.subjectId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Unknown subjectId',
          path: ['topics', i, 'subjectId'],
        });
      }
    });
  })
  // A link to an exam that is not in the file (it was deleted before the
  // export) is dropped instead of rejecting the whole backup.
  .transform(b => {
    const exams = new Set(b.exams.map(e => e.id));
    return {
      ...b,
      topics: b.topics.map(t =>
        t.examIds.every(e => exams.has(e))
          ? t
          : { ...t, examIds: t.examIds.filter(e => exams.has(e)) },
      ),
      mockTests: b.mockTests.map(m =>
        m.examId === null || exams.has(m.examId) ? m : { ...m, examId: null },
      ),
    };
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

/** Collapses spaces the way names are stored, before measuring or cutting. */
function cleanSpaces(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** Like lenientText, but spaces are collapsed before the text is cut. */
const lenientName = (max: number) =>
  z
    .unknown()
    .optional()
    .transform(v =>
      typeof v === 'string' ? cleanSpaces(v).slice(0, max).trim() : '',
    );

/** Text limits of this app that the old apps did not have. */
export const LEGACY_TEXT_LIMITS = {
  topicName: 200,
  subject: 80,
  notes: 2000,
  mockNote: 1000,
} as const;

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
    .transform(s => cleanSpaces(s).slice(0, LEGACY_TEXT_LIMITS.topicName))
    .pipe(z.string().min(1, 'Required')),
  exam: legacyExamSchema,
  subject: lenientName(LEGACY_TEXT_LIMITS.subject),
  studyDate: localDateSchema,
  intervals: z.array(z.number()).max(100),
  notes: lenientText(LEGACY_TEXT_LIMITS.notes),
  revisions: z.array(legacyRevisionSchema).max(100),
});

const legacyMockSchema = z
  .object({
    id: legacyIdSchema,
    exam: legacyExamSchema,
    date: localDateSchema,
    score: z.number().min(0),
    max: z.number().gt(0),
    note: lenientText(LEGACY_TEXT_LIMITS.mockNote),
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

// ---------- problems: why a backup cannot be imported ----------

export type BackupProblemReason =
  /** The file is not readable JSON. */
  | 'BAD_JSON'
  /** Readable, but not a Study Planner backup at all. */
  | 'UNKNOWN_FORMAT'
  /** A Study Planner backup from a newer app version. */
  | 'NEWER_VERSION'
  /** A Study Planner backup with a record that is not valid. */
  | 'INVALID_RECORD'
  /** The request or file is larger than the import accepts. */
  | 'TOO_LARGE'
  /** Importing would go over the topic limit. */
  | 'TOPIC_LIMIT';

/**
 * One reason a backup was not imported. The API sends these as the error
 * `details` of BACKUP_INVALID, LIMIT_EXCEEDED and too-large (413) errors.
 * Nothing is imported when any problem is reported.
 */
export interface BackupProblem {
  reason: BackupProblemReason;
  /** Where in the file, e.g. ['mockTests', 2, 'score']; [] for the file. */
  path: (string | number)[];
  /** Short technical message (the only field older servers sent). */
  message: string;
  /** A plain-English sentence to show the student. */
  description: string;
  /** TOPIC_LIMIT: the limit, topics already saved, topics in the file. */
  limit?: number;
  existing?: number;
  incoming?: number;
  /** TOO_LARGE: the largest accepted size in bytes, when known. */
  limitBytes?: number;
}

const NOTHING_IMPORTED = 'Nothing was imported.';

export function badJsonProblem(): BackupProblem {
  return {
    reason: 'BAD_JSON',
    path: [],
    message: 'Malformed JSON',
    description:
      "This file can't be read as a backup. It may be damaged or not a Study Planner backup.",
  };
}

export function unknownFormatProblem(): BackupProblem {
  return {
    reason: 'UNKNOWN_FORMAT',
    path: [],
    message: 'Not a Study Planner backup',
    description: 'This file is not a Study Planner backup.',
  };
}

export function newerVersionProblem(): BackupProblem {
  return {
    reason: 'NEWER_VERSION',
    path: ['format'],
    message: 'Unsupported backup format',
    description:
      'This backup was made by a newer version of the app. Update the app, then try again.',
  };
}

export function tooLargeProblem(limitBytes?: number): BackupProblem {
  return {
    reason: 'TOO_LARGE',
    path: [],
    message: 'Request body is too large.',
    description: `This backup file is too large to import. ${NOTHING_IMPORTED}`,
    ...(limitBytes === undefined ? {} : { limitBytes }),
  };
}

export function topicLimitProblem(
  existing: number,
  incoming: number,
  limit = BACKUP_MAX_TOPICS,
): BackupProblem {
  return {
    reason: 'TOPIC_LIMIT',
    path: ['topics'],
    message: 'Topic limit exceeded',
    description: `This backup would take you over the ${withCommas(limit)}-topic limit. ${NOTHING_IMPORTED}`,
    limit,
    existing,
    incoming,
  };
}

const FIELD_LABELS: Record<string, string> = {
  name: 'name',
  title: 'title',
  subject: 'subject',
  subjectId: 'subject',
  exam: 'exam',
  examIds: 'exams',
  examId: 'exam',
  examDate: 'exam date',
  studiedOn: 'studied date',
  studyDate: 'studied date',
  takenOn: 'date',
  date: 'date',
  score: 'score',
  maxScore: 'max score',
  max: 'max score',
  notes: 'notes',
  note: 'notes',
  intervals: 'intervals',
  revisions: 'revisions',
  step: 'revision number',
  day: 'revision day',
  doneOn: 'done date',
  completedAt: 'done date',
  dueOverride: 'snoozed date',
  done: 'done mark',
  id: 'id',
  reminderTime: 'reminder time',
  time: 'reminder time',
  dailyReminder: 'reminder setting',
  theme: 'theme',
  exportedAt: 'export date',
  format: 'format',
  settings: 'settings',
  topics: 'topic list',
  mockTests: 'mock test list',
  tests: 'mock test list',
  exams: 'exam list',
  subjects: 'subject list',
};

/** 5000 -> '5,000' without Intl, which Hermes may lack. */
function withCommas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const MESSAGE_CLAUSES: [RegExp, string][] = [
  [/^Score cannot exceed max/, 'the score is higher than the max score'],
  [/^Unknown subjectId$/, 'its subject is missing from the file'],
  [/^Unknown examId$/, 'its exam no longer exists'],
  [/^Duplicate id /, 'it appears twice in the file'],
  [/^Duplicate topic legacyId$/, 'two topics have the same id'],
  [/^Revisions must have one step/, "its revisions don't match its intervals"],
  [
    /^Completed revisions must be in order$/,
    'its done revisions are out of order',
  ],
  [/^The backup contains two mock-test lists$/, 'it has two mock test lists'],
];

function textAt(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = (value as Record<string, unknown>)[key];
  if (typeof v !== 'string') return null;
  const clean = cleanSpaces(v);
  if (!clean) return null;
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
}

function itemLabel(value: unknown, path: (string | number)[]): string {
  const [list, index] = path;
  if (typeof list !== 'string') return 'This backup';
  if (list === 'settings' && path.length > 1) return 'The settings';
  const items =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)[list]
      : undefined;
  if (typeof index !== 'number' || !Array.isArray(items)) return 'This backup';
  const item: unknown = items[index];
  const n = index + 1;
  switch (list) {
    case 'topics': {
      const name = textAt(item, 'name');
      return name ? `Topic "${name}"` : `Topic ${n}`;
    }
    case 'mockTests':
    case 'tests': {
      const title = textAt(item, 'title');
      return title ? `Mock test "${title}"` : `Mock test ${n}`;
    }
    case 'exams': {
      const name = textAt(item, 'name');
      return name ? `Exam "${name}"` : `Exam ${n}`;
    }
    case 'subjects': {
      const name = textAt(item, 'name');
      return name ? `Subject "${name}"` : `Subject ${n}`;
    }
    default:
      return 'This backup';
  }
}

function issueClause(
  issue: { code?: string; message: string; origin?: unknown },
  path: (string | number)[],
): string {
  for (const [re, clause] of MESSAGE_CLAUSES) {
    if (re.test(issue.message)) return clause;
  }
  // The field is the last name in the path below the item itself (a list
  // entry such as ['topics', 3] or the settings object).
  const start = typeof path[1] === 'number' ? 2 : 1;
  const fieldKey = path
    .slice(start)
    .reverse()
    .find((p): p is string => typeof p === 'string');
  const topKey =
    path.length === 1 && typeof path[0] === 'string' ? path[0] : undefined;
  const key = fieldKey ?? topKey;
  if (key === undefined) return 'something in it is not valid';
  const label = FIELD_LABELS[key] ?? 'details';
  if (issue.code === 'too_big' && issue.origin === 'string') {
    return `the ${label} is too long`;
  }
  if (
    (issue.code === 'too_small' && issue.origin === 'string') ||
    (issue.code === 'invalid_type' && /received undefined/.test(issue.message))
  ) {
    return `the ${label} is missing`;
  }
  return `the ${label} is not valid`;
}

/** Keeps the parts of a zod path that JSON can carry. */
export function backupIssuePath(
  path: readonly PropertyKey[],
): (string | number)[] {
  return path.filter(
    (p): p is string | number => typeof p === 'string' || typeof p === 'number',
  );
}

/**
 * Turns one validation issue into a sentence for the student, naming the
 * record, e.g. 'Mock test "GT 3": the score is higher than the max score.
 * Nothing was imported.' `value` is the backup as it was read from the file.
 */
export function describeBackupIssue(
  value: unknown,
  issue: {
    path: readonly PropertyKey[];
    message: string;
    code?: string;
    origin?: unknown;
  },
): string {
  const path = backupIssuePath(issue.path);
  const label = itemLabel(value, path);
  return `${label}: ${issueClause(issue, path)}. ${NOTHING_IMPORTED}`;
}

/** True for an object that claims to be a backup: v1 `format` or `topics`. */
function backupShape(value: unknown): 'v1' | 'newer' | 'legacy' | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const v = value as Record<string, unknown>;
  if ('format' in v) {
    if (v.format === BACKUP_FORMAT_V1) return 'v1';
    return typeof v.format === 'string' &&
      v.format.startsWith('studyplanner.backup.')
      ? 'newer'
      : null;
  }
  return Array.isArray(v.topics) ? 'legacy' : null;
}

export type BackupCheck =
  { ok: true; backup: ParsedBackup } | { ok: false; problems: BackupProblem[] };

/**
 * Like parseBackup, but never throws: it says why a value is not an
 * importable backup (unknown format, newer version, or the bad records).
 */
export function checkBackup(value: unknown): BackupCheck {
  const shape = backupShape(value);
  if (shape === null) return { ok: false, problems: [unknownFormatProblem()] };
  if (shape === 'newer')
    return { ok: false, problems: [newerVersionProblem()] };
  const result =
    shape === 'v1'
      ? backupV1Schema.safeParse(value)
      : legacyBackupSchema.safeParse(value);
  if (result.success) {
    const backup: ParsedBackup =
      shape === 'v1'
        ? { kind: 'v1', data: result.data as BackupV1 }
        : { kind: 'legacy', data: result.data as LegacyBackup };
    return { ok: true, backup };
  }
  return {
    ok: false,
    problems: result.error.issues.map(i => ({
      reason: 'INVALID_RECORD' as const,
      path: backupIssuePath(i.path),
      message: i.message,
      description: describeBackupIssue(value, i),
    })),
  };
}

/** checkBackup for the text of a file; bad JSON is reported, not thrown. */
export function checkBackupText(text: string): BackupCheck {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, problems: [badJsonProblem()] };
  }
  return checkBackup(value);
}

// ---------- old-app text that this app shortens ----------

export type LegacyOverflowField = 'name' | 'subject' | 'notes';

export interface LegacyOverflows {
  /** Topics with text longer than this app keeps; `name` as imported. */
  topics: { id: string; name: string; fields: LegacyOverflowField[] }[];
  /** Mock tests whose note is longer than 1,000 characters. */
  mockTests: { id: string; index: number }[];
}

/**
 * Finds the text in an old-app backup that the import will shorten (topic
 * names over 200, subjects over 80, notes over 2,000, mock test notes over
 * 1,000 characters). Pass the backup as read from the file, not the output
 * of parseBackup, which is already shortened. A v1 file never has any.
 */
export function findLegacyOverflows(value: unknown): LegacyOverflows {
  const out: LegacyOverflows = { topics: [], mockTests: [] };
  if (backupShape(value) !== 'legacy') return out;
  const v = value as Record<string, unknown>;
  const idOf = (x: unknown) =>
    typeof x === 'string' || typeof x === 'number' ? String(x) : '';
  for (const t of v.topics as unknown[]) {
    if (typeof t !== 'object' || t === null) continue;
    const r = t as Record<string, unknown>;
    const fields: LegacyOverflowField[] = [];
    const name = typeof r.name === 'string' ? cleanSpaces(r.name) : '';
    if (name.length > LEGACY_TEXT_LIMITS.topicName) fields.push('name');
    if (
      typeof r.subject === 'string' &&
      cleanSpaces(r.subject).length > LEGACY_TEXT_LIMITS.subject
    ) {
      fields.push('subject');
    }
    if (
      typeof r.notes === 'string' &&
      r.notes.length > LEGACY_TEXT_LIMITS.notes
    ) {
      fields.push('notes');
    }
    if (fields.length > 0) {
      out.topics.push({
        id: idOf(r.id),
        name: name.slice(0, LEGACY_TEXT_LIMITS.topicName),
        fields,
      });
    }
  }
  const mocks = Array.isArray(v.tests)
    ? v.tests
    : Array.isArray(v.mockTests)
      ? v.mockTests
      : [];
  (mocks as unknown[]).forEach((m, index) => {
    if (typeof m !== 'object' || m === null) return;
    const r = m as Record<string, unknown>;
    if (
      typeof r.note === 'string' &&
      r.note.length > LEGACY_TEXT_LIMITS.mockNote
    ) {
      out.mockTests.push({ id: idOf(r.id), index });
    }
  });
  return out;
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
  /**
   * Records already in the account. Older servers omit `mockTests`.
   */
  skipped: { topics: number; mockTests?: number };
  /**
   * Imported records whose text was cut to this app's limits (old-app
   * backups only; v1 backups are never cut). Omitted by older servers.
   */
  shortened?: { topics: number; mockTests: number };
}
