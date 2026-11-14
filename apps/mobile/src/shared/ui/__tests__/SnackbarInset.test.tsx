import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  SnackbarProvider,
  useSnackbar,
  useSnackbarInsetWhileFocused,
} from '../Snackbar';
import { ThemeProvider } from '../ThemeProvider';

// Every screen in these tests counts as focused while it is mounted.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});

let api: ReturnType<typeof useSnackbar>;
function Grab() {
  api = useSnackbar();
  return null;
}
function Lift({ name, px }: { name: string; px: number }) {
  useSnackbarInsetWhileFocused(name, px);
  return null;
}

/** A phone with a 24 dp gesture area; `lifts` are screens below the bar. */
const tree = (lifts: [string, number][]) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 360, height: 640 },
      insets: { top: 0, left: 0, right: 0, bottom: 24 },
    }}
  >
    <ThemeProvider mode="light">
      <SnackbarProvider>
        <Grab />
        {lifts.map(([name, px]) => (
          <Lift key={name} name={name} px={px} />
        ))}
      </SnackbarProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

const bottom = () =>
  StyleSheet.flatten(screen.getByTestId('snackbar').props.style).bottom;

it('sits just above the gesture area when nothing is below it', async () => {
  await render(tree([]));
  await act(async () => api.show({ message: 'Saved' }));
  expect(bottom()).toBe(24 + 16);
});

it('sits above the tab bar, and above the floating button too', async () => {
  const view = await render(tree([['tabBar', 80]]));
  await act(async () => api.show({ message: 'Saved' }));
  expect(bottom()).toBe(80 + 8);
  await view.rerender(
    tree([
      ['tabBar', 80],
      ['fab', 64],
    ]),
  );
  expect(bottom()).toBe(80 + 64 + 8);
});

it('drops back down when the screen that lifted it goes away', async () => {
  const view = await render(tree([['tabBar', 80]]));
  await act(async () => api.show({ message: 'Saved' }));
  expect(bottom()).toBe(88);
  await view.rerender(tree([]));
  expect(bottom()).toBe(40);
});
