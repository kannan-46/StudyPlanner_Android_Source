import type { SavedFocusTimer } from '../../shared/lib/localPrefs';

export const FOCUS_MS = 25 * 60_000;

/**
 * A session counts as finishing "now" (the user is watching) only when the
 * app notices within this long of its end. The 1 s tick lands well inside it;
 * a later finish means the app was away and the alarm already alerted.
 */
export const LATE_FINISH_MS = 5_000;

/** How a session ended: when, and whether the app only noticed later. */
export type TimerFinish = { endedAt: number; late: boolean };

export type TimerState = {
  status: 'idle' | 'running' | 'paused';
  remainingMs: number;
  /** Epoch ms when the running session ends; null unless running. */
  endsAt: number | null;
  /** Set only on the state produced by the action that finished a session. */
  finished: TimerFinish | null;
};

export type TimerAction =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'reset' }
  | { type: 'tick'; now: number }
  /** Brings back a session saved before a remount or app restart. */
  | { type: 'restore'; saved: SavedFocusTimer; now: number };

export const initialTimerState: TimerState = {
  status: 'idle',
  remainingMs: FOCUS_MS,
  endsAt: null,
  finished: null,
};

function finishedAt(endedAt: number, now: number): TimerState {
  return {
    ...initialTimerState,
    finished: { endedAt, late: now - endedAt > LATE_FINISH_MS },
  };
}

/** Time derives from timestamps, so it stays correct after backgrounding. */
export function timerReducer(
  state: TimerState,
  action: TimerAction,
): TimerState {
  switch (action.type) {
    case 'start':
      if (state.status !== 'idle') return { ...state, finished: null };
      return {
        status: 'running',
        remainingMs: FOCUS_MS,
        endsAt: action.now + FOCUS_MS,
        finished: null,
      };
    case 'pause':
      if (state.status !== 'running' || state.endsAt === null) {
        return { ...state, finished: null };
      }
      return {
        status: 'paused',
        remainingMs: Math.max(0, state.endsAt - action.now),
        endsAt: null,
        finished: null,
      };
    case 'resume':
      if (state.status !== 'paused') return { ...state, finished: null };
      return {
        status: 'running',
        remainingMs: state.remainingMs,
        endsAt: action.now + state.remainingMs,
        finished: null,
      };
    case 'reset':
      return initialTimerState;
    case 'restore': {
      // The user already pressed something: their choice wins.
      if (state.status !== 'idle') return state;
      const { saved, now } = action;
      if (saved.status === 'running' && saved.endsAt !== null) {
        const remainingMs = Math.min(FOCUS_MS, saved.endsAt - now);
        if (remainingMs <= 0) return finishedAt(saved.endsAt, now);
        return {
          status: 'running',
          remainingMs,
          endsAt: now + remainingMs,
          finished: null,
        };
      }
      if (saved.status === 'paused' && saved.remainingMs > 0) {
        return {
          status: 'paused',
          remainingMs: Math.min(FOCUS_MS, saved.remainingMs),
          endsAt: null,
          finished: null,
        };
      }
      return initialTimerState;
    }
    case 'tick': {
      if (state.status !== 'running' || state.endsAt === null) {
        return state.finished ? { ...state, finished: null } : state;
      }
      const remainingMs = Math.max(0, state.endsAt - action.now);
      if (remainingMs === 0) return finishedAt(state.endsAt, action.now);
      if (remainingMs === state.remainingMs && !state.finished) return state;
      return { ...state, remainingMs, finished: null };
    }
  }
}
