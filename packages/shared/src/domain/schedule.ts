import {
  addDays,
  compareDates,
  isLocalDate,
  maxDate,
  type LocalDate,
} from './dates';

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
  const build = () =>
    rebuildSchedule({
      studiedOn: next.studiedOn,
      intervals: next.intervals,
      revisions,
    });
  let result = build();
  // A snooze survives the edit while it is still later than the recomputed
  // date (a snooze never moves a revision earlier). Steps are restored in
  // order and rebuilt each time, so later steps count from the kept date.
  for (let i = 0; i < revisions.length; i++) {
    const rev = revisions[i] as RevisionState;
    if (rev.doneOn !== null) continue;
    const old = current.revisions.find(r => r.step === rev.step)?.dueOverride;
    const rebuilt = result.revisions.find(r => r.step === rev.step);
    if (!old || !rebuilt || !isLocalDate(old)) continue;
    if (compareDates(old, rebuilt.dueOn) > 0) {
      revisions[i] = { ...rev, dueOverride: old };
      result = build();
    }
  }
  return result;
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
  // Snooze only ever pushes a revision later: count from today, or from the
  // current due date when the revision is not due yet.
  const current = rebuildSchedule(input).revisions.find(
    r => r.id === revisionId,
  );
  const base = maxDate(today, current?.dueOn ?? today);
  return patchRevision(input, revisionId, {
    dueOverride: addDays(base, days),
  });
}

/**
 * Undo a snooze: put the next pending revision back on `dueOn`, the date it
 * showed before the snooze (its planned date, or an earlier snooze date).
 * An undo only moves a revision earlier, and never before its planned date
 * (counted from the previous done date or the study date), so a stale or
 * forged date cannot pull the chain back past the move-forward rule.
 */
export function unsnoozeRevision(
  input: ScheduleInput,
  revisionId: string,
  dueOn: LocalDate,
): ScheduleResult {
  assertDate(dueOn, 'dueOn');
  assertFirstPending(input, revisionId);
  const due = (dueOverride: LocalDate | null) =>
    rebuildSchedule({
      ...input,
      revisions: input.revisions.map(r =>
        r.id === revisionId ? { ...r, dueOverride } : r,
      ),
    }).revisions.find(r => r.id === revisionId)?.dueOn as LocalDate;
  const current = due(
    input.revisions.find(r => r.id === revisionId)?.dueOverride ?? null,
  );
  const planned = due(null);
  if (compareDates(dueOn, current) > 0) {
    fail('VALIDATION_FAILED', `dueOn cannot be after ${current}`);
  }
  if (compareDates(dueOn, planned) < 0) {
    fail('VALIDATION_FAILED', `dueOn cannot be before ${planned}`);
  }
  return patchRevision(input, revisionId, {
    dueOverride: dueOn === planned ? null : dueOn,
  });
}
