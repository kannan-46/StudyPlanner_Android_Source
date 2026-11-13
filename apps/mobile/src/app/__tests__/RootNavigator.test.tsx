import React from 'react';
import { useWindowDimensions } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UserView } from '@planner/shared';
import { createQueryClient } from '../../shared/api/queryClient';
import { ApiProvider } from '../../shared/api/ApiProvider';
import type { Http } from '../../shared/api/http';
import { ThemeProvider } from '../../shared/ui/ThemeProvider';
import { useAuth } from '../../features/auth/AuthProvider';
import { RootNavigator } from '../RootNavigator';
import { MainTabs, OFFLINE_TEXT } from '../MainTabs';
import { linking } from '../linking';

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
  }) as unknown as UserView;

const refreshUser = jest.fn();
const http = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn().mockResolvedValue({}),
  del: jest.fn(),
} as unknown as Http;

async function setup(child: React.ReactNode = <RootNavigator />) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={createQueryClient()}>
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

it('shows the onboarding placeholder and finishes setup', async () => {
  setState({ status: 'signedIn', user: userWith(null) });
  await setup();
  await fireEvent.press(screen.getByText('Finish setup'));
  expect(http.patch).toHaveBeenCalledWith('/v1/me', {
    onboardingCompleted: true,
  });
  expect(refreshUser).toHaveBeenCalled();
});

it('shows the tabs for a completed user', async () => {
  await setup();
  for (const label of ['Home', 'Schedule', 'Topics', 'Progress', 'Settings']) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
  expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
});

it('shows the offline banner when offline, at 320 dp', async () => {
  mockDims(320);
  mockedNetInfo.mockImplementation((cb: (s: unknown) => void) => {
    cb({ isConnected: false, isInternetReachable: false });
    return jest.fn();
  });
  await setup();
  expect(screen.getByText("No connection — changes can't be saved right now"))
    .toBeTruthy();
});

it('renders MainTabs at 900 dp', async () => {
  mockDims(900, 600);
  await setup(<MainTabs />);
  expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
});

it('maps studyplanner://schedule to the Schedule tab', () => {
  expect(linking.prefixes).toContain('studyplanner://');
  expect(linking.config?.screens).toMatchObject({
    MainTabs: { screens: { Schedule: 'schedule' } },
  });
});
