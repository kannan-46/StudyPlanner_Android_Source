import React from 'react';
import { Text, useWindowDimensions } from 'react-native';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UserView } from '@planner/shared';
import { createQueryClient } from '../../../shared/api/queryClient';
import { ApiProvider } from '../../../shared/api/ApiProvider';
import { ApiError } from '../../../shared/api/errors';
import type { Http } from '../../../shared/api/http';
import { tokenStore } from '../../../shared/api/tokenStore';
import {
  signInWithGoogle,
  signOutGoogle,
  GoogleAuthError,
} from '../../../native/googleAuth';
import { clearReminders } from '../../../native/reminders';
import {
  AuthProvider,
  LOGOUT_TIMEOUT_MS,
  useAuth,
  notifySessionEnded,
} from '../AuthProvider';
import { SignInScreen } from '../SignInScreen';

jest.mock('../../../shared/api/tokenStore', () => ({
  tokenStore: { get: jest.fn(), set: jest.fn(), clear: jest.fn() },
}));
jest.mock('../../../native/googleAuth', () => {
  class MockGoogleAuthError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    GoogleAuthError: MockGoogleAuthError,
    signInWithGoogle: jest.fn(),
    signOutGoogle: jest.fn(),
  };
});
jest.mock('../../../native/reminders', () => ({ clearReminders: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const user = { id: 'u1', email: 'a@b.c', name: 'Asha' } as unknown as UserView;
const tokens = { accessToken: 'a', refreshToken: 'r' };
const ts = tokenStore as jest.Mocked<typeof tokenStore>;

function Probe() {
  const { state } = useAuth();
  return (
    <Text testID="probe">
      {state.status === 'signedIn'
        ? `in:${(state.user as unknown as { name: string }).name}`
        : state.status}
    </Text>
  );
}
const probe = () => screen.getByTestId('probe').props.children;

let http: { get: jest.Mock; post: jest.Mock };
let qc: ReturnType<typeof createQueryClient>;

function setup(child: React.ReactNode = <Probe />) {
  qc = createQueryClient();
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={qc}>
        <ApiProvider http={http as unknown as Http}>
          <AuthProvider>{child}</AuthProvider>
        </ApiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width: 360,
    height: 640,
    scale: 2,
    fontScale: 1,
  });
  http = { get: jest.fn(), post: jest.fn() };
  ts.get.mockResolvedValue(null);
  ts.set.mockResolvedValue(undefined);
  ts.clear.mockResolvedValue(undefined);
  (clearReminders as jest.Mock).mockResolvedValue(undefined);
  (signOutGoogle as jest.Mock).mockResolvedValue(undefined);
});

it('stored tokens and me OK -> signedIn', async () => {
  ts.get.mockResolvedValue(tokens);
  http.get.mockResolvedValue(user);
  await setup();
  await waitFor(() => expect(probe()).toBe('in:Asha'));
});

it('no tokens -> signedOut', async () => {
  await setup();
  await waitFor(() => expect(probe()).toBe('signedOut'));
});

it('stored tokens and UNAUTHENTICATED -> cleared, signedOut', async () => {
  ts.get.mockResolvedValue(tokens);
  http.get.mockRejectedValue(new ApiError('UNAUTHENTICATED', 401));
  await setup();
  await waitFor(() => expect(probe()).toBe('signedOut'));
  expect(ts.clear).toHaveBeenCalled();
});

it('NETWORK at start without cache shows retry, then recovers', async () => {
  ts.get.mockResolvedValue(tokens);
  http.get
    .mockRejectedValueOnce(new ApiError('NETWORK', 0))
    .mockResolvedValue(user);
  await setup();
  expect(await screen.findByText("Can't reach the server")).toBeTruthy();
  await fireEvent.press(screen.getByText('Retry'));
  await waitFor(() => expect(probe()).toBe('in:Asha'));
});

function SignInHarness() {
  const { signIn } = useAuth();
  return (
    <Text testID="go" onPress={() => signIn().catch(() => {})}>
      go
    </Text>
  );
}

it('signIn success stores tokens and sets user', async () => {
  (signInWithGoogle as jest.Mock).mockResolvedValue('idtok');
  http.post.mockResolvedValue({ ...tokens, user });
  await setup(
    <>
      <Probe />
      <SignInHarness />
    </>,
  );
  await waitFor(() => expect(probe()).toBe('signedOut'));
  await fireEvent.press(screen.getByTestId('go'));
  await waitFor(() => expect(probe()).toBe('in:Asha'));
  expect(http.post).toHaveBeenCalledWith('/v1/auth/google', {
    idToken: 'idtok',
    deviceLabel: 'Android',
  });
  expect(ts.set).toHaveBeenCalledWith(tokens);
});

it('signIn cancelled stays signedOut with no error text', async () => {
  (signInWithGoogle as jest.Mock).mockRejectedValue(
    new GoogleAuthError('E_CANCELLED'),
  );
  await setup(
    <>
      <Probe />
      <SignInScreen />
    </>,
  );
  await fireEvent.press(await screen.findByText('Continue with Google'));
  await waitFor(() => expect(signInWithGoogle).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(probe()).toBe('signedOut');
  expect(screen.getByText('Continue with Google')).toBeTruthy();
});

it('signIn E_NO_ACCOUNT and E_CONFIG show inline messages', async () => {
  (signInWithGoogle as jest.Mock).mockRejectedValueOnce(
    new GoogleAuthError('E_NO_ACCOUNT'),
  );
  await setup(<SignInScreen />);
  await fireEvent.press(await screen.findByText('Continue with Google'));
  expect(
    await screen.findByText('Add a Google account to this phone first'),
  ).toBeTruthy();
  (signInWithGoogle as jest.Mock).mockRejectedValueOnce(
    new GoogleAuthError('E_CONFIG'),
  );
  await fireEvent.press(screen.getByText('Continue with Google'));
  expect(
    await screen.findByText('Google sign-in is not configured'),
  ).toBeTruthy();
});

async function signedInSetup() {
  ts.get.mockResolvedValue(tokens);
  http.get.mockResolvedValue(user);
  http.post.mockResolvedValue(undefined);
  function Out() {
    const { signOut } = useAuth();
    return (
      <Text testID="out" onPress={() => signOut()}>
        out
      </Text>
    );
  }
  await setup(
    <>
      <Probe />
      <Out />
    </>,
  );
  await waitFor(() => expect(probe()).toBe('in:Asha'));
}

it('signOut calls logout, clear, reminders, google signOut, queryClient.clear', async () => {
  await signedInSetup();
  const clearSpy = jest.spyOn(qc, 'clear');
  await fireEvent.press(screen.getByTestId('out'));
  await waitFor(() => expect(probe()).toBe('signedOut'));
  expect(http.post).toHaveBeenCalledWith('/v1/auth/logout', {
    refreshToken: 'r',
  });
  expect(ts.clear).toHaveBeenCalled();
  expect(clearReminders).toHaveBeenCalled();
  expect(signOutGoogle).toHaveBeenCalled();
  expect(clearSpy).toHaveBeenCalled();
});

it('signOut still completes when logout fails', async () => {
  await signedInSetup();
  http.post.mockRejectedValue(new ApiError('NETWORK', 0));
  await fireEvent.press(screen.getByTestId('out'));
  await waitFor(() => expect(probe()).toBe('signedOut'));
  expect(ts.clear).toHaveBeenCalled();
});

it('signOut is immediate even when the server never answers', async () => {
  await signedInSetup();
  jest.useFakeTimers();
  const timeoutSpy = jest.spyOn(globalThis, 'setTimeout');
  try {
    http.post.mockReturnValue(new Promise(() => {}));
    await fireEvent.press(screen.getByTestId('out'));
    await waitFor(() => expect(probe()).toBe('signedOut'));
    expect(ts.clear).toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledWith('/v1/auth/logout', {
      refreshToken: 'r',
    });
    expect(timeoutSpy).toHaveBeenCalledWith(
      expect.any(Function),
      LOGOUT_TIMEOUT_MS,
    );
    // The background logout gives up after the short timeout, quietly.
    await act(async () => {
      jest.advanceTimersByTime(LOGOUT_TIMEOUT_MS);
    });
    expect(probe()).toBe('signedOut');
  } finally {
    timeoutSpy.mockRestore();
    jest.useRealTimers();
  }
});

it('signOut clears the phone before contacting the server', async () => {
  await signedInSetup();
  const order: string[] = [];
  ts.clear.mockImplementation(async () => {
    order.push('clear');
  });
  http.post.mockImplementation(async () => {
    order.push('logout');
  });
  await fireEvent.press(screen.getByTestId('out'));
  await waitFor(() => expect(order).toEqual(['clear', 'logout']));
});

it('onSessionEnded triggers local sign-out', async () => {
  await signedInSetup();
  await act(async () => {
    notifySessionEnded();
  });
  await waitFor(() => expect(probe()).toBe('signedOut'));
  expect(clearReminders).toHaveBeenCalled();
});

describe('SignInScreen responsive', () => {
  it.each([320, 1000])('renders at %i dp', async w => {
    (useWindowDimensions as jest.Mock).mockReturnValue({
      width: w,
      height: 700,
      scale: 2,
      fontScale: 1,
    });
    await setup(<SignInScreen />);
    expect(await screen.findByText('Continue with Google')).toBeTruthy();
    expect(screen.getByText('Study Planner')).toBeTruthy();
    const c = screen.getByTestId('responsive-container');
    const style = Object.assign({}, ...[c.props.style].flat());
    if (w >= 700) expect(style.maxWidth).toBe(720);
    else expect(style.maxWidth).toBeUndefined();
  });
});
