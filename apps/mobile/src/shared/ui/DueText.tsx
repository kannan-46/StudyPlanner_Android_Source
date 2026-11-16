import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import type { LocalDate } from '@planner/shared';
import { dueStatus } from '../lib/format';
import type { Colors } from './theme';
import { useTheme } from './ThemeProvider';

/** Text colour and weight for a due status: overdue is red and bold. */
export function dueTextStyle(overdue: boolean, colors: Colors): TextStyle {
  return overdue
    ? { color: colors.danger, fontWeight: '700' }
    : { color: colors.text };
}

/**
 * A pending revision's due date, worded and coloured the same everywhere:
 * "Overdue by 3 days" (red, bold), "Due today", "Due tomorrow",
 * "In 4 days, 20 Nov".
 */
export function DueText({
  due,
  today,
  style,
}: {
  due: LocalDate;
  today: LocalDate;
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  const s = dueStatus(due, today);
  return <Text style={[dueTextStyle(s.overdue, colors), style]}>{s.text}</Text>;
}
