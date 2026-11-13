import React, { type ReactNode } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { useTheme } from './ThemeProvider';

/** Simple centred modal dialog; body scrolls so large font scales never clip. */
export function Dialog({
  visible,
  title,
  onRequestClose,
  children,
  actions,
}: {
  visible: boolean;
  title: string;
  onRequestClose: () => void;
  children?: ReactNode;
  actions: ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.lg,
          backgroundColor: 'rgba(0,0,0,0.5)',
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 480,
            maxHeight: '90%',
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            padding: spacing.lg,
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text
              accessibilityRole="header"
              style={{
                color: colors.text,
                fontSize: 18,
                fontWeight: '700',
                marginBottom: spacing.md,
              }}
            >
              {title}
            </Text>
            {children}
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {actions}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
