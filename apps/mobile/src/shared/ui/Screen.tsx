import React, { useContext, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeaderHeightContext } from '@react-navigation/elements';
import { ResponsiveContainer } from './responsive';
import { UnderHeaderContext } from './StackHeader';
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
  // Under a stack header the header already clears the status bar.
  const underHeader = useContext(UnderHeaderContext);
  // The keyboard avoider measures itself from its parent, so under a header it
  // would think it starts at the top of the display and leave the last field
  // and the Save button behind the keyboard. Tell it how far down it sits.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const body = scroll ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={underHeader ? headerHeight : 0}
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
    <SafeAreaView
      testID="screen"
      edges={underHeader ? ['left', 'right', 'bottom'] : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {content}
    </SafeAreaView>
  );
}
