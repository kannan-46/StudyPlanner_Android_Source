import type { SavedFocusTimer } from '../../shared/lib/localPrefs';

export const FOCUS_MS = 25 * 60_000;

export type TimerState = {
  status: 'idle' | 'running' | 'paused';
  remainingMs: number;
  /** Epoch ms when the running session ends; null unless running. */
  endsAt: number | null;
  /** True only on the state produced by the tick that finished a session. */
  finished: boolean;
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
  finished: false,
};

/** Time derives from timestamps, so it stays correct after backgrounding. */
export function timerReducer(
  state: TimerState,
  action: TimerAction,
): TimerState {
  switch (action.type) {
    case 'start':
      if (state.status !== 'idle') return { ...state, finished: false };
      return {
        status: 'running',
        remainingMs: FOCUS_MS,
        endsAt: action.now + FOCUS_MS,
        finished: false,
      };
    case 'pause':
      if (state.status !== 'running' || state.endsAt === null) {
        return { ...state, finished: false };
      }
      return {
        status: 'paused',
        remainingMs: Math.max(0, state.endsAt - action.now),
        endsAt: null,
        finished: false,
      };
    case 'resume':
      if (state.status !== 'paused') return { ...state, finished: false };
      return {
        status: 'running',
        remainingMs: state.remainingMs,
        endsAt: action.now + state.remainingMs,
        finished: false,
      };
    case 'reset':
      return initialTimerState;
    case 'restore': {
      // The user already pressed something: their choice wins.
      if (state.status !== 'idle') return state;
      const { saved, now } = action;
      if (saved.status === 'running' && saved.endsAt !== null) {
        const remainingMs = Math.min(FOCUS_MS, saved.endsAt - now);
        if (remainingMs <= 0) return { ...initialTimerState, finished: true };
        return {
          status: 'running',
          remainingMs,
          endsAt: now + remainingMs,
          finished: false,
        };
      }
      if (saved.status === 'paused' && saved.remainingMs > 0) {
        return {
          status: 'paused',
          remainingMs: Math.min(FOCUS_MS, saved.remainingMs),
          endsAt: null,
          finished: false,
        };
      }
      return initialTimerState;
    }
    case 'tick': {
      if (state.status !== 'running' || state.endsAt === null) {
        return state.finished ? { ...state, finished: false } : state;
      }
      const remainingMs = Math.max(0, state.endsAt - action.now);
      if (remainingMs === 0) return { ...initialTimerState, finished: true };
      if (remainingMs === state.remainingMs && !state.finished) return state;
      return { ...state, remainingMs, finished: false };
    }
  }
}
