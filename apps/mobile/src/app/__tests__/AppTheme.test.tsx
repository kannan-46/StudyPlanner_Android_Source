import React from 'react';
import { Appearance, Text, View, useWindowDimensions } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DEFAULT_SETTINGS, type UserView } from '@planner/shared';
import { createQueryClient } from '../../shared/api/queryClient';
import { ApiProvider } from '../../shared/api/ApiProvider';
import { ApiError } from '../../shared/api/errors';
import type { Http } from '../../shared/api/http';
import { tokenStore } from '../../shared/api/tokenStore';
import { AuthProvider } from '../../features/auth/AuthProvider';
import {
  loadThemePrefs,
  type ThemeMode,
  type ThemePrefs,
} from '../../shared/lib/localPrefs';
import { useTheme, useThemeMode } from '../../shared/ui/ThemeProvider';
import { darkColors, lightColors } from '../../shared/ui/theme';
import {
  AppThemeProvider,
  navigationTheme,
  useServerThemeSync,
} from '../AppTheme';

jest.mock('../../shared/api/tokenStore', () => ({
  tokenStore: { get: jest.fn(), set: jest.fn(), clear: jest.fn() },
}));
// StatusBar renders nothing in tests; a host stand-in exposes its props.
jest.mock('react-native/Libraries/Components/StatusBar/StatusBar', () => {
  const RN = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  return {
    __esModule: true,
    default: (props: object) =>
      R.createElement(RN.View, { testID: 'status-bar', ...props }),
  };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const ts = tokenStore as jest.Mocked<typeof tokenStore>;
const userWith = (theme: ThemeMode): UserView =>
  ({
    id: 'u1',
    email: 'a@b.c',
    name: 'Asha',
    avatarUrl: null,
    onboardingCompletedAt: 'x',
    settings: { ...DEFAULT_SETTINGS, theme },
  } as unknown as UserView);

let http: { get: jest.Mock; patch: jest.Mock; post: jest.Mock };
let qc: ReturnType<typeof createQueryClient> | undefined;
let setColorScheme: jest.SpyInstance;

function Harness() {
  useServerThemeSync();
  const { isDark } = useTheme();
  const { mode, setMode } = useThemeMode();
  return (
    <View>
      <Text testID="theme">{`${mode}:${isDark ? 'dark' : 'light'}`}</Text>
      {(['system', 'light', 'dark'] as const).map(m => (
        <Text key={m} onPress={() => setMode(m)}>{`pick-${m}`}</Text>
      ))}
    </View>
  );
}
const shown = () => screen.getByTestId('theme').props.children;
const barStyle = () => screen.getByTestId('status-bar').props.barStyle;

async function setup(initial: ThemePrefs) {
  qc = createQueryClient();
  qc.setDefaultOptions({ queries: { retry: false } });
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={qc}>
        <ApiProvider http={http as unknown as Http}>
          <AppThemeProvider initial={initial}>
            <AuthProvider>
              <Harness />
            </AuthProvider>
          </AppThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width: 360,
    height: 640,
    scale: 2,
    fontScale: 1,
  });
  setColorScheme = jest
    .spyOn(Appearance, 'setColorScheme')
    .mockImplementation(() => {});
  ts.get.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
  ts.clear.mockResolvedValue(undefined);
  http = { get: jest.fn(), patch: jest.fn(), post: jest.fn() };
});
afterEach(async () => {
  setColorScheme.mockRestore();
  await qc?.cancelQueries();
  qc?.clear();
});

it('starts in the theme saved on the phone, before the server answers', async () => {
  http.get.mockReturnValue(new Promise(() => {}));
  await setup({ mode: 'dark', synced: 'dark' });
  expect(shown()).toBe('dark:dark');
  expect(barStyle()).toBe('light-content');
  expect(setColorScheme).toHaveBeenCalledWith('dark');
});

it('a theme tap applies at once and is saved on the phone while the server save is pending', async () => {
  http.get.mockResolvedValue(userWith('light'));
  http.patch.mockReturnValue(new Promise(() => {}));
  await setup({ mode: 'light', synced: 'light' });
  await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/me'));
  expect(barStyle()).toBe('dark-content');

  await fireEvent.press(screen.getByText('pick-dark'));
  expect(shown()).toBe('dark:dark');
  expect(barStyle()).toBe('light-content');
  expect(setColorScheme).toHaveBeenLastCalledWith('dark');
  await waitFor(() =>
    expect(http.patch).toHaveBeenCalledWith('/v1/me', {
      settings: { theme: 'dark' },
    }),
  );
  expect((await loadThemePrefs()).mode).toBe('dark');

  await fireEvent.press(screen.getByText('pick-system'));
  expect(setColorScheme).toHaveBeenLastCalledWith('auto');
});

it('a failed server save keeps the new theme (no revert)', async () => {
  http.get.mockResolvedValue(userWith('light'));
  http.patch.mockRejectedValue(new ApiError('NETWORK', 0));
  await setup({ mode: 'light', synced: 'light' });
  await waitFor(() => expect(http.get).toHaveBeenCalled());
  await fireEvent.press(screen.getByText('pick-dark'));
  await waitFor(() => expect(http.patch).toHaveBeenCalled());
  await act(async () => {});
  expect(shown()).toBe('dark:dark');
  expect((await loadThemePrefs()).mode).toBe('dark');
});

it('quick taps end on the last choice, on screen and on the server', async () => {
  http.get.mockResolvedValue(userWith('system'));
  const replies: Array<() => void> = [];
  http.patch.mockImplementation(
    (_p: string, body: { settings: { theme: ThemeMode } }) =>
      new Promise(resolve => {
        replies.push(() => resolve(userWith(body.settings.theme)));
      }),
  );
  await setup({ mode: 'system', synced: 'system' });
  await waitFor(() => expect(http.get).toHaveBeenCalled());
  await fireEvent.press(screen.getByText('pick-light'));
  await fireEvent.press(screen.getByText('pick-dark'));
  expect(shown()).toBe('dark:dark');
  await waitFor(() => expect(replies).toHaveLength(1));
  await act(async () => replies[0]());
  expect(shown()).toBe('dark:dark');
  await waitFor(() => expect(replies).toHaveLength(2));
  expect(http.patch).toHaveBeenLastCalledWith('/v1/me', {
    settings: { theme: 'dark' },
  });
  await act(async () => replies[1]());
  expect(shown()).toBe('dark:dark');
  await waitFor(async () =>
    expect(await loadThemePrefs()).toEqual({ mode: 'dark', synced: 'dark' }),
  );
});

it('uses the server theme when it was changed on another device', async () => {
  http.get.mockResolvedValue(userWith('light'));
  await setup({ mode: 'dark', synced: 'dark' });
  await waitFor(() => expect(shown()).toBe('light:light'));
  expect(http.patch).not.toHaveBeenCalled();
});

it('re-sends a choice the server never received instead of reverting it', async () => {
  http.get.mockResolvedValue(userWith('light'));
  http.patch.mockResolvedValue(userWith('dark'));
  await setup({ mode: 'dark', synced: 'light' });
  await waitFor(() =>
    expect(http.patch).toHaveBeenCalledWith('/v1/me', {
      settings: { theme: 'dark' },
    }),
  );
  expect(shown()).toBe('dark:dark');
});

it("the Can't reach the server screen uses the saved theme", async () => {
  http.get.mockRejectedValue(new ApiError('NETWORK', 0));
  await setup({ mode: 'dark', synced: 'dark' });
  const msg = await screen.findByText("Can't reach the server");
  expect(msg).toHaveStyle({ color: darkColors.text });
  expect(barStyle()).toBe('light-content');
});

it('navigation chrome uses the app colours', () => {
  const dark = navigationTheme(darkColors, true);
  expect(dark.dark).toBe(true);
  expect(dark.colors).toMatchObject({
    background: darkColors.background,
    card: darkColors.surface,
    border: darkColors.line,
    text: darkColors.text,
    primary: darkColors.accent,
  });
  expect(navigationTheme(lightColors, false).colors.background).toBe(
    lightColors.background,
  );
});

it('a fresh /v1/me from another screen that shows a change made elsewhere is applied', async () => {
  http.get.mockResolvedValue(userWith('light'));
  await setup({ mode: 'light', synced: 'light' });
  await waitFor(() => expect(http.get).toHaveBeenCalled());
  await act(async () => {
    qc!.setQueryData(['me'], userWith('dark'));
  });
  expect(shown()).toBe('dark:dark');
  expect(http.patch).not.toHaveBeenCalled();
});
