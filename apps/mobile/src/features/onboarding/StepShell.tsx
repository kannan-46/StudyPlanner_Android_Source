import React, { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Screen } from '../../shared/ui/Screen';
import { useTheme } from '../../shared/ui/ThemeProvider';

export const TOTAL_STEPS = 4;

/** Common frame: scrollable, centred column, "Step N of 4" and a title. */
export function StepShell({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Screen scroll>
      <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
        {`Step ${step} of ${TOTAL_STEPS}`}
      </Text>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: 24,
          fontWeight: '700',
          marginBottom: spacing.lg,
        }}
      >
        {title}
      </Text>
      <View>{children}</View>
    </Screen>
  );
}
