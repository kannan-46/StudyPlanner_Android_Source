import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Banner, type BannerTone } from '../Banner';
import { darkColors, lightColors } from '../theme';
import { ThemeProvider } from '../ThemeProvider';

const announce = jest.mocked(AccessibilityInfo.announceForAccessibility);
beforeEach(() => announce.mockClear());

const renderBanner = (
  mode: 'light' | 'dark',
  tone: BannerTone,
  extra: { announce?: boolean; onAction?: () => void } = {},
) =>
  render(
    <ThemeProvider mode={mode}>
      <Banner
        tone={tone}
        text="Reminders are off"
        actionLabel="Fix"
        onAction={extra.onAction ?? (() => {})}
        announce={extra.announce}
      />
    </ThemeProvider>,
  );

const box = () => StyleSheet.flatten(screen.getByTestId('banner').props.style);
const action = () =>
  StyleSheet.flatten(screen.getByTestId('banner-action').props.style);

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)('%s theme', (mode, colors) => {
  it('a warning looks like a warning, with an active action', async () => {
    await renderBanner(mode, 'warning');
    expect(box().borderColor).toBe(colors.warning);
    expect(box().backgroundColor).toBe(colors.softWarning);
    expect(action().color).toBe(colors.accent);
    expect(action().color).not.toBe(colors.muted);
  });

  it('an error uses the danger colours', async () => {
    await renderBanner(mode, 'error');
    expect(box().borderColor).toBe(colors.danger);
    expect(box().backgroundColor).toBe(colors.softDanger);
  });

  it('info keeps the accent tint', async () => {
    await renderBanner(mode, 'info');
    expect(box().borderColor).toBe(colors.accent);
    expect(box().backgroundColor).toBe(colors.softAccent);
  });
});

it('the action is a button that works', async () => {
  const onAction = jest.fn();
  await renderBanner('light', 'warning', { onAction });
  await fireEvent.press(screen.getByRole('button', { name: 'Fix' }));
  expect(onAction).toHaveBeenCalledTimes(1);
});

it('reads its text aloud only when asked to', async () => {
  const view = await renderBanner('light', 'warning');
  expect(announce).not.toHaveBeenCalled();
  await view.unmount();
  await renderBanner('light', 'warning', { announce: true });
  expect(announce).toHaveBeenCalledWith('Reminders are off');
});
