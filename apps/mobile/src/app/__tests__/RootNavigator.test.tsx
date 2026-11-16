import React from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  NavigationContainer,
  getStateFromPath,
} from '@react-navigation/native';
import {
  QueryClientProvider,
  onlineManager,
  type QueryClient,
} from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UserView } from '@planner/shared';
import { createQueryClient } from '../../shared/api/queryClient';
import { ApiProvider } from '../../shared/api/ApiProvider';
import type { Http } from '../../shared/api/http';
import { ThemeProvider } from '../../shared/ui/ThemeProvider';
import { SnackbarProvider, useSnackbar } from '../../shared/ui/Snackbar';
import { useAuth } from '../../features/auth/AuthProvider';
import {
  RootNavigator,
  OFFLINE_LOADING_TEXT,
  OFFLINE_SIGN_IN_TEXT,
  OFFLINE_TEXT,
  SPLASH_HINT_DELAY_MS,
  SPLASH_HINT_TEXT,
} from '../RootNavigator';
import { spacing } from '../../shared/ui/theme';
import { MainTabs } from '../MainTabs';
import { TAB_TITLES } from '../tabTitles';
import { linking } from '../linking';
import { updateAvailableText } from '../../features/appUpdate/UpdateDialog';

jest.mock('../../features/auth/AuthProvider', () => ({
  useAuth: jest.fn(),
  notifySessionEnded: jest.fn(),
}));
jest.mock('../../native/googleAuth', () => ({
  GoogleAuthError: class extends Error {},
  signInWithGoogle: jest.fn(),
  signOutGoogle: jest.fn(),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockedAuth = useAuth as jest.Mock;
const mockedNetInfo = NetInfo.addEventListener as jest.Mock;
const mockDims = (width: number, height = 800) =>
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width,
    height,
    scale: 2,
    fontScale: 1,
  });

const userWith = (onboardingCompletedAt: string | null) =>
  ({
    id: 'u1',
    onboardingCompletedAt,
    settings: { theme: 'light' },
  } as unknown as UserView);

const refreshUser = jest.fn();
const http = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn().mockResolvedValue({}),
  del: jest.fn(),
} as unknown as Http;

const clients: QueryClient[] = [];
afterEach(async () => {
  // The offline tests switch React Query offline; switch it back.
  onlineManager.setOnline(true);
  for (const c of clients.splice(0)) {
    await c.cancelQueries();
    c.clear();
  }
});

async function setup(child: React.ReactNode = <RootNavigator />) {
  const client = createQueryClient();
  // Like the app's client: requests run even when the phone reports offline.
  client.setDefaultOptions({
    queries: { retry: false, networkMode: 'always' },
  });
  clients.push(client);
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <ApiProvider http={http}>
          <ThemeProvider mode="light">
            <NavigationContainer>{child}</NavigationContainer>
          </ThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // Screens stay loading, so no data arrives after a test has finished.
  (http.get as jest.Mock).mockReturnValue(new Promise(() => {}));
  mockDims(360);
  mockedNetInfo.mockReturnValue(jest.fn());
  mockedAuth.mockReturnValue({
    state: { status: 'signedIn', user: userWith('2026-01-01T00:00:00Z') },
    signIn: jest.fn(),
    signOut: jest.fn(),
    refreshUser,
  });
});

const setState = (state: unknown) =>
  mockedAuth.mockReturnValue({ state, refreshUser });

it('shows the splash while loading, at 320 dp', async () => {
  mockDims(320);
  setState({ status: 'loading' });
  await setup();
  expect(screen.getByText('Study Planner')).toBeTruthy();
  expect(screen.getByLabelText('Loading')).toBeTruthy();
});

it('shows sign in when signed out', async () => {
  setState({ status: 'signedOut' });
  await setup();
  expect(screen.getByText('Continue with Google')).toBeTruthy();
});

it('shows the onboarding flow for a new user', async () => {
  setState({ status: 'signedIn', user: userWith(null) });
  await setup();
  expect(await screen.findByText('Step 1 of 4')).toBeTruthy();
});

it('shows the tabs for a completed user', async () => {
  await setup();
  for (const label of ['Home', 'Schedule', 'Topics', 'Progress', 'Settings']) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
  expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
});

const goOffline = () =>
  mockedNetInfo.mockImplementation((cb: (s: unknown) => void) => {
    cb({ isConnected: false, isInternetReachable: false });
    return jest.fn();
  });

it('the offline banner on sign-in asks to connect to sign in', async () => {
  setState({ status: 'signedOut' });
  goOffline();
  await setup();
  expect(screen.getByText(OFFLINE_SIGN_IN_TEXT)).toBeTruthy();
  expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
});

it('reads the offline banner out loud when it appears', async () => {
  const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  setState({ status: 'signedOut' });
  goOffline();
  await setup();
  expect(spy).toHaveBeenCalledWith(OFFLINE_SIGN_IN_TEXT);
  spy.mockRestore();
});

it('the offline banner while starting asks to connect to continue', async () => {
  setState({ status: 'loading' });
  goOffline();
  await setup();
  expect(screen.getByText(OFFLINE_LOADING_TEXT)).toBeTruthy();
});

it('the offline banner during setup still says changes cannot be saved', async () => {
  setState({ status: 'signedIn', user: userWith(null) });
  goOffline();
  await setup();
  expect(screen.getByText(OFFLINE_TEXT)).toBeTruthy();
});

it('the offline banner lines up with the 16 dp page gutter', async () => {
  goOffline();
  await setup();
  const wrap = screen.getByTestId('offline-banner');
  const style = Object.assign({}, ...[wrap.props.style].flat());
  expect(style.paddingHorizontal).toBe(spacing.lg);
});

it('the splash explains a slow start after a few seconds', async () => {
  jest.useFakeTimers();
  try {
    setState({ status: 'loading' });
    await setup();
    expect(screen.queryByText(SPLASH_HINT_TEXT)).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(SPLASH_HINT_DELAY_MS);
    });
    expect(screen.getByText(SPLASH_HINT_TEXT)).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

it('tab labels come from the shared tab titles', async () => {
  await setup();
  expect(Object.keys(TAB_TITLES)).toEqual([
    'Home',
    'Schedule',
    'Topics',
    'Progress',
    'Settings',
  ]);
  for (const title of Object.values(TAB_TITLES)) {
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
  }
});

it('shows the offline banner when offline, at 320 dp', async () => {
  mockDims(320);
  mockedNetInfo.mockImplementation((cb: (s: unknown) => void) => {
    cb({ isConnected: false, isInternetReachable: false });
    return jest.fn();
  });
  await setup();
  expect(screen.getByText(OFFLINE_TEXT)).toBeTruthy();
});

const newerRelease = {
  latestVersionCode: 6,
  latestVersionName: '4.2.0',
  downloadUrl: 'https://github.com/x/y/releases/latest',
  notes: null,
};
const answerVersion = (body: unknown) =>
  (http.get as jest.Mock).mockImplementation((path: string) =>
    path === '/v1/app/version' ? Promise.resolve(body) : new Promise(() => {}),
  );

/** The nearest Modal around an element, or null when it is not in one. */
function modalAround(el: { type: unknown; parent: unknown } | null) {
  let node = el as { type: unknown; parent: unknown } | null;
  while (node && node.type !== 'Modal') {
    node = node.parent as { type: unknown; parent: unknown } | null;
  }
  return node;
}

it('shows the update dialog in a centred modal, not at the top, when offline', async () => {
  answerVersion(newerRelease);
  mockedNetInfo.mockImplementation((cb: (s: unknown) => void) => {
    cb({ isConnected: false, isInternetReachable: false });
    return jest.fn();
  });
  await setup();
  const dialog = await screen.findByTestId('update-dialog');
  expect(screen.getByText('Update available')).toBeTruthy();
  expect(screen.getByText(updateAvailableText('4.2.0'))).toBeTruthy();
  expect(modalAround(dialog)).toBeTruthy();
  // The offline banner stays at the top on its own, outside the dialog.
  const offline = screen.getByText(OFFLINE_TEXT);
  expect(modalAround(offline)).toBeNull();
  expect(screen.queryByTestId('update-banner')).toBeNull();
  expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
});

it('shows the update dialog when online too, at 320 dp', async () => {
  mockDims(320);
  answerVersion(newerRelease);
  await setup();
  expect(await screen.findByTestId('update-dialog')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();
  expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
});

it('does not show the update dialog on sign-in', async () => {
  answerVersion(newerRelease);
  setState({ status: 'signedOut' });
  await setup();
  await screen.findByText('Continue with Google');
  await act(() => new Promise<void>(r => setTimeout(r, 20)));
  expect(screen.queryByTestId('update-dialog')).toBeNull();
});

it('does not show the update dialog during setup', async () => {
  answerVersion(newerRelease);
  setState({ status: 'signedIn', user: userWith(null) });
  await setup();
  await screen.findByText('Step 1 of 4');
  await act(() => new Promise<void>(r => setTimeout(r, 20)));
  expect(screen.queryByTestId('update-dialog')).toBeNull();
});

it('renders MainTabs at 900 dp', async () => {
  mockDims(900, 600);
  await setup(<MainTabs />);
  expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
});

it('maps studyplanner://schedule to the Schedule tab', () => {
  expect(linking.prefixes).toContain('studyplanner://');
  const state = getStateFromPath('schedule', linking.config as never);
  expect(state?.routes[0].name).toBe('MainTabs');
  expect(state?.routes[0].state?.routes[0].name).toBe('Schedule');
  expect(linking.config?.screens).toMatchObject({
    MainTabs: { screens: { Schedule: 'schedule' } },
  });
});

it('tab glyphs keep a fixed size with large system text', async () => {
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width: 360,
    height: 800,
    scale: 2,
    fontScale: 2,
  });
  // Screens stay loading; only the tab bar matters here.
  (http.get as jest.Mock).mockReturnValue(new Promise(() => {}));
  await setup(<MainTabs />);
  for (const g of ['⌂', '▦', '☰', '◔', '⚙']) {
    // Active and inactive copies are both rendered.
    for (const glyph of screen.getAllByText(g)) {
      expect(glyph.props.allowFontScaling).toBe(false);
      const { fontSize, lineHeight } = StyleSheet.flatten(glyph.props.style);
      // Sized from the tab bar's icon box, not from the system text size.
      expect(lineHeight).toBeLessThanOrEqual(25);
      expect(fontSize).toBeLessThan(lineHeight);
    }
  }
});

it('tab labels grow with large system text only up to a limit, so they fit', async () => {
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width: 360,
    height: 800,
    scale: 2,
    fontScale: 2,
  });
  (http.get as jest.Mock).mockReturnValue(new Promise(() => {}));
  await setup(<MainTabs />);
  for (const name of ['Home', 'Schedule', 'Topics', 'Progress', 'Settings']) {
    const labels = screen
      .getAllByText(name)
      .filter(t => t.props.maxFontSizeMultiplier !== undefined);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.3);
      expect(label.props.numberOfLines).toBe(1);
      expect(
        StyleSheet.flatten(label.props.style).fontSize,
      ).toBeLessThanOrEqual(13);
    }
  }
});

it('snackbars appear above the tab bar instead of covering it', async () => {
  let snackbar!: ReturnType<typeof useSnackbar>;
  function Grab() {
    snackbar = useSnackbar();
    return null;
  }
  await setup(
    <SnackbarProvider>
      <Grab />
      <MainTabs />
    </SnackbarProvider>,
  );
  await fireEvent(screen.getByTestId('tab-bar'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 576, width: 360, height: 64 } },
  });
  await act(async () => {
    snackbar.show({ message: 'Revision 1 done' });
  });
  const { bottom } = StyleSheet.flatten(
    screen.getByTestId('snackbar').props.style,
  );
  expect(bottom).toBeGreaterThanOrEqual(64);
});
