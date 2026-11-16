import React, { type ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useTheme } from './ThemeProvider';

/**
 * A heading over a group of rows or cards ("Overdue", "Today", "Study"):
 * 18 sp bold in the body text colour, announced as a heading.
 */
export function SectionHeading({
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
          fontSize: 18,
          fontWeight: '700',
          marginBottom: spacing.xs,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
