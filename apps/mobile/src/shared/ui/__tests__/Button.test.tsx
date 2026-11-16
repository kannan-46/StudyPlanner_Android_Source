import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { Button, type ButtonVariant } from '../Button';
import { darkColors, lightColors } from '../theme';
import { ThemeProvider } from '../ThemeProvider';

const renderButton = async (
  mode: 'light' | 'dark',
  props: {
    variant?: ButtonVariant;
    disabled?: boolean;
    loading?: boolean;
    disabledHint?: string;
  } = {},
) =>
  render(
    <ThemeProvider mode={mode}>
      <Button title="Finish" onPress={() => {}} {...props} />
    </ThemeProvider>,
  );

const boxStyle = () =>
  StyleSheet.flatten(screen.getByRole('button').props.style);
const textStyle = () =>
  StyleSheet.flatten(screen.getByText('Finish').props.style);

describe('Button', () => {
  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)(
    'a disabled primary button is grey with muted text in %s mode',
    async (mode, colors) => {
      await renderButton(mode, { disabled: true });
      expect(boxStyle().backgroundColor).toBe(colors.line);
      expect(boxStyle().opacity).toBe(1);
      expect(textStyle().color).toBe(colors.muted);
    },
  );

  it('an enabled primary button uses the accent colours', async () => {
    await renderButton('dark');
    expect(boxStyle().backgroundColor).toBe(darkColors.accent);
    expect(textStyle().color).toBe(darkColors.accentText);
  });

  it('disabled secondary, text and danger buttons use muted text', async () => {
    for (const variant of ['secondary', 'text', 'danger'] as const) {
      const { unmount } = await renderButton('light', {
        variant,
        disabled: true,
      });
      expect(textStyle().color).toBe(lightColors.muted);
      if (variant === 'danger') {
        expect(boxStyle().backgroundColor).toBe(lightColors.line);
      }
      await unmount();
    }
  });

  it('shows the hint only while disabled', async () => {
    const { rerender } = await renderButton('light', {
      disabled: true,
      disabledHint: 'Add at least one topic, or Skip for now',
    });
    expect(
      screen.getByText('Add at least one topic, or Skip for now'),
    ).toBeOnTheScreen();
    await rerender(
      <ThemeProvider mode="light">
        <Button
          title="Finish"
          onPress={() => {}}
          disabledHint="Add at least one topic, or Skip for now"
        />
      </ThemeProvider>,
    );
    expect(
      screen.queryByText('Add at least one topic, or Skip for now'),
    ).toBeNull();
  });
});

describe('Button accessibility and danger styles', () => {
  it('keeps its spoken name while busy', async () => {
    await renderButton('light', { loading: true });
    const button = screen.getByRole('button', { name: 'Finish' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(screen.getByTestId('button-spinner')).toBeOnTheScreen();
  });

  it('is named after its title when idle, or after an explicit label', async () => {
    await renderButton('light');
    expect(screen.getByRole('button', { name: 'Finish' })).not.toBeBusy();
    await render(
      <ThemeProvider mode="light">
        <Button
          title="Delete"
          accessibilityLabel="Delete Mock A"
          variant="dangerText"
          onPress={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('Delete Mock A')).toBeOnTheScreen();
  });

  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)(
    'dangerText is red text on no fill in %s mode',
    async (mode, colors) => {
      await render(
        <ThemeProvider mode={mode}>
          <Button title="Finish" variant="dangerText" onPress={() => {}} />
        </ThemeProvider>,
      );
      expect(boxStyle().backgroundColor).toBe('transparent');
      expect(boxStyle().borderWidth).toBe(0);
      expect(textStyle().color).toBe(colors.danger);
    },
  );

  it('a disabled dangerText button uses muted text', async () => {
    await renderButton('light', { variant: 'dangerText', disabled: true });
    expect(textStyle().color).toBe(lightColors.muted);
  });

  it('a busy dangerText button draws a red spinner', async () => {
    await renderButton('dark', { variant: 'dangerText', loading: true });
    expect(screen.getByTestId('button-spinner').props.color).toBe(
      darkColors.danger,
    );
  });

  it('outlined buttons use the 3:1 control border', async () => {
    await renderButton('light', { variant: 'secondary' });
    expect(boxStyle().borderColor).toBe(lightColors.border);
    expect(boxStyle().borderWidth).toBe(1);
  });
});
