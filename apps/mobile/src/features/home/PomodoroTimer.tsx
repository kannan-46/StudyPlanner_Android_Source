import React, { useCallback, useEffect, useReducer } from 'react';
import { Text, View } from 'react-native';
import { useAppForeground } from '../../shared/lib/useAppForeground';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { initialTimerState, timerReducer } from './timerReducer';

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
      snackbar.show({
        message: 'Focus session done — take a 5-minute break',
      });
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
