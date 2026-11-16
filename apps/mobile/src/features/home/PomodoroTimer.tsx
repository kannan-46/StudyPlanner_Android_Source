import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, Vibration, View } from 'react-native';
import { uses24HourClock } from '../../native/config';
import {
  cancelOneShot,
  openReminderSettings,
  requestNotificationPermission,
  scheduleOneShotWithStatus,
  type OneShotResult,
} from '../../native/reminders';
import { FOCUS_ALARM_ID } from '../../shared/lib/focusSession';
import { formatClockTime } from '../../shared/lib/format';
import {
  loadFocusTimer,
  saveFocusTimer,
  type SavedFocusTimer,
} from '../../shared/lib/localPrefs';
import { useAppForeground } from '../../shared/lib/useAppForeground';
import { Banner } from '../../shared/ui/Banner';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import {
  FOCUS_MS,
  initialTimerState,
  timerReducer,
  type TimerFinish,
} from './timerReducer';

export { FOCUS_ALARM_ID };
export const FOCUS_DONE_MESSAGE = 'Focus session done — nice work!';
export const PAUSED_TEXT = 'Paused — no alert until you resume';
export const NO_ALERT_TEXT = "You won't get an alert when the session ends";
export const LATE_ALERT_TEXT = 'The end alert may be several minutes late';
export const RESET_MESSAGE = 'Timer reset';
const ALARM_TITLE = 'Focus session done';
const ALARM_BODY = 'Nice work! Rest for a few minutes before your next one.';

/** Pause ignores presses this soon after Start or Resume (a double-tap). */
export const PAUSE_GUARD_MS = 500;
/** Reset offers Undo once at least this much of the session was used. */
export const RESET_UNDO_AFTER_MS = 60_000;
/** A session that ended longer ago than this clears without a message. */
export const RECENT_FINISH_MS = 60 * 60_000;
/**
 * A permission request that comes back this fast was refused without a
 * dialog: Android stops asking after the user said "Don't allow".
 */
const NO_DIALOG_MS = 600;

type AlertIssue = 'noAlert' | 'late';

function issueOf(result: OneShotResult | null): AlertIssue | null {
  if (!result) return null; // No native module: nothing to warn about.
  if (result.canNotify === false) return 'noAlert';
  if (result.exact === false) return 'late';
  return null;
}

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

/** "9:40 PM" or "21:40" in the phone's clock style, from local time. */
export function formatEndTime(epochMs: number): string {
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return formatClockTime(`${hh}:${mm}`, uses24HourClock());
}

export function endedAtMessage(endedAt: number): string {
  return `Your focus session ended at ${formatEndTime(endedAt)}`;
}

export function PomodoroTimer() {
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
  const [state, dispatch] = useReducer(timerReducer, initialTimerState);
  const [hydrated, setHydrated] = useState(false);
  // The alert problem reported for the alarm set for `at`.
  const [alarmCheck, setAlarmCheck] = useState<{
    at: number;
    issue: AlertIssue | null;
  } | null>(null);
  // After one refusal, Allow goes straight to the notification settings.
  const [notifAsked, setNotifAsked] = useState(false);

  const mounted = useRef(true);
  const stateRef = useRef(state);
  const hydratedRef = useRef(false);
  // Whether storage (or the alarm) may still hold a session to clear. Only
  // true once something was saved or loaded, so a slow or failed read of the
  // saved session never wipes it.
  const stored = useRef(false);
  const lastArmed = useRef<number | null>(null);
  const lastChange = useRef(0);
  // Each finish alerts once, even if the effect runs again.
  const handledFinish = useRef<TimerFinish | null>(null);

  useEffect(() => {
    stateRef.current = state;
    hydratedRef.current = hydrated;
  });
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // Bring back a session from before a remount (rotation) or app restart.
  useEffect(() => {
    let alive = true;
    loadFocusTimer().then(saved => {
      if (!alive) return;
      if (saved) {
        stored.current = true;
        dispatch({ type: 'restore', saved, now: Date.now() });
      }
      setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Sets (or moves) the end alarm and keeps what it reported. */
  const arm = useCallback(async (at: number): Promise<OneShotResult | null> => {
    lastArmed.current = at;
    let result: OneShotResult | null = null;
    try {
      result = await scheduleOneShotWithStatus(
        FOCUS_ALARM_ID,
        at,
        ALARM_TITLE,
        ALARM_BODY,
      );
    } catch {
      result = null;
    }
    if (mounted.current && lastArmed.current === at) {
      setAlarmCheck({ at, issue: issueOf(result) });
    }
    return result;
  }, []);

  // Save the session and keep the end-of-session alarm in step with it, so
  // the user is alerted even with the screen off or the app closed.
  const { status, endsAt } = state;
  const pausedMs = status === 'paused' ? state.remainingMs : null;
  const inAppFinish = state.finished !== null && !state.finished.late;
  useEffect(() => {
    if (!hydrated) return;
    if (status === 'running' && endsAt !== null) {
      stored.current = true;
      saveFocusTimer({ status, endsAt, remainingMs: endsAt - Date.now() });
      arm(endsAt);
      return;
    }
    lastArmed.current = null;
    if (status === 'paused' && pausedMs !== null) {
      stored.current = true;
      saveFocusTimer({ status, endsAt: null, remainingMs: pausedMs });
      quietly(() => cancelOneShot(FOCUS_ALARM_ID));
      return;
    }
    // Idle: clear only what a session left behind (reset or finish).
    if (!stored.current) return;
    stored.current = false;
    saveFocusTimer(null);
    // A finish the user just watched keeps a notification that showed a
    // moment earlier, rather than pulling it away mid-sound.
    quietly(() =>
      cancelOneShot(
        FOCUS_ALARM_ID,
        inAppFinish ? { keepNotification: true } : {},
      ),
    );
  }, [hydrated, status, endsAt, pausedMs, inAppFinish, arm]);

  useEffect(() => {
    if (state.status !== 'running') return;
    const id = setInterval(
      () => dispatch({ type: 'tick', now: Date.now() }),
      1000,
    );
    return () => clearInterval(id);
  }, [state.status]);

  // Back in the app: catch up the clock and set the alarm again, so access
  // granted in Settings meanwhile (exact alarms, notifications) takes effect.
  useAppForeground(
    useCallback(() => {
      const now = Date.now();
      dispatch({ type: 'tick', now });
      const s = stateRef.current;
      if (
        hydratedRef.current &&
        s.status === 'running' &&
        s.endsAt !== null &&
        s.endsAt > now
      ) {
        arm(s.endsAt);
      }
    }, [arm]),
  );

  const finished: TimerFinish | null = state.finished;
  useEffect(() => {
    if (!finished || handledFinish.current === finished) return;
    handledFinish.current = finished;
    if (!finished.late) {
      Vibration.vibrate(400);
      // Waits behind an Undo snackbar instead of replacing it.
      snackbar.show({ message: FOCUS_DONE_MESSAGE, passive: true });
      return;
    }
    // Noticed later (the app was away): the alarm already alerted, so no
    // buzz. A recent end gets a quiet note; an old one clears silently.
    if (Date.now() - finished.endedAt <= RECENT_FINISH_MS) {
      snackbar.show({
        message: endedAtMessage(finished.endedAt),
        passive: true,
      });
    }
  }, [finished, snackbar]);

  const start = () => {
    lastChange.current = Date.now();
    dispatch({ type: 'start', now: lastChange.current });
  };
  const resume = () => {
    lastChange.current = Date.now();
    dispatch({ type: 'resume', now: lastChange.current });
  };
  const pause = () => {
    const now = Date.now();
    // The second tap of a double-tap on Start lands here: ignore it.
    if (now - lastChange.current < PAUSE_GUARD_MS) return;
    dispatch({ type: 'pause', now });
  };
  const reset = () => {
    const now = Date.now();
    const s = stateRef.current;
    let prev: SavedFocusTimer | null = null;
    if (s.status === 'running' && s.endsAt !== null) {
      prev = {
        status: 'running',
        endsAt: s.endsAt,
        remainingMs: s.endsAt - now,
      };
    } else if (s.status === 'paused') {
      prev = { status: 'paused', endsAt: null, remainingMs: s.remainingMs };
    }
    dispatch({ type: 'reset' });
    if (!prev || FOCUS_MS - prev.remainingMs < RESET_UNDO_AFTER_MS) return;
    const saved = prev;
    snackbar.show({
      message: RESET_MESSAGE,
      actionLabel: 'Undo',
      onAction: () => {
        lastChange.current = Date.now();
        dispatch({ type: 'restore', saved, now: lastChange.current });
      },
    });
  };

  async function allowAlerts(issue: AlertIssue, at: number) {
    if (issue === 'late') {
      quietly(() => openReminderSettings('exactAlarm'));
      return;
    }
    if (!notifAsked) {
      setNotifAsked(true);
      const asked = Date.now();
      let granted = false;
      try {
        granted = await requestNotificationPermission();
      } catch {
        granted = false;
      }
      if (granted) {
        const result = await arm(at);
        // Allowed, unless the app's focus alerts are switched off in Settings.
        if (!result || result.canNotify !== false) return;
      } else if (Date.now() - asked >= NO_DIALOG_MS) {
        // The user saw the dialog and said no; the next tap opens Settings.
        return;
      }
    }
    quietly(() => openReminderSettings('notifications'));
  }

  const paused = state.status === 'paused';
  const runningEndsAt = state.status === 'running' ? state.endsAt : null;
  const issue =
    runningEndsAt !== null && alarmCheck?.at === runningEndsAt
      ? alarmCheck.issue
      : null;
  const clock = formatClock(state.remainingMs);
  return (
    <Card>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.text, marginBottom: spacing.xs }]}
      >
        Focus timer
      </Text>
      <Text
        testID="focus-clock"
        accessibilityLabel={`${clock} remaining${paused ? ', paused' : ''}`}
        style={[
          styles.clock,
          {
            color: paused ? colors.muted : colors.text,
            marginBottom: spacing.sm,
          },
        ]}
      >
        {clock}
      </Text>
      <View style={[styles.row, { gap: spacing.sm }]}>
        {state.status === 'idle' ? (
          <Button title="Start" onPress={start} />
        ) : null}
        {state.status === 'running' ? (
          <Button title="Pause" onPress={pause} />
        ) : null}
        {paused ? <Button title="Resume" onPress={resume} /> : null}
        {state.status !== 'idle' ? (
          <Button
            title="Reset"
            variant="secondary"
            accessibilityHint="Stops this session and sets the timer back to 25 minutes"
            onPress={reset}
          />
        ) : null}
      </View>
      {/* Notes sit below the buttons so they never move them under a tap. */}
      {paused ? (
        <Text
          style={[styles.note, { color: colors.muted, marginTop: spacing.sm }]}
        >
          {PAUSED_TEXT}
        </Text>
      ) : null}
      {issue && runningEndsAt !== null ? (
        <View style={{ marginTop: spacing.sm }}>
          <Banner
            tone="warning"
            announce
            text={issue === 'noAlert' ? NO_ALERT_TEXT : LATE_ALERT_TEXT}
            actionLabel="Allow"
            onAction={() => {
              allowAlerts(issue, runningEndsAt);
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700' },
  clock: { fontSize: 40, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  note: { fontSize: 14 },
});
