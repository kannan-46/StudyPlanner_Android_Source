import React, { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from './responsive';
import { useTheme } from './ThemeProvider';

export function Screen({
  children,
  scroll,
  fullWidth,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Skip the centred max-width column (lists and master-detail). */
  fullWidth?: boolean;
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
  const content =
    fullWidth && !scroll ? <View style={{ flex: 1 }}>{children}</View> : body;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {content}
    </SafeAreaView>
  );
}
