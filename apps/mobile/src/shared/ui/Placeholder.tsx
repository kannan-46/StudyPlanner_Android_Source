import React from 'react';
import { Text } from 'react-native';
import { Screen } from './Screen';
import { useTheme } from './ThemeProvider';

export function PlaceholderScreen({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Screen>
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}
      >
        {title}
      </Text>
    </Screen>
  );
}
