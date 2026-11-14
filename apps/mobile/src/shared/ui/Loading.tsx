import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from './ThemeProvider';

/**
 * The one loading treatment used on every screen: an accent-coloured spinner
 * with a spoken label. `inline` drops the padding for use inside a card.
 */
export function Loading({
  label = 'Loading',
  inline,
}: {
  label?: string;
  inline?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: inline ? 0 : spacing.xl,
        minHeight: 48,
      }}
    >
      <ActivityIndicator
        color={colors.accent}
        accessibilityLabel={label}
        testID="loading"
      />
    </View>
  );
}
