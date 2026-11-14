import {
  completeRevision,
  createSchedule,
  reconcileSchedule,
  rebuildSchedule,
  snoozeRevision,
  undoRevision,
  type ScheduleInput,
  type ScheduleResult,
} from '../schedule';

const ids = () => {
  let n = 0;
  return () => `r${++n}`;
};
const s_input = (
  s: ScheduleResult,
  studiedOn = '2026-11-01',
  intervals = [4, 7, 15, 30],
): ScheduleInput => ({ studiedOn, intervals, revisions: s.revisions });
const input0 = () =>
  s_input(createSchedule('2026-11-01', [4, 7, 15, 30], ids()));
const dues = (r: ScheduleResult) => r.revisions.map(x => x.dueOn);
const code = (c: string) => expect.objectContaining({ code: c });

describe('schedule', () => {
  it('creates the spec example schedule', () => {
    const s = createSchedule('2026-11-01', [4, 7, 15, 30], ids());
    expect(dues(s)).toEqual([
      '2026-11-05',
      '2026-11-08',
      '2026-11-16',
      '2026-12-01',
    ]);
    expect(s.nextDueOn).toBe('2026-11-05');
    expect(s.status).toBe('active');
  });

  it('moves the chain forward from a late completion (spec 8)', () => {
    const r = completeRevision(input0(), 'r1', '2026-11-12');
    expect(dues(r)).toEqual([
      '2026-11-05',
      '2026-11-15',
      '2026-11-23',
      '2026-12-08',
    ]);
    expect(r.nextDueOn).toBe('2026-11-15');
  });

  it('pulls the chain earlier on early completion', () => {
    const r = completeRevision(input0(), 'r1', '2026-11-03');
    expect(r.revisions[1]!.dueOn).toBe('2026-11-06');
  });

  it('rejects out-of-order complete and undo', () => {
    expect(() => completeRevision(input0(), 'r2', '2026-11-12')).toThrow(
      code('REVISION_OUT_OF_ORDER'),
    );
    const a = completeRevision(input0(), 'r1', '2026-11-05');
    const b = completeRevision(s_input(a), 'r2', '2026-11-08');
    expect(() => undoRevision(s_input(b), 'r1')).toThrow(
      code('REVISION_OUT_OF_ORDER'),
    );
    expect(() => undoRevision(s_input(b), 'r3')).toThrow(
      code('REVISION_OUT_OF_ORDER'),
    );
    const u = undoRevision(s_input(b), 'r2');
    expect(u.revisions[1]!.doneOn).toBeNull();
    expect(u.revisions[0]!.doneOn).toBe('2026-11-05');
  });

  it('rejects completing an already done revision', () => {
    const a = completeRevision(input0(), 'r1', '2026-11-05');
    expect(() => completeRevision(s_input(a), 'r1', '2026-11-06')).toThrow(
      code('REVISION_OUT_OF_ORDER'),
    );
  });

  it('rejects unknown revision ids', () => {
    expect(() => completeRevision(input0(), 'nope', '2026-11-05')).toThrow(
      code('REVISION_NOT_FOUND'),
    );
    expect(() => undoRevision(input0(), 'nope')).toThrow(
      code('REVISION_NOT_FOUND'),
    );
    expect(() => snoozeRevision(input0(), 'nope', '2026-11-05', 1)).toThrow(
      code('REVISION_NOT_FOUND'),
    );
  });

  it('rejects doneOn before the previous completion or study date', () => {
    expect(() => completeRevision(input0(), 'r1', '2026-10-31')).toThrow(
      code('VALIDATION_FAILED'),
    );
    const a = completeRevision(input0(), 'r1', '2026-11-05');
    expect(() => completeRevision(s_input(a), 'r2', '2026-11-04')).toThrow(
      code('VALIDATION_FAILED'),
    );
    expect(() => completeRevision(input0(), 'r1', 'garbage')).toThrow(
      code('VALIDATION_FAILED'),
    );
  });

  it('does not mutate its input', () => {
    const i = input0();
    const copy = JSON.parse(JSON.stringify(i));
    completeRevision(i, 'r1', '2026-11-12');
    expect(i).toEqual(copy);
  });

  it('undo restores the original chain and clears later overrides', () => {
    const a = completeRevision(input0(), 'r1', '2026-11-12');
    const b = snoozeRevision(s_input(a), 'r2', '2026-11-16', 5);
    expect(b.revisions[1]!.dueOverride).toBe('2026-11-21');
    const u = undoRevision(s_input(b), 'r1');
    expect(dues(u)).toEqual([
      '2026-11-05',
      '2026-11-08',
      '2026-11-16',
      '2026-12-01',
    ]);
    expect(u.revisions[1]!.dueOverride).toBeNull();
    expect(u.revisions[0]!.doneOn).toBeNull();
  });

  it('snooze of an overdue revision counts from today', () => {
    const r = snoozeRevision(input0(), 'r1', '2026-11-20', 1);
    expect(r.revisions[0]!.dueOn).toBe('2026-11-21');
    expect(r.revisions[1]!.dueOn).toBe('2026-11-24');
  });

  it('snooze of a revision due today moves it to tomorrow', () => {
    const r = snoozeRevision(input0(), 'r1', '2026-11-05', 1);
    expect(r.revisions[0]!.dueOn).toBe('2026-11-06');
  });

  it('snooze never moves a revision that is not due yet earlier', () => {
    // r1 is due 2026-11-05; snoozing on 2026-11-01 must push it to 11-06.
    const r = snoozeRevision(input0(), 'r1', '2026-11-01', 1);
    expect(r.revisions[0]!.dueOn).toBe('2026-11-06');
    expect(r.revisions[0]!.dueOverride).toBe('2026-11-06');
    const again = snoozeRevision(s_input(r), 'r1', '2026-11-01', 2);
    expect(again.revisions[0]!.dueOn).toBe('2026-11-08');
  });

  it('snooze validates days and target', () => {
    for (const d of [0, 31, 1.5, NaN]) {
      expect(() => snoozeRevision(input0(), 'r1', '2026-11-20', d)).toThrow(
        code('VALIDATION_FAILED'),
      );
    }
    expect(() =>
      snoozeRevision(input0(), 'r1', '2026-11-20', 30),
    ).not.toThrow();
    expect(() => snoozeRevision(input0(), 'r2', '2026-11-20', 1)).toThrow(
      code('REVISION_OUT_OF_ORDER'),
    );
  });

  it('marks completed when all done and nextDueOn null', () => {
    let s: ScheduleResult = completeRevision(input0(), 'r1', '2026-11-05');
    s = completeRevision(s_input(s), 'r2', '2026-11-08');
    s = completeRevision(s_input(s), 'r3', '2026-11-16');
    expect(s.status).toBe('active');
    s = completeRevision(s_input(s), 'r4', '2026-12-01');
    expect(s.status).toBe('completed');
    expect(s.nextDueOn).toBeNull();
  });

  it('rebuild sorts by step and ignores input order', () => {
    const i = input0();
    const r = rebuildSchedule({ ...i, revisions: [...i.revisions].reverse() });
    expect(r.revisions.map(x => x.step)).toEqual([1, 2, 3, 4]);
  });

  it('rejects invalid intervals and dates', () => {
    for (const bad of [[], [4, 4], [7, 4], [0, 3], [1.5], [1000]]) {
      expect(() => createSchedule('2026-11-01', bad, ids())).toThrow(
        code('VALIDATION_FAILED'),
      );
    }
    expect(() => createSchedule('2026-02-30', [1], ids())).toThrow(
      code('VALIDATION_FAILED'),
    );
  });

  it('reconcile keeps done history by step, rejects shrinking below done count', () => {
    let s: ScheduleResult = completeRevision(input0(), 'r1', '2026-11-05');
    s = completeRevision(s_input(s), 'r2', '2026-11-08');
    s = completeRevision(s_input(s), 'r3', '2026-11-16');
    const cur = s_input(s);
    expect(() =>
      reconcileSchedule(
        cur,
        { studiedOn: '2026-11-01', intervals: [4, 7] },
        ids(),
      ),
    ).toThrow(code('VALIDATION_FAILED'));
    const r = reconcileSchedule(
      cur,
      { studiedOn: '2026-11-01', intervals: [4, 7, 15, 30, 60] },
      () => 'new',
    );
    expect(r.revisions).toHaveLength(5);
    expect(r.revisions.slice(0, 3).map(x => x.doneOn)).toEqual([
      '2026-11-05',
      '2026-11-08',
      '2026-11-16',
    ]);
    expect(r.revisions.slice(0, 3).map(x => x.id)).toEqual(['r1', 'r2', 'r3']);
    expect(r.revisions[4]!.id).toBe('new');
    // r4 due 11-16 + 15 = 12-01; r5 = 12-01 + 30
    expect(r.revisions[4]!.dueOn).toBe('2026-12-31');
  });

  it('reconcile drops extra pending steps', () => {
    const r = reconcileSchedule(
      input0(),
      { studiedOn: '2026-11-01', intervals: [4, 7] },
      ids(),
    );
    expect(r.revisions.map(x => x.id)).toEqual(['r1', 'r2']);
  });

  it('reconcile with a new studiedOn recomputes pending dates and clears overrides', () => {
    const a = completeRevision(input0(), 'r1', '2026-11-05');
    const b = snoozeRevision(s_input(a), 'r2', '2026-11-10', 3);
    expect(b.revisions[1]!.dueOverride).toBe('2026-11-13');
    const r = reconcileSchedule(
      s_input(b),
      { studiedOn: '2026-11-02', intervals: [4, 7, 15, 30] },
      ids(),
    );
    expect(r.revisions.every(x => x.dueOverride === null)).toBe(true);
    expect(dues(r)).toEqual([
      '2026-11-06',
      '2026-11-08',
      '2026-11-16',
      '2026-12-01',
    ]);
    expect(r.nextDueOn).toBe('2026-11-08');
  });
});
