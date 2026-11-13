import React, { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from './responsive';
import { useTheme } from './ThemeProvider';

export function Screen({
  children,
  scroll,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const body = scroll ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, padding: spacing.lg }}
      >
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </ScrollView>
    </KeyboardAvoidingView>
  ) : (
    <ResponsiveContainer>{children}</ResponsiveContainer>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {body}
    </SafeAreaView>
  );
}
