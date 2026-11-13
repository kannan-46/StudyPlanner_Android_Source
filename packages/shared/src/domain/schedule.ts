import { addDays, compareDates, isLocalDate, type LocalDate } from './dates';

export interface RevisionState {
  id: string;
  /** 1-based index into intervals. */
  step: number;
  dueOn: LocalDate;
  doneOn: LocalDate | null;
  dueOverride: LocalDate | null;
}

export interface ScheduleInput {
  studiedOn: LocalDate;
  intervals: number[];
  revisions: RevisionState[];
}

export interface ScheduleResult {
  revisions: RevisionState[];
  nextDueOn: LocalDate | null;
  status: 'active' | 'completed';
}

export type ScheduleErrorCode =
  'REVISION_NOT_FOUND' | 'REVISION_OUT_OF_ORDER' | 'VALIDATION_FAILED';

export class ScheduleError extends Error {
  constructor(
    public code: ScheduleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScheduleError';
  }
}

function fail(code: ScheduleErrorCode, message: string): never {
  throw new ScheduleError(code, message);
}

function assertDate(value: unknown, label: string): asserts value is LocalDate {
  if (!isLocalDate(value)) fail('VALIDATION_FAILED', `${label} is not a date`);
}

function assertIntervals(intervals: number[]): void {
  if (intervals.length < 1 || intervals.length > 20) {
    fail('VALIDATION_FAILED', 'intervals must have 1-20 entries');
  }
  intervals.forEach((n, i) => {
    if (!Number.isInteger(n) || n < 1 || n > 999) {
      fail('VALIDATION_FAILED', 'intervals must be integers 1-999');
    }
    const prev = intervals[i - 1];
    if (prev !== undefined && n <= prev) {
      fail('VALIDATION_FAILED', 'intervals must be strictly increasing');
    }
  });
}

export function rebuildSchedule(input: ScheduleInput): ScheduleResult {
  assertDate(input.studiedOn, 'studiedOn');
  assertIntervals(input.intervals);
  const sorted = [...input.revisions].sort((a, b) => a.step - b.step);
  const revisions: RevisionState[] = [];
  let base: LocalDate = input.studiedOn;
  for (const rev of sorted) {
    const i = rev.step - 1;
    const interval = input.intervals[i];
    if (interval === undefined) {
      fail('VALIDATION_FAILED', `step ${rev.step} has no interval`);
    }
    const prev = input.intervals[i - 1];
    const gap = prev === undefined ? interval : interval - prev;
    if (rev.doneOn !== null) assertDate(rev.doneOn, 'doneOn');
    if (rev.dueOverride !== null) assertDate(rev.dueOverride, 'dueOverride');
    const dueOn = rev.dueOverride ?? addDays(base, gap);
    revisions.push({ ...rev, dueOn });
    base = rev.doneOn ?? dueOn;
  }
  const next = revisions.find(r => r.doneOn === null);
  return {
    revisions,
    nextDueOn: next ? next.dueOn : null,
    status: next ? 'active' : 'completed',
  };
}

function blankRevision(
  id: string,
  step: number,
  studiedOn: LocalDate,
): RevisionState {
  return { id, step, dueOn: studiedOn, doneOn: null, dueOverride: null };
}

export function createSchedule(
  studiedOn: LocalDate,
  intervals: number[],
  makeId: () => string,
): ScheduleResult {
  assertDate(studiedOn, 'studiedOn');
  assertIntervals(intervals);
  const revisions = intervals.map((_, i) =>
    blankRevision(makeId(), i + 1, studiedOn),
  );
  return rebuildSchedule({ studiedOn, intervals, revisions });
}

export function reconcileSchedule(
  current: ScheduleInput,
  next: { studiedOn: LocalDate; intervals: number[] },
  makeId: () => string,
): ScheduleResult {
  assertDate(next.studiedOn, 'studiedOn');
  assertIntervals(next.intervals);
  const doneCount = current.revisions.filter(r => r.doneOn !== null).length;
  if (next.intervals.length < doneCount) {
    fail(
      'VALIDATION_FAILED',
      'intervals cannot have fewer entries than completed revisions',
    );
  }
  const revisions = next.intervals.map((_, i) => {
    const step = i + 1;
    const existing = current.revisions.find(r => r.step === step);
    if (!existing) return blankRevision(makeId(), step, next.studiedOn);
    return existing.doneOn === null
      ? { ...existing, dueOverride: null }
      : { ...existing };
  });
  return rebuildSchedule({
    studiedOn: next.studiedOn,
    intervals: next.intervals,
    revisions,
  });
}

function bySteps(input: ScheduleInput): RevisionState[] {
  return [...input.revisions].sort((a, b) => a.step - b.step);
}

function findRevision(input: ScheduleInput, id: string): RevisionState {
  const rev = input.revisions.find(r => r.id === id);
  if (!rev) fail('REVISION_NOT_FOUND', `revision ${id} not found`);
  return rev;
}

function assertFirstPending(input: ScheduleInput, id: string): RevisionState {
  const target = findRevision(input, id);
  const first = bySteps(input).find(r => r.doneOn === null);
  if (!first || first.id !== target.id) {
    fail('REVISION_OUT_OF_ORDER', 'revision is not the next pending one');
  }
  return target;
}

function patchRevision(
  input: ScheduleInput,
  id: string,
  patch: Partial<RevisionState>,
): ScheduleResult {
  return rebuildSchedule({
    ...input,
    revisions: input.revisions.map(r => (r.id === id ? { ...r, ...patch } : r)),
  });
}

export function completeRevision(
  input: ScheduleInput,
  revisionId: string,
  doneOn: LocalDate,
): ScheduleResult {
  assertDate(doneOn, 'doneOn');
  const target = assertFirstPending(input, revisionId);
  const prev = bySteps(input)
    .filter(r => r.step < target.step)
    .pop();
  const floor = prev?.doneOn ?? input.studiedOn;
  if (compareDates(doneOn, floor) < 0) {
    fail('VALIDATION_FAILED', `doneOn cannot be before ${floor}`);
  }
  return patchRevision(input, revisionId, { doneOn });
}

export function undoRevision(
  input: ScheduleInput,
  revisionId: string,
): ScheduleResult {
  const target = findRevision(input, revisionId);
  const lastDone = bySteps(input)
    .filter(r => r.doneOn !== null)
    .pop();
  if (target.doneOn === null || !lastDone || lastDone.id !== target.id) {
    fail('REVISION_OUT_OF_ORDER', 'revision is not the latest completed one');
  }
  return rebuildSchedule({
    ...input,
    revisions: input.revisions.map(r => {
      if (r.id === target.id) return { ...r, doneOn: null };
      if (r.step > target.step) return { ...r, dueOverride: null };
      return r;
    }),
  });
}

export function snoozeRevision(
  input: ScheduleInput,
  revisionId: string,
  today: LocalDate,
  days: number,
): ScheduleResult {
  assertDate(today, 'today');
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    fail('VALIDATION_FAILED', 'days must be an integer 1-30');
  }
  assertFirstPending(input, revisionId);
  return patchRevision(input, revisionId, {
    dueOverride: addDays(today, days),
  });
}
