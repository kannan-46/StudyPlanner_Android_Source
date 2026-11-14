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
