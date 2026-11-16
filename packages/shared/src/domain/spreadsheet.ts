import { z } from 'zod';
import { addDays, compareDates, isLocalDate, type LocalDate } from './dates';
import { intervalsSchema, nameKey } from '../schemas/common';
import { DEFAULT_SETTINGS, type Settings } from '../schemas/settings';
import {
  BACKUP_FORMAT_V1,
  BACKUP_MAX_TOPICS,
  backupV1Schema,
} from '../schemas/backup';

// Turns the sheets of a spreadsheet (read on the phone, every cell as text)
// into topics with their revision history, ready to import as a backup.

/** One sheet as the phone read it: every cell as text, '' when empty. */
export interface SpreadsheetSheet {
  name: string;
  /** rows[0] is spreadsheet row 1; cells[0] is column A. */
  rows: string[][];
  /** True when the sheet had more rows than the phone reads. */
  truncated?: boolean;
}

export interface SpreadsheetFile {
  fileName: string;
  sheets: SpreadsheetSheet[];
}

/** One topic found in the sheet. */
export interface SpreadsheetTopic {
  subject: string;
  name: string;
  studiedOn: LocalDate;
  intervals: number[];
  /** Indexed by step - 1: the day that revision was done, or null. */
  doneOn: (LocalDate | null)[];
  notes: string;
  /** The spreadsheet row the topic starts on (1-based). */
  row: number;
}

/** A spreadsheet row (1-based) and a plain sentence about it. */
export interface SpreadsheetRowNote {
  row: number;
  reason: string;
}

export interface SpreadsheetMapping {
  /** The sheet the topics came from; null when no sheet has topics. */
  sheetName: string | null;
  /** 'revisions': one row per revision; 'topics': one row per topic. */
  layout: 'revisions' | 'topics' | null;
  topics: SpreadsheetTopic[];
  /** Rows that were left out, and why. */
  skippedRows: SpreadsheetRowNote[];
  /** Topics that were imported with a change (e.g. done marks left off). */
  notes: SpreadsheetRowNote[];
  /** The sheet had more rows than the phone reads; only the first were used. */
  truncated: boolean;
  stats: {
    topics: number;
    /** Revisions already marked done, over all topics. */
    doneRevisions: number;
    skippedRows: number;
    /** Topic count per subject, in the order they appear in the sheet. */
    subjects: { name: string; topics: number }[];
  };
}

/** Subject for rows with no book or subject. */
export const SPREADSHEET_DEFAULT_SUBJECT = 'General';

const LIMITS = { name: 200, subject: 80, notes: 2000 } as const;
/** Rows searched for the header row, from the top of each sheet. */
const HEADER_SEARCH_ROWS = 30;

type Column =
  | 'topic'
  | 'studied'
  | 'subject'
  | 'interval'
  | 'due'
  | 'status'
  | 'completion'
  | 'notes';

function normHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/[\s_]+/g, ' ')
    .replace(/[\s:.*]+$/, '')
    .trim();
}

const HEADER_NAMES: Record<Column, string[]> = {
  topic: [
    'topic',
    'topics',
    'chapter / topic',
    'chapter',
    'topic name',
    'chapter name',
  ],
  studied: [
    'first-reading date',
    'first reading date',
    'studied on',
    'studied',
    'date read',
    'study date',
    'studied date',
    'date studied',
  ],
  subject: ['book', 'subject', 'book name', 'subject name'],
  interval: [
    'interval (days)',
    'interval',
    'interval days',
    'gap',
    'gap (days)',
    'revision interval',
  ],
  due: ['revision due date', 'due date', 'due on', 'due'],
  status: ['status', 'revision status'],
  completion: [
    'completion date',
    'done on',
    'completed on',
    'date completed',
    'completed date',
  ],
  notes: ['notes', 'note', 'source note'],
};

const HEADER_LOOKUP = new Map<string, Column>(
  (Object.keys(HEADER_NAMES) as Column[]).flatMap(col =>
    HEADER_NAMES[col].map(h => [normHeader(h), col] as [string, Column]),
  ),
);

type Header = { rowIndex: number; cols: Partial<Record<Column, number>> };

/** The first row near the top that names a topic and a studied date. */
function findHeader(rows: string[][]): Header | null {
  const end = Math.min(rows.length, HEADER_SEARCH_ROWS);
  for (let r = 0; r < end; r++) {
    const cols: Partial<Record<Column, number>> = {};
    (rows[r] ?? []).forEach((cell, c) => {
      const col = HEADER_LOOKUP.get(normHeader(cell ?? ''));
      if (col !== undefined && cols[col] === undefined) cols[col] = c;
    });
    if (cols.topic !== undefined && cols.studied !== undefined) {
      return { rowIndex: r, cols };
    }
  }
  return null;
}

function cleanSpaces(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

// ---------- dates ----------

/** Plausible study dates only, so a stray small number is not a date. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2099;

function inRange(d: LocalDate): boolean {
  const y = Number(d.slice(0, 4));
  return y >= MIN_YEAR && y <= MAX_YEAR;
}

/**
 * An Excel date serial (1900 date system) as a LocalDate, by whole-day
 * arithmetic only: 1 is 1900-01-01 and 46342 is 2026-11-16. Excel counts a
 * 29 February 1900 that never existed (serial 60), so it has no date. Any
 * time of day (the fraction) is ignored.
 */
export function excelSerialToLocalDate(serial: number): LocalDate | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  if (whole < 1 || whole === 60 || whole > 2_958_465) return null;
  return addDays(whole < 60 ? '1899-12-31' : '1899-12-30', whole);
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

function monthOf(word: string): number | null {
  const w = word.toLowerCase();
  if (w.length < 3) return null;
  const i = MONTHS.indexOf(w.slice(0, 3));
  if (i < 0) return null;
  // The whole word must be a month name or its start (e.g. "sept").
  const full = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ][i] as string;
  return full.startsWith(w) || w === 'sept' ? i + 1 : null;
}

function makeDate(y: number, m: number, d: number): LocalDate | null {
  const s = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isLocalDate(s) && inRange(s) ? s : null;
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * A date cell as a LocalDate, or null. Accepts Excel serials (as the phone
 * reads them) and text dates: 2026-11-16, 16/11/2026 (day first unless that
 * is impossible, as in 11/16/2026), 16-Nov-2026, 16 November 2026 and
 * Nov 16, 2026. A time after the date is ignored.
 */
export function parseSpreadsheetDate(value: string): LocalDate | null {
  const s = cleanSpaces(value).replace(
    /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i,
    '',
  );
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const d = excelSerialToLocalDate(Number(s));
    return d && inRange(d) ? d : null;
  }
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s);
  if (m) return makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:\s.*)?$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(m[3] as string);
    // Day first, as written in India and the UK; 11/16/2026 can only be
    // month first.
    return a <= 12 && b > 12 ? makeDate(y, a, b) : makeDate(y, b, a);
  }
  m =
    /^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]*([a-z]+)[\s\-/.,]*(\d{4}|\d{2})$/i.exec(
      s,
    );
  if (m) {
    const month = monthOf(m[2] as string);
    return month
      ? makeDate(fullYear(m[3] as string), month, Number(m[1]))
      : null;
  }
  m = /^([a-z]+)[\s\-/.]*(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]+(\d{4})$/i.exec(s);
  if (m) {
    const month = monthOf(m[1] as string);
    return month ? makeDate(Number(m[3]), month, Number(m[2])) : null;
  }
  return null;
}

// ---------- other cells ----------

/** Whole days, e.g. "4", "4.0" (how numbers are stored) or "4 days". */
function parseInterval(value: string): number | null {
  const m = /^(\d+)(?:\.0+)?\s*(?:days?|d)?$/i.exec(cleanSpaces(value));
  return m ? Number(m[1]) : null;
}

const DONE_WORDS = new Set([
  'done',
  'completed',
  'complete',
  'yes',
  'y',
  'true',
  'revised',
  'finished',
  '✓',
  '✔',
  '✔️',
  '☑',
  '☑️',
  '✅',
]);

function saysDone(value: string): boolean {
  return DONE_WORDS.has(cleanSpaces(value).toLowerCase());
}

// ---------- mapping ----------

function topicKey(subject: string, name: string): string {
  return `${nameKey(subject)}|${nameKey(name)}`;
}

function validIntervals(intervals: number[] | undefined): number[] {
  return intervals && intervalsSchema.safeParse(intervals).success
    ? intervals
    : DEFAULT_SETTINGS.intervals;
}

type RowStart = {
  rowNo: number;
  name: string;
  subject: string;
  studiedOn: LocalDate;
  notes: string;
};

/**
 * The checks every data row gets: a topic name, a book within the limits
 * and a first-reading date. Returns the reason to skip the row instead.
 */
function readRowStart(
  row: string[],
  rowNo: number,
  cols: Header['cols'],
): RowStart | string {
  const cell = (c: number | undefined) =>
    c === undefined ? '' : (row[c] ?? '');
  const name = cleanSpaces(cell(cols.topic));
  if (!name) return 'No topic name';
  if (name.length > LIMITS.name) {
    return `Topic name is longer than ${LIMITS.name} characters`;
  }
  const subject =
    cleanSpaces(cell(cols.subject)) || SPREADSHEET_DEFAULT_SUBJECT;
  if (subject.length > LIMITS.subject) {
    return `Book name is longer than ${LIMITS.subject} characters`;
  }
  const rawDate = cleanSpaces(cell(cols.studied));
  const studiedOn = parseSpreadsheetDate(rawDate);
  if (!studiedOn) {
    return rawDate
      ? `First-reading date "${rawDate.slice(0, 40)}" isn't a date`
      : 'No first-reading date';
  }
  const notes = cell(cols.notes).trim().slice(0, LIMITS.notes);
  return { rowNo, name, subject, studiedOn, notes };
}

const isBlank = (row: string[]) => row.every(c => !c || !c.trim());

const LIMIT_REASON = `Over the ${String(BACKUP_MAX_TOPICS).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}-topic limit`;

/**
 * Finds the topics in a workbook. A sheet with one row per revision (it has
 * an interval column) is preferred, so revisions already done come across;
 * otherwise a sheet with one row per topic is used with `intervals` (the
 * user's usual gaps). Rows that cannot be used are listed with a reason.
 * Future first-reading dates are kept.
 */
export function mapSpreadsheet(
  sheets: SpreadsheetSheet[],
  opts: { today?: LocalDate; intervals?: number[] } = {},
): SpreadsheetMapping {
  const defaults = validIntervals(opts.intervals);
  const found = sheets
    .map(sheet => ({ sheet, header: findHeader(sheet.rows) }))
    .filter(
      (f): f is { sheet: SpreadsheetSheet; header: Header } =>
        f.header !== null,
    );
  const chosen =
    found.find(f => f.header.cols.interval !== undefined) ?? found[0];
  if (!chosen) {
    return {
      sheetName: null,
      layout: null,
      topics: [],
      skippedRows: [],
      notes: [],
      truncated: false,
      stats: { topics: 0, doneRevisions: 0, skippedRows: 0, subjects: [] },
    };
  }
  const { sheet, header } = chosen;
  const layout = header.cols.interval !== undefined ? 'revisions' : 'topics';
  const result =
    layout === 'revisions'
      ? mapRevisionRows(sheet, header, defaults, opts.today)
      : mapTopicRows(sheet, header, defaults);

  const subjects = new Map<string, { name: string; topics: number }>();
  for (const t of result.topics) {
    const key = nameKey(t.subject);
    const s = subjects.get(key) ?? { name: t.subject, topics: 0 };
    s.topics++;
    subjects.set(key, s);
  }
  return {
    sheetName: sheet.name,
    layout,
    topics: result.topics,
    skippedRows: result.skippedRows,
    notes: result.notes,
    truncated: sheet.truncated === true,
    stats: {
      topics: result.topics.length,
      doneRevisions: result.topics.reduce(
        (n, t) => n + t.doneOn.filter(d => d !== null).length,
        0,
      ),
      skippedRows: result.skippedRows.length,
      subjects: [...subjects.values()],
    },
  };
}

type Mapped = Pick<SpreadsheetMapping, 'topics' | 'skippedRows' | 'notes'>;

function mapTopicRows(
  sheet: SpreadsheetSheet,
  header: Header,
  intervals: number[],
): Mapped {
  const out: Mapped = { topics: [], skippedRows: [], notes: [] };
  const seen = new Map<string, number>();
  for (let r = header.rowIndex + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    if (isBlank(row)) continue;
    const rowNo = r + 1;
    const start = readRowStart(row, rowNo, header.cols);
    if (typeof start === 'string') {
      out.skippedRows.push({ row: rowNo, reason: start });
      continue;
    }
    const key = topicKey(start.subject, start.name);
    const first = seen.get(key);
    if (first !== undefined) {
      out.skippedRows.push({
        row: rowNo,
        reason: `Same topic as row ${first}; the first one was kept`,
      });
      continue;
    }
    if (out.topics.length >= BACKUP_MAX_TOPICS) {
      out.skippedRows.push({ row: rowNo, reason: LIMIT_REASON });
      continue;
    }
    seen.set(key, rowNo);
    out.topics.push({
      subject: start.subject,
      name: start.name,
      studiedOn: start.studiedOn,
      intervals,
      doneOn: intervals.map(() => null),
      notes: start.notes,
      row: rowNo,
    });
  }
  return out;
}

type RevisionRow = {
  rowNo: number;
  done: boolean;
  completion: LocalDate | null;
  due: LocalDate | null;
};

type Group = RowStart & { revisions: Map<number, RevisionRow> };

function mapRevisionRows(
  sheet: SpreadsheetSheet,
  header: Header,
  defaults: number[],
  today: LocalDate | undefined,
): Mapped {
  const out: Mapped = { topics: [], skippedRows: [], notes: [] };
  const { cols } = header;
  const cell = (row: string[], c: number | undefined) =>
    c === undefined ? '' : (row[c] ?? '');
  const groups = new Map<string, Group>();
  for (let r = header.rowIndex + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    if (isBlank(row)) continue;
    const rowNo = r + 1;
    const start = readRowStart(row, rowNo, cols);
    if (typeof start === 'string') {
      out.skippedRows.push({ row: rowNo, reason: start });
      continue;
    }
    const rawInterval = cleanSpaces(cell(row, cols.interval));
    const interval = parseInterval(rawInterval);
    if (interval === null) {
      out.skippedRows.push({
        row: rowNo,
        reason: rawInterval
          ? `Interval "${rawInterval.slice(0, 20)}" isn't a whole number of days`
          : 'No interval',
      });
      continue;
    }
    if (interval < 1 || interval > 999) {
      out.skippedRows.push({
        row: rowNo,
        reason: 'Interval must be between 1 and 999 days',
      });
      continue;
    }
    const key = topicKey(start.subject, start.name);
    let group = groups.get(key);
    if (!group) {
      if (groups.size >= BACKUP_MAX_TOPICS) {
        out.skippedRows.push({ row: rowNo, reason: LIMIT_REASON });
        continue;
      }
      group = { ...start, revisions: new Map() };
      groups.set(key, group);
    }
    const twin = group.revisions.get(interval);
    if (twin) {
      out.skippedRows.push({
        row: rowNo,
        reason: `Same revision as row ${twin.rowNo}; the first one was kept`,
      });
      continue;
    }
    const completion = parseSpreadsheetDate(cell(row, cols.completion));
    group.revisions.set(interval, {
      rowNo,
      done: completion !== null || saysDone(cell(row, cols.status)),
      completion,
      due: parseSpreadsheetDate(cell(row, cols.due)),
    });
  }

  for (const g of groups.values()) {
    const base = {
      subject: g.subject,
      name: g.name,
      studiedOn: g.studiedOn,
      notes: g.notes,
      row: g.rowNo,
    };
    const intervals = [...g.revisions.keys()].sort((a, b) => a - b);
    if (!intervalsSchema.safeParse(intervals).success) {
      out.notes.push({
        row: g.rowNo,
        reason: `"${g.name}" has more than 20 revisions, so your usual gaps were used and none are marked done`,
      });
      out.topics.push({
        ...base,
        intervals: defaults,
        doneOn: defaults.map(() => null),
      });
      continue;
    }
    const doneOn = intervals.map(iv => {
      const rev = g.revisions.get(iv) as RevisionRow;
      if (!rev.done) return null;
      if (rev.completion) return rev.completion;
      // Marked done without a date: the day it was due, but never later
      // than today.
      const due = rev.due ?? addDays(g.studiedOn, iv);
      return today && compareDates(due, today) > 0 ? today : due;
    });
    const inOrder = doneMarksInOrder(g.studiedOn, doneOn);
    if (!inOrder) {
      out.notes.push({
        row: g.rowNo,
        reason: `"${g.name}": the revisions marked done are out of order, so they were imported as not done yet`,
      });
    }
    out.topics.push({
      ...base,
      intervals,
      doneOn: inOrder ? doneOn : intervals.map(() => null),
    });
  }
  return out;
}

/**
 * True when the done revisions come first (no done after a pending one) and
 * each was done no earlier than the reading or the revision before it.
 */
function doneMarksInOrder(
  studiedOn: LocalDate,
  doneOn: (LocalDate | null)[],
): boolean {
  let floor = studiedOn;
  let pendingSeen = false;
  for (const d of doneOn) {
    if (d === null) {
      pendingSeen = true;
      continue;
    }
    if (pendingSeen || compareDates(d, floor) < 0) return false;
    floor = d;
  }
  return true;
}

// ---------- import as a backup ----------

/** A short stable hash (53 bits, hex) of a string. */
function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Longest legacyId a backup accepts. */
const MAX_KEY = 128;

/**
 * The stable key a spreadsheet topic is imported under (its legacyId), so
 * importing the same sheet again adds nothing: "xlsx:" + subject + "|" +
 * topic, compared without case or extra spaces. Long names end in a hash to
 * stay within 128 characters.
 */
export function spreadsheetTopicKey(subject: string, name: string): string {
  const body = topicKey(subject, name);
  const key = `xlsx:${body}`;
  if (key.length <= MAX_KEY) return key;
  return `xlsx:${body.slice(0, 100)}#${hash53(body)}`;
}

/**
 * Splits topics into those not in the app yet and those that are (same
 * subject and topic name, ignoring case and extra spaces).
 */
export function splitExistingTopics(
  topics: SpreadsheetTopic[],
  existing: { subject: string; name: string }[],
): { fresh: SpreadsheetTopic[]; existing: SpreadsheetTopic[] } {
  const have = new Set(existing.map(e => topicKey(e.subject, e.name)));
  const fresh: SpreadsheetTopic[] = [];
  const already: SpreadsheetTopic[] = [];
  for (const t of topics) {
    (have.has(topicKey(t.subject, t.name)) ? already : fresh).push(t);
  }
  return { fresh, existing: already };
}

export type BackupV1Input = z.input<typeof backupV1Schema>;

/**
 * A v1 backup holding the spreadsheet topics, for a merge import (which
 * never changes settings: `settings` only has to be valid). Topics are
 * linked to `exam` when given (an exam the user already has: the import
 * matches it by name, so no new exam is made).
 */
export function buildSpreadsheetBackup(
  topics: SpreadsheetTopic[],
  opts: {
    exam?: { name: string; examDate: LocalDate | null } | null;
    settings?: Settings;
    exportedAt?: string;
  } = {},
): BackupV1Input {
  const subjectIds = new Map<string, string>();
  const subjects: { id: string; name: string }[] = [];
  const keys = new Set<string>();
  const out: BackupV1Input['topics'] = [];
  for (const t of topics) {
    const legacyId = spreadsheetTopicKey(t.subject, t.name);
    if (keys.has(legacyId)) continue;
    keys.add(legacyId);
    const sKey = nameKey(t.subject);
    let subjectId = subjectIds.get(sKey);
    if (subjectId === undefined) {
      subjectId = `s${subjects.length + 1}`;
      subjectIds.set(sKey, subjectId);
      subjects.push({ id: subjectId, name: t.subject });
    }
    out.push({
      id: `t${out.length + 1}`,
      name: t.name,
      subjectId,
      examIds: opts.exam ? ['e1'] : [],
      studiedOn: t.studiedOn,
      intervals: t.intervals,
      notes: t.notes,
      revisions: t.intervals.map((_, i) => ({
        step: i + 1,
        doneOn: t.doneOn[i] ?? null,
        dueOverride: null,
      })),
      legacyId,
    });
  }
  return {
    format: BACKUP_FORMAT_V1,
    exportedAt: (opts.exportedAt ?? '').slice(0, 64),
    settings: opts.settings ?? DEFAULT_SETTINGS,
    exams: opts.exam
      ? [{ id: 'e1', name: opts.exam.name, examDate: opts.exam.examDate }]
      : [],
    subjects,
    topics: out,
    mockTests: [],
  };
}
