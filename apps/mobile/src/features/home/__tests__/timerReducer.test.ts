import {
  FOCUS_MS,
  LATE_FINISH_MS,
  initialTimerState,
  timerReducer,
  type TimerState,
} from '../timerReducer';

const t0 = 1_700_000_000_000;
const run = (s: TimerState, ...a: Parameters<typeof timerReducer>[1][]) =>
  a.reduce(timerReducer, s);

describe('timerReducer', () => {
  it('counts down from timestamps', () => {
    const s = run(
      initialTimerState,
      { type: 'start', now: t0 },
      { type: 'tick', now: t0 + 60_000 },
    );
    expect(s.status).toBe('running');
    expect(s.remainingMs).toBe(FOCUS_MS - 60_000);
    expect(s.remainingMs).toBe(24 * 60_000);
  });

  it('keeps the remaining time while paused', () => {
    const s = run(
      initialTimerState,
      { type: 'start', now: t0 },
      { type: 'pause', now: t0 + 60_000 },
      { type: 'tick', now: t0 + 120_000 },
    );
    expect(s.status).toBe('paused');
    expect(s.remainingMs).toBe(24 * 60_000);
    expect(s.endsAt).toBeNull();
  });

  it('resumes, then finishes once and resets to idle', () => {
    const paused = run(
      initialTimerState,
      { type: 'start', now: t0 },
      { type: 'pause', now: t0 + 60_000 },
    );
    const resumed = timerReducer(paused, { type: 'resume', now: t0 + 90_000 });
    expect(resumed.status).toBe('running');
    const endsAt = t0 + 90_000 + 24 * 60_000;
    const done = timerReducer(resumed, { type: 'tick', now: endsAt + 400 });
    expect(done.finished).toEqual({ endedAt: endsAt, late: false });
    expect(done.status).toBe('idle');
    expect(done.remainingMs).toBe(FOCUS_MS);
    const after = timerReducer(done, { type: 'tick', now: t0 + 99_999_999 });
    expect(after.finished).toBeNull();
  });

  it('marks a finish noticed long after the end as late', () => {
    const started = timerReducer(initialTimerState, { type: 'start', now: t0 });
    const endsAt = t0 + FOCUS_MS;
    expect(
      timerReducer(started, { type: 'tick', now: endsAt + LATE_FINISH_MS })
        .finished,
    ).toEqual({ endedAt: endsAt, late: false });
    expect(
      timerReducer(started, {
        type: 'tick',
        now: endsAt + LATE_FINISH_MS + 1,
      }).finished,
    ).toEqual({ endedAt: endsAt, late: true });
    // The next morning: still the real end time, and late.
    expect(
      timerReducer(started, { type: 'tick', now: endsAt + 10 * 3_600_000 })
        .finished,
    ).toEqual({ endedAt: endsAt, late: true });
  });

  it('reset returns to the initial state', () => {
    const s = run(
      initialTimerState,
      { type: 'start', now: t0 },
      { type: 'reset' },
    );
    expect(s).toEqual(initialTimerState);
  });

  describe('restore', () => {
    it('resumes a running session from its saved end time', () => {
      const s = timerReducer(initialTimerState, {
        type: 'restore',
        saved: { status: 'running', endsAt: t0 + 10 * 60_000, remainingMs: 0 },
        now: t0,
      });
      expect(s).toEqual({
        status: 'running',
        remainingMs: 10 * 60_000,
        endsAt: t0 + 10 * 60_000,
        finished: null,
      });
    });

    it('shows a session that ended hours ago as a late finish', () => {
      const endsAt = t0 - 8 * 3_600_000;
      const s = timerReducer(initialTimerState, {
        type: 'restore',
        saved: { status: 'running', endsAt, remainingMs: 0 },
        now: t0,
      });
      expect(s).toEqual({
        ...initialTimerState,
        finished: { endedAt: endsAt, late: true },
      });
    });

    it('treats a session that ended a moment ago as an on-time finish', () => {
      const s = timerReducer(initialTimerState, {
        type: 'restore',
        saved: { status: 'running', endsAt: t0 - 1, remainingMs: 0 },
        now: t0,
      });
      expect(s.finished).toEqual({ endedAt: t0 - 1, late: false });
    });

    it('restores a paused session with its remaining time', () => {
      const s = timerReducer(initialTimerState, {
        type: 'restore',
        saved: { status: 'paused', endsAt: null, remainingMs: 90_000 },
        now: t0,
      });
      expect(s).toEqual({
        status: 'paused',
        remainingMs: 90_000,
        endsAt: null,
        finished: null,
      });
    });

    it('never restores more than one full session (clock changes)', () => {
      const s = timerReducer(initialTimerState, {
        type: 'restore',
        saved: { status: 'running', endsAt: t0 + 99 * 60_000, remainingMs: 0 },
        now: t0,
      });
      expect(s.remainingMs).toBe(FOCUS_MS);
      expect(s.endsAt).toBe(t0 + FOCUS_MS);
      const p = timerReducer(initialTimerState, {
        type: 'restore',
        saved: { status: 'paused', endsAt: null, remainingMs: 0 },
        now: t0,
      });
      expect(p).toEqual(initialTimerState);
    });

    it('is ignored once the user has already started a session', () => {
      const started = timerReducer(initialTimerState, {
        type: 'start',
        now: t0,
      });
      const s = timerReducer(started, {
        type: 'restore',
        saved: { status: 'paused', endsAt: null, remainingMs: 90_000 },
        now: t0,
      });
      expect(s).toBe(started);
    });
  });
});
