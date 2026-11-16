import React, { type ReactNode } from 'react';
import { Text } from 'react-native';
import { useAnnounce } from './announce';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { useTheme } from './ThemeProvider';

/**
 * A themed "Are you sure?" dialog, used instead of the system Alert (which
 * ignores the Back button on Android and the app's colours).
 *
 * Back, or tapping Cancel, calls `onCancel`, except while `busy`. With
 * `destructive` the confirm button is the filled red danger button; that is
 * the only place a filled red button should appear.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  /** Plain body text under the title. */
  message?: string;
  /** Extra body content (e.g. a field) under the message. */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Shows a spinner on the confirm button and blocks closing. */
  busy?: boolean;
  /** A short failure line shown above the buttons (read out by TalkBack). */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors, spacing } = useTheme();
  useAnnounce(visible ? error : null);
  const cancel = () => {
    if (!busy) onCancel();
  };
  return (
    <Dialog
      visible={visible}
      title={title}
      onRequestClose={cancel}
      actions={
        <>
          <Button
            title={confirmLabel}
            variant={destructive ? 'danger' : 'primary'}
            loading={busy}
            onPress={onConfirm}
          />
          <Button
            title={cancelLabel}
            variant="secondary"
            disabled={busy}
            onPress={cancel}
          />
        </>
      }
    >
      {message ? <Text style={{ color: colors.text }}>{message}</Text> : null}
      {children}
      {error ? (
        <Text
          testID="confirm-dialog-error"
          style={{ color: colors.danger, marginTop: spacing.sm }}
        >
          {error}
        </Text>
      ) : null}
    </Dialog>
  );
}
