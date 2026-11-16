import {
  BACKUP_MAX_UPLOAD_BYTES,
  localToday,
  tooLargeProblem,
  type BackupImportResult,
  type BackupProblem,
  type LegacyOverflows,
  type LocalDate,
  type ParsedBackup,
} from '@planner/shared';
import { ApiError, userMessage } from '../../shared/api/errors';
import { formatDate } from '../../shared/lib/format';
import { BACKUP_TOO_LARGE } from '../../native/backupFiles';

// Plain-English wording for backup export and import.

/** The picker could not read the file for a reason other than its size. */
export const FILE_READ_FAILED_TEXT = "Couldn't read the backup file";

/** The file is over the size the app reads or the server accepts. */
export const TOO_LARGE_TEXT = tooLargeProblem().description;

/** A failure after the file was read and checked, not from the server. */
export const IMPORT_FAILED_TEXT =
  "Couldn't finish the import — check your topics, then try again";

/** Status lines shown under the buttons while a backup action runs. */
export const BACKUP_STATUS = {
  exporting: 'Preparing your backup…',
  merging: 'Importing your backup…',
  replacing: 'Replacing your data…',
  savedThenReplacing: 'Backup saved. Replacing your data…',
} as const;

/** 5000 -> '5,000' without Intl, which Hermes may lack. */
const withCommas = (n: number) =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** "1 topic", "3 topics", "1,200 topics". */
export function count(n: number, word: string): string {
  return `${withCommas(n)} ${n === 1 ? word : `${word}s`}`;
}

/** "a", "a and b", "a, b and c". */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** What is in a picked backup file, for the import dialogs. */
export type BackupSummary = {
  kind: 'v1' | 'legacy';
  topics: number;
  mockTests: number;
  /** The day the backup was made (v1 files), or null when unknown. */
  exportedOn: LocalDate | null;
};

export function backupSummary(parsed: ParsedBackup): BackupSummary {
  if (parsed.kind === 'v1') {
    const t = Date.parse(parsed.data.exportedAt);
    return {
      kind: 'v1',
      topics: parsed.data.topics.length,
      mockTests: parsed.data.mockTests.length,
      // From the phone's local date parts, never toISOString.
      exportedOn: Number.isNaN(t) ? null : localToday(new Date(t)),
    };
  }
  const mocks = parsed.data.mockTests ?? parsed.data.tests ?? [];
  return {
    kind: 'legacy',
    topics: parsed.data.topics.length,
    mockTests: mocks.length,
    exportedOn: null,
  };
}

/**
 * "Backup from 12 Nov: 312 topics, 4 mock tests" or "Backup from the old
 * app: 40 topics, 2 mock tests".
 */
export function summaryText(
  s: BackupSummary,
  today: LocalDate = localToday(),
): string {
  const contents = `${count(s.topics, 'topic')}, ${count(
    s.mockTests,
    'mock test',
  )}`;
  if (s.kind === 'legacy') return `Backup from the old app: ${contents}`;
  return s.exportedOn
    ? `Backup from ${formatDate(s.exportedOn, today)}: ${contents}`
    : `This backup: ${contents}`;
}

/** How many topic names are listed before "and N more". */
const LISTED_NAMES = 3;

/**
 * A warning for an old-app backup whose text is longer than this app keeps,
 * or null when nothing will be shortened.
 */
export function overflowText(o: LegacyOverflows): {
  text: string;
  names: string[];
  more: number;
} | null {
  const topics = o.topics.length;
  const mocks = o.mockTests.length;
  if (topics === 0 && mocks === 0) return null;
  const parts: string[] = [];
  if (topics > 0) {
    parts.push(
      `${count(topics, 'topic')} ${
        topics === 1 ? 'has' : 'have'
      } text longer than this app keeps (notes 2,000, topic names 200, subjects 80 characters).`,
    );
  }
  if (mocks > 0) {
    parts.push(
      `${count(mocks, 'mock test')} ${
        mocks === 1 ? 'has a note' : 'have notes'
      } longer than 1,000 characters.`,
    );
  }
  parts.push(
    'Only the first part is imported. Keep this backup file so you can copy the rest.',
  );
  const names = o.topics.slice(0, LISTED_NAMES).map(t => t.name);
  return { text: parts.join(' '), names, more: topics - names.length };
}

/** UTF-8 size of a string in bytes (what the request body will weigh). */
export function utf8Length(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      // A surrogate pair is one 4-byte character.
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * True when the import request for `data` would be larger than the server
 * can receive, so it is refused on the phone before uploading.
 */
export function tooLargeToUpload(
  data: unknown,
  mode: 'merge' | 'replace' = 'replace',
): boolean {
  return utf8Length(JSON.stringify({ mode, data })) > BACKUP_MAX_UPLOAD_BYTES;
}

/** The message for a file the picker could not read (null: cancelled). */
export function pickErrorMessage(e: unknown): string | null {
  const code = (e as { code?: string } | null)?.code;
  if (code === 'E_CANCELLED') return null;
  if (code === BACKUP_TOO_LARGE) return TOO_LARGE_TEXT;
  return FILE_READ_FAILED_TEXT;
}

function firstProblem(details: unknown): BackupProblem | null {
  const first: unknown = Array.isArray(details) ? details[0] : null;
  if (
    typeof first === 'object' &&
    first !== null &&
    typeof (first as { description?: unknown }).description === 'string'
  ) {
    return first as BackupProblem;
  }
  return null;
}

/** The message for a failed import request. */
export function importErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return IMPORT_FAILED_TEXT;
  const problem = firstProblem(e.details);
  if (e.status === 413) return problem?.description ?? TOO_LARGE_TEXT;
  if (e.code === 'BACKUP_INVALID' || e.code === 'LIMIT_EXCEEDED') {
    if (problem) return problem.description;
  }
  return userMessage(e, 'backup');
}

/** The message after a successful import, from every count the server sent. */
export function importResultMessage(
  r: BackupImportResult,
  mode: 'merge' | 'replace',
): string {
  const { topics, mockTests, exams, subjects } = r.imported;
  const main: string[] = [];
  if (topics > 0) main.push(count(topics, 'topic'));
  if (mockTests > 0) main.push(count(mockTests, 'mock test'));
  const extra: string[] = [];
  if (exams > 0) extra.push(count(exams, 'exam'));
  if (subjects > 0) extra.push(count(subjects, 'subject'));

  const sentences: string[] = [];
  if (mode === 'replace') {
    sentences.push(
      main.length > 0
        ? `Your data was replaced with the backup: ${joinAnd(main)}.`
        : 'Your data was replaced with the backup. It had no topics or mock tests.',
    );
    sentences.push('Your settings were restored from the backup too.');
  } else if (main.length === 0 && extra.length === 0) {
    sentences.push(
      'Nothing new to add — everything in this file is already in your planner.',
    );
  } else {
    const added = main.length > 0 ? joinAnd(main) : joinAnd(extra);
    const plus =
      main.length > 0 && extra.length > 0 ? ` (plus ${joinAnd(extra)})` : '';
    sentences.push(`Added ${added}${plus}.`);
    const skipped: string[] = [];
    if (r.skipped.topics > 0) skipped.push(count(r.skipped.topics, 'topic'));
    const skippedMocks = r.skipped.mockTests ?? 0;
    if (skippedMocks > 0) skipped.push(count(skippedMocks, 'mock test'));
    if (skipped.length > 0) {
      const total = r.skipped.topics + skippedMocks;
      sentences.push(
        `${joinAnd(skipped)} ${
          total === 1 ? 'was' : 'were'
        } already in your planner.`,
      );
    }
  }
  const shortTopics = r.shortened?.topics ?? 0;
  const shortMocks = r.shortened?.mockTests ?? 0;
  if (shortTopics > 0 || shortMocks > 0) {
    const cut: string[] = [];
    if (shortTopics > 0) cut.push(count(shortTopics, 'topic'));
    if (shortMocks > 0) cut.push(count(shortMocks, 'mock test'));
    sentences.push(
      `${joinAnd(
        cut,
      )} had text shortened to fit this app. Keep your backup file to see the full text.`,
    );
  }
  return sentences.join(' ');
}
