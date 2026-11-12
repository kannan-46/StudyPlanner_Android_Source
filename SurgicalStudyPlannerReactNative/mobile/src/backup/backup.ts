import type {MockTest, PlannerDocument, PlannerDraft, PlannerSettings, Revision, Topic} from '../types/planner';
import {DEFAULT_SETTINGS} from '../types/planner';
import {getPlannerNative} from '../planner/nativeAlarms';

const exams = ['MS General Surgery', 'NEET SS', 'Both'] as const;
const testExams = ['MS General Surgery', 'NEET SS'] as const;

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

/** Exports the same shape the old WebView app imports: {topics, settings, tests}. */
export async function exportPlannerBackup(planner: PlannerDocument): Promise<void> {
  const json = JSON.stringify({
    topics: planner.topics,
    settings: planner.settings,
    tests: planner.mockTests,
  }, null, 2);
  await getPlannerNative().exportBackup(json);
}

/** Opens and validates a JSON backup without changing the current cloud planner. */
export async function importPlannerBackup(): Promise<PlannerDraft> {
  const json = await getPlannerNative().importBackup();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new BackupError('This file is not valid JSON. Choose a Surgical Study Planner backup.');
  }
  return parsePlannerBackup(parsed);
}

export function parsePlannerBackup(value: unknown): PlannerDraft {
  if (!isRecord(value)) throw new BackupError('The backup must contain a JSON object.');
  if (!Array.isArray(value.topics)) throw new BackupError('The backup does not contain a topics list.');
  if (!isRecord(value.settings)) throw new BackupError('The backup does not contain valid settings.');

  const settings = parseSettings(value.settings);
  const topics = value.topics.map((topic, index) => parseTopic(topic, index));
  assertUniqueIds(topics.map(topic => topic.id), 'topic');

  const legacyTests = value.tests;
  const currentTests = value.mockTests;
  if (legacyTests !== undefined && currentTests !== undefined) {
    throw new BackupError('The backup contains two mock-test lists. Export it again from the original app.');
  }
  const rawTests = legacyTests !== undefined ? legacyTests : currentTests !== undefined ? currentTests : [];
  if (!Array.isArray(rawTests)) throw new BackupError('The mock-test list is invalid.');
  const mockTests = rawTests.map((test, index) => parseMockTest(test, index));
  assertUniqueIds(mockTests.map(test => test.id), 'mock test');

  return {settings, topics, mockTests};
}

function parseSettings(value: Record<string, unknown>): PlannerSettings {
  const rawIntervals = value.intervals;
  if (!Array.isArray(rawIntervals) || rawIntervals.length < 1 || rawIntervals.length > 20) {
    throw new BackupError('Settings must include between 1 and 20 revision intervals.');
  }
  const intervals = rawIntervals.map((interval, index) => {
    if (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 1 || interval > 999) {
      throw new BackupError(`Settings interval ${index + 1} must be a whole number from 1 to 999.`);
    }
    return interval;
  });
  const time = value.time === undefined ? DEFAULT_SETTINGS.time : value.time;
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new BackupError('The daily reminder time is invalid.');
  }
  const dark = value.dark === undefined ? false : value.dark;
  if (typeof dark !== 'boolean') throw new BackupError('The theme setting is invalid.');
  return {intervals, time, dark};
}

function parseTopic(value: unknown, index: number): Topic {
  if (!isRecord(value)) throw new BackupError(`Topic ${index + 1} is invalid.`);
  const id = requireString(value.id, `Topic ${index + 1} ID`, 128);
  const name = requireString(value.name, `Topic ${index + 1} name`, 240).trim();
  if (!name) throw new BackupError(`Topic ${index + 1} needs a name.`);
  const exam = value.exam;
  if (typeof exam !== 'string' || !exams.includes(exam as (typeof exams)[number])) {
    throw new BackupError(`Topic “${name}” has an unsupported exam.`);
  }
  const subject = optionalString(value.subject, `Topic “${name}” subject`, 200, '');
  const studyDate = requireDate(value.studyDate, `Topic “${name}” study date`);
  const intervals = parseIntervals(value.intervals, `Topic “${name}” intervals`);
  const notes = optionalString(value.notes, `Topic “${name}” notes`, 10_000, '');
  if (!Array.isArray(value.revisions) || value.revisions.length > 100) {
    throw new BackupError(`Topic “${name}” has an invalid revision list.`);
  }
  const revisions = value.revisions.map((revision, revisionIndex) => parseRevision(revision, name, revisionIndex));
  return {id, name, exam: exam as Topic['exam'], subject, studyDate, intervals, notes, revisions};
}

function parseRevision(value: unknown, topicName: string, index: number): Revision {
  if (!isRecord(value)) throw new BackupError(`Revision ${index + 1} for “${topicName}” is invalid.`);
  const day = value.day;
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 999) {
    throw new BackupError(`Revision ${index + 1} for “${topicName}” has an invalid day number.`);
  }
  const date = requireDate(value.date, `Revision ${index + 1} for “${topicName}” date`);
  if (typeof value.done !== 'boolean') {
    throw new BackupError(`Revision ${index + 1} for “${topicName}” has an invalid completion status.`);
  }
  const completedAt = value.completedAt === undefined
    ? undefined
    : requireDate(value.completedAt, `Revision ${index + 1} for “${topicName}” completion date`);
  return {day, date, done: value.done, ...(completedAt ? {completedAt} : {})};
}

function parseMockTest(value: unknown, index: number): MockTest {
  if (!isRecord(value)) throw new BackupError(`Mock test ${index + 1} is invalid.`);
  const id = requireString(value.id, `Mock test ${index + 1} ID`, 128);
  const exam = value.exam;
  if (typeof exam !== 'string' || !testExams.includes(exam as (typeof testExams)[number])) {
    throw new BackupError(`Mock test ${index + 1} has an unsupported exam.`);
  }
  const date = requireDate(value.date, `Mock test ${index + 1} date`);
  const score = requireNumber(value.score, `Mock test ${index + 1} score`, 0, 1_000_000);
  const max = requireNumber(value.max, `Mock test ${index + 1} maximum marks`, 0.000001, 1_000_000);
  if (score > max) throw new BackupError(`Mock test ${index + 1} score cannot exceed its maximum marks.`);
  const note = optionalString(value.note, `Mock test ${index + 1} note`, 500, '');
  const percent = Math.round(score / max * 1_000) / 10;
  return {id, exam: exam as MockTest['exam'], date, score, max, note, percent};
}

function parseIntervals(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new BackupError(`${label} must include between 1 and 20 values.`);
  }
  return value.map((interval, index) => {
    if (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 1 || interval > 999) {
      throw new BackupError(`${label} value ${index + 1} must be a whole number from 1 to 999.`);
    }
    return interval;
  });
}

function requireDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BackupError(`${label} must use the YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BackupError(`${label} is not a real calendar date.`);
  }
  return value;
}

function requireString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum) {
    throw new BackupError(`${label} is missing or too long.`);
  }
  return value;
}

function optionalString(value: unknown, label: string, maximum: number, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || value.length > maximum) {
    throw new BackupError(`${label} must be text with no more than ${maximum} characters.`);
  }
  return value;
}

function requireNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new BackupError(`${label} must be a number from ${minimum} to ${maximum}.`);
  }
  return value;
}

function assertUniqueIds(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new BackupError(`The backup contains duplicate ${label} IDs.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
