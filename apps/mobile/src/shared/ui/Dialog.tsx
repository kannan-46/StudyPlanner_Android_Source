import React, { useContext, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { dialogMaxWidthFor, useResponsive } from './responsive';
import { useTheme } from './ThemeProvider';

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Simple centred modal dialog; body scrolls so large font scales never clip.
 * The card moves up above the keyboard (the modal window is edge-to-edge, so
 * Android does not resize it) and stays clear of the status and navigation
 * bars.
 */
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
  const { size } = useResponsive();
  // Read the context directly so a Dialog still renders without a provider.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  return (
    <Modal
      testID="dialog-modal"
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <KeyboardAvoidingView
        testID="dialog-keyboard-avoider"
        style={{ flex: 1 }}
        // 'padding' on Android too: the edge-to-edge modal starts at y = 0, so
        // no offset is needed and the card re-centres above the keyboard.
        behavior="padding"
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            paddingLeft: insets.left + spacing.lg,
            paddingRight: insets.right + spacing.lg,
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
        >
          <View
            testID="dialog-card"
            style={{
              width: '100%',
              maxWidth: dialogMaxWidthFor(size),
              maxHeight: '100%',
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
      </KeyboardAvoidingView>
    </Modal>
  );
}
