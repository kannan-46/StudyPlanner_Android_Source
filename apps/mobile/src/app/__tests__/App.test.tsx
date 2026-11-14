import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../../../App';
import { darkColors } from '../../shared/ui/theme';

// The real provider waits for native inset measurements before drawing.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('renders without crashing', async () => {
  await render(<App />);
  expect(await screen.findByText('Continue with Google')).toBeTruthy();
});

it('draws nothing until the saved theme is read, then starts in it', async () => {
  await AsyncStorage.setItem('prefs.theme', 'dark');
  let finishRead: () => void = () => {};
  const read = AsyncStorage.multiGet as jest.Mock;
  const real = read.getMockImplementation()!;
  read.mockImplementationOnce(
    (keys: string[]) =>
      new Promise(resolve => {
        finishRead = () => resolve(real(keys));
      }),
  );
  await render(<App />);
  expect(screen.toJSON()).toBeNull();
  finishRead();
  const title = await screen.findByText('Continue with Google');
  expect(title).toBeTruthy();
  expect(screen.getByText('Study Planner')).toHaveStyle({
    color: darkColors.text,
  });
});

it('copies the saved theme to the native side so the next launch opens in it', async () => {
  const setThemeMode = NativeModules.AppConfig.setThemeMode as jest.Mock;
  setThemeMode.mockClear();
  await AsyncStorage.setItem('prefs.theme', 'light');
  await render(<App />);
  await screen.findByText('Continue with Google');
  expect(setThemeMode).toHaveBeenCalledWith('light');
});
