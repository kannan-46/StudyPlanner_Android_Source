import React from 'react';
import { KeyboardAvoidingView, StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfirmDialog } from '../ConfirmDialog';
import { Dialog } from '../Dialog';
import { darkColors } from '../theme';
import { ThemeProvider } from '../ThemeProvider';
import { Button } from '../Button';

// Record the props given to the keyboard avoider (its maths needs a real
// keyboard, so only the inputs can be checked here).
jest.mock(
  'react-native/Libraries/Components/Keyboard/KeyboardAvoidingView',
  () => ({
    __esModule: true,
    default: jest.fn(({ children }: { children: React.ReactNode }) => children),
  }),
);
const avoider = KeyboardAvoidingView as unknown as jest.Mock;
beforeEach(() => avoider.mockClear());

const insets = { top: 24, left: 0, right: 0, bottom: 48 };
const wrap = (ui: React.ReactElement, mode: 'light' | 'dark' = 'light') =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets,
      }}
    >
      <ThemeProvider mode={mode}>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

describe('Dialog', () => {
  it('moves above the keyboard and clears the system bars', async () => {
    await wrap(
      <Dialog
        visible
        title="Add exam"
        onRequestClose={() => {}}
        actions={<Button title="Add" onPress={() => {}} />}
      >
        <Text>Body</Text>
      </Dialog>,
    );
    const props = avoider.mock.calls[avoider.mock.calls.length - 1][0];
    expect(props.behavior).toBe('padding');
    expect(props.keyboardVerticalOffset ?? 0).toBe(0);
    const backdrop = StyleSheet.flatten(
      screen.getByTestId('dialog-card').parent?.props.style,
    );
    expect(backdrop.paddingTop).toBe(24 + 16);
    expect(backdrop.paddingBottom).toBe(48 + 16);
  });

  it('still renders without a safe-area provider', async () => {
    await render(
      <ThemeProvider mode="light">
        <Dialog
          visible
          title="Hello"
          onRequestClose={() => {}}
          actions={<Button title="OK" onPress={() => {}} />}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Hello')).toBeOnTheScreen();
  });
});

describe('ConfirmDialog', () => {
  const setup = async (
    extra: Partial<React.ComponentProps<typeof ConfirmDialog>> = {},
    mode: 'light' | 'dark' = 'light',
  ) => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await wrap(
      <ConfirmDialog
        visible
        title="Delete topic?"
        message="This removes its revision history."
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...extra}
      />,
      mode,
    );
    return { onConfirm, onCancel };
  };

  it('confirms and cancels', async () => {
    const { onConfirm, onCancel } = await setup();
    expect(
      screen.getByText('This removes its revision history.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('a destructive confirm is the filled red button', async () => {
    await setup({}, 'dark');
    const box = StyleSheet.flatten(
      screen.getByRole('button', { name: 'Delete' }).props.style,
    );
    expect(box.backgroundColor).toBe(darkColors.danger);
  });

  it('a non-destructive confirm is the primary button', async () => {
    await setup({ destructive: false, confirmLabel: 'Sign out' }, 'dark');
    const box = StyleSheet.flatten(
      screen.getByRole('button', { name: 'Sign out' }).props.style,
    );
    expect(box.backgroundColor).toBe(darkColors.accent);
  });

  it('Back cancels', async () => {
    const { onCancel } = await setup();
    await fireEvent(screen.getByTestId('dialog-modal'), 'requestClose');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Back does nothing while busy', async () => {
    const { onCancel } = await setup({ busy: true });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeBusy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await fireEvent(screen.getByTestId('dialog-modal'), 'requestClose');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows an error line', async () => {
    await setup({ error: "Can't reach the server — try again" });
    expect(screen.getByTestId('confirm-dialog-error')).toHaveTextContent(
      "Can't reach the server — try again",
    );
  });
});
