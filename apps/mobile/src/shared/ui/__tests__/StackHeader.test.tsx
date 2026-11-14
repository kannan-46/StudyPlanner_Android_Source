import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { Screen } from '../Screen';
import { StackHeader, UnderHeaderContext } from '../StackHeader';
import { ThemeProvider } from '../ThemeProvider';
import { darkColors } from '../theme';

const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 24, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider mode="dark">{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

const props = (over: Partial<NativeStackHeaderProps> = {}) =>
  ({
    back: { title: 'Home', href: undefined },
    options: { title: 'Reminder health' },
    route: { key: 'r1', name: 'ReminderHealth' },
    navigation: { goBack: jest.fn() },
    ...over,
  } as unknown as NativeStackHeaderProps);

it('shows the title and a back arrow in the dark theme colours', async () => {
  const p = props();
  await wrap(<StackHeader {...p} />);
  const title = screen.getByRole('header', { name: 'Reminder health' });
  expect(StyleSheet.flatten(title.props.style).color).toBe(darkColors.text);
  expect(title.props.numberOfLines).toBe(2);
  const bar = screen.getByTestId('stack-header');
  expect(StyleSheet.flatten(bar.props.style).backgroundColor).toBe(
    darkColors.background,
  );
  expect(bar.props.edges.top).not.toBe('off');
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(p.navigation.goBack).toHaveBeenCalled();
});

it('has no back button on the first screen and falls back to the route name', async () => {
  await wrap(<StackHeader {...props({ back: undefined, options: {} })} />);
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(screen.getByRole('header', { name: 'ReminderHealth' })).toBeTruthy();
});

it('Screen skips the top inset under a header, keeps it otherwise', async () => {
  await wrap(
    <>
      <Screen>
        <Text>plain</Text>
      </Screen>
      <UnderHeaderContext.Provider value>
        <Screen>
          <Text>under</Text>
        </Screen>
      </UnderHeaderContext.Provider>
    </>,
  );
  const [plain, under] = screen.getAllByTestId('screen');
  expect(plain.props.edges.top).not.toBe('off');
  expect(under.props.edges).toMatchObject({ top: 'off', bottom: 'additive' });
});
