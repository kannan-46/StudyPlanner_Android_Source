import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { Text, Vibration, View } from 'react-native';
import { cancelOneShot, scheduleOneShot } from '../../native/reminders';
import { loadFocusTimer, saveFocusTimer } from '../../shared/lib/localPrefs';
import { useAppForeground } from '../../shared/lib/useAppForeground';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { initialTimerState, timerReducer } from './timerReducer';

export const FOCUS_ALARM_ID = 'focus_timer';
export const FOCUS_DONE_MESSAGE = 'Focus session done — nice work!';
const ALARM_TITLE = 'Focus session done';
const ALARM_BODY = 'Nice work! Rest for a few minutes before your next one.';

/** Native calls are best effort: the on-screen timer works without them. */
function quietly(call: () => Promise<void>) {
  try {
    call().catch(() => {});
  } catch {
    // Native module missing.
  }
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function PomodoroTimer() {
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
  const [state, dispatch] = useReducer(timerReducer, initialTimerState);
  const [hydrated, setHydrated] = useState(false);

  // Bring back a session from before a remount (rotation) or app restart.
  useEffect(() => {
    let alive = true;
    loadFocusTimer().then(saved => {
      if (!alive) return;
      if (saved) dispatch({ type: 'restore', saved, now: Date.now() });
      setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Save the session and keep the end-of-session alarm in step with it, so
  // the user is alerted even with the screen off or the app closed.
  const { status, endsAt } = state;
  const pausedMs = status === 'paused' ? state.remainingMs : null;
  useEffect(() => {
    if (!hydrated) return;
    if (status === 'running' && endsAt !== null) {
      saveFocusTimer({ status, endsAt, remainingMs: endsAt - Date.now() });
      quietly(() =>
        scheduleOneShot(FOCUS_ALARM_ID, endsAt, ALARM_TITLE, ALARM_BODY),
      );
      return;
    }
    saveFocusTimer(
      status === 'paused' && pausedMs !== null
        ? { status, endsAt: null, remainingMs: pausedMs }
        : null,
    );
    quietly(() => cancelOneShot(FOCUS_ALARM_ID));
  }, [hydrated, status, endsAt, pausedMs]);

  useEffect(() => {
    if (state.status !== 'running') return;
    const id = setInterval(
      () => dispatch({ type: 'tick', now: Date.now() }),
      1000,
    );
    return () => clearInterval(id);
  }, [state.status]);

  useAppForeground(
    useCallback(() => dispatch({ type: 'tick', now: Date.now() }), []),
  );

  useEffect(() => {
    if (state.finished) {
      Vibration.vibrate(400);
      snackbar.show({ message: FOCUS_DONE_MESSAGE });
    }
  }, [state.finished, snackbar]);

  const now = () => Date.now();
  return (
    <Card>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: 18,
          fontWeight: '700',
          marginBottom: spacing.xs,
        }}
      >
        Focus timer
      </Text>
      <Text
        accessibilityLabel={`${formatClock(state.remainingMs)} remaining`}
        style={{
          color: colors.text,
          fontSize: 40,
          fontWeight: '700',
          marginBottom: spacing.sm,
        }}
      >
        {formatClock(state.remainingMs)}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {state.status === 'idle' ? (
          <Button
            title="Start"
            onPress={() => dispatch({ type: 'start', now: now() })}
          />
        ) : null}
        {state.status === 'running' ? (
          <Button
            title="Pause"
            onPress={() => dispatch({ type: 'pause', now: now() })}
          />
        ) : null}
        {state.status === 'paused' ? (
          <Button
            title="Resume"
            onPress={() => dispatch({ type: 'resume', now: now() })}
          />
        ) : null}
        {state.status !== 'idle' ? (
          <Button
            title="Reset"
            variant="secondary"
            onPress={() => dispatch({ type: 'reset' })}
          />
        ) : null}
      </View>
    </Card>
  );
}
