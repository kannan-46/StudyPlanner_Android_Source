import {
  FOCUS_MS,
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
    const done = timerReducer(resumed, {
      type: 'tick',
      now: t0 + 90_000 + 25 * 60_000,
    });
    expect(done.finished).toBe(true);
    expect(done.status).toBe('idle');
    expect(done.remainingMs).toBe(FOCUS_MS);
    const after = timerReducer(done, { type: 'tick', now: t0 + 99_999_999 });
    expect(after.finished).toBe(false);
  });

  it('reset returns to the initial state', () => {
    const s = run(
      initialTimerState,
      { type: 'start', now: t0 },
      { type: 'reset' },
    );
    expect(s).toEqual(initialTimerState);
  });
});
