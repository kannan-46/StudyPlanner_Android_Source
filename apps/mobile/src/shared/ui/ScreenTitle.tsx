import React, { type ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useTheme } from './ThemeProvider';

/**
 * The title at the top of a tab screen ("Schedule", "Topics", "Settings"):
 * 24 sp bold, announced as a heading. Wraps at large font scales.
 */
export function ScreenTitle({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[
        {
          color: colors.text,
          fontSize: 24,
          fontWeight: '700',
          marginBottom: spacing.sm,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
