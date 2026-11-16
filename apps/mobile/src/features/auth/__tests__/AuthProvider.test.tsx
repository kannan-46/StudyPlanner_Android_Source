import React from 'react';
import { Text, useWindowDimensions } from 'react-native';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
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
import { cancelOneShot, clearReminders } from '../../../native/reminders';
import {
  AuthProvider,
  LOGOUT_TIMEOUT_MS,
  STARTUP_OFFLINE_TEXT,
  useAuth,
  notifySessionEnded,
} from '../AuthProvider';
import { SESSION_ENDED_TEXT, SignInScreen } from '../SignInScreen';
import { useUpdateMe } from '../../me/hooks';
import { useCompleteRevision } from '../../revisions/hooks';

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
jest.mock('../../../native/reminders', () => ({
  clearReminders: jest.fn(),
  cancelOneShot: jest.fn(),
}));
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

let http: { get: jest.Mock; post: jest.Mock; patch: jest.Mock };
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
  http = { get: jest.fn(), post: jest.fn(), patch: jest.fn() };
  ts.get.mockResolvedValue(null);
  ts.set.mockResolvedValue(undefined);
  ts.clear.mockResolvedValue(undefined);
  (clearReminders as jest.Mock).mockResolvedValue(undefined);
  (cancelOneShot as jest.Mock).mockResolvedValue(undefined);
  (NetInfo.addEventListener as jest.Mock).mockReturnValue(jest.fn());
  (signOutGoogle as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  // Queries the provider filled (e.g. /v1/me) hold a garbage-collect timer.
  qc?.clear();
});

it('stored tokens and me OK -> signedIn', async () => {
  ts.get.mockResolvedValue(tokens);
  http.get.mockResolvedValue(user);
  await setup();
  await waitFor(() => expect(probe()).toBe('in:Asha'));
});

it('puts the signed-in user into the /v1/me cache (no second load)', async () => {
  ts.get.mockResolvedValue(tokens);
  http.get.mockResolvedValue(user);
  await setup();
  await waitFor(() => expect(probe()).toBe('in:Asha'));
  expect(qc.getQueryData(['me'])).toEqual(user);
  expect(http.get).toHaveBeenCalledTimes(1);
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
  // Not a connection problem: no second try.
  expect(http.get).toHaveBeenCalledTimes(1);
});

it('explains a session that ended on a cold start', async () => {
  ts.get.mockResolvedValue(tokens);
  http.get.mockRejectedValue(new ApiError('UNAUTHENTICATED', 401));
  await setup(<SignInScreen />);
  expect(await screen.findByText(SESSION_ENDED_TEXT)).toBeTruthy();
});

it('tries the first load again by itself after a network blip', async () => {
  jest.useFakeTimers();
  ts.get.mockResolvedValue(tokens);
  http.get
    .mockRejectedValueOnce(new ApiError('NETWORK', 0))
    .mockResolvedValue(user);
  await setup();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1000);
  });
  expect(probe()).toBe('in:Asha');
  expect(http.get).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Retry')).toBeNull();
});

it('a waking server (503) is tried again too', async () => {
  jest.useFakeTimers();
  ts.get.mockResolvedValue(tokens);
  http.get
    .mockRejectedValueOnce(new ApiError('SERVICE_UNAVAILABLE', 503))
    .mockRejectedValueOnce(new ApiError('INTERNAL', 500))
    .mockResolvedValue(user);
  await setup();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(3000);
  });
  expect(probe()).toBe('in:Asha');
  expect(http.get).toHaveBeenCalledTimes(3);
});

it('NETWORK at start without cache shows retry after 3 tries, then recovers', async () => {
  jest.useFakeTimers();
  ts.get.mockResolvedValue(tokens);
  http.get
    .mockRejectedValueOnce(new ApiError('NETWORK', 0))
    .mockRejectedValueOnce(new ApiError('NETWORK', 0))
    .mockRejectedValueOnce(new ApiError('NETWORK', 0))
    .mockResolvedValue(user);
  await setup();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(3000);
  });
  expect(http.get).toHaveBeenCalledTimes(3);
  expect(screen.getByText("Can't reach the server — try again")).toBeTruthy();
  await fireEvent.press(screen.getByText('Retry'));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(probe()).toBe('in:Asha');
});

it('a request the server refuses (4xx) is not tried again', async () => {
  ts.get.mockResolvedValue(tokens);
  http.get.mockRejectedValue(new ApiError('RATE_LIMITED', 429));
  await setup();
  expect(
    await screen.findByText('Too many tries — wait a minute and try again'),
  ).toBeTruthy();
  expect(http.get).toHaveBeenCalledTimes(1);
});

it('the start-up error says when the phone is offline and retries on reconnect', async () => {
  jest.useFakeTimers();
  let report: (s: unknown) => void = () => {};
  (NetInfo.addEventListener as jest.Mock).mockImplementation(
    (cb: (s: unknown) => void) => {
      report = cb;
      cb({ isConnected: false, isInternetReachable: false });
      return jest.fn();
    },
  );
  ts.get.mockResolvedValue(tokens);
  http.get.mockRejectedValue(new ApiError('NETWORK', 0));
  await setup();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(3000);
  });
  expect(screen.getByText(STARTUP_OFFLINE_TEXT)).toBeTruthy();
  http.get.mockResolvedValue(user);
  await act(async () => {
    report({ isConnected: true, isInternetReachable: true });
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(probe()).toBe('in:Asha');
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
  expect(qc.getQueryData(['me'])).toEqual(user);
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
  expect(cancelOneShot).toHaveBeenCalledWith('focus_timer');
});

it('the sign-in screen explains an ended session, not a manual sign-out', async () => {
  ts.get.mockResolvedValue(tokens);
  http.get.mockResolvedValue(user);
  http.post.mockResolvedValue(undefined);
  function Out() {
    const { signOut, state } = useAuth();
    if (state.status === 'signedOut') return <SignInScreen />;
    return (
      <Text testID="out" onPress={() => signOut()}>
        out
      </Text>
    );
  }
  await setup(<Out />);
  await fireEvent.press(await screen.findByTestId('out'));
  expect(await screen.findByText('Continue with Google')).toBeTruthy();
  expect(screen.queryByText(SESSION_ENDED_TEXT)).toBeNull();
});

it('after an ended session the sign-in screen shows why', async () => {
  ts.get.mockResolvedValue(tokens);
  http.get.mockResolvedValue(user);
  function Gate() {
    const { state } = useAuth();
    return state.status === 'signedOut' ? <SignInScreen /> : <Probe />;
  }
  await setup(<Gate />);
  await waitFor(() => expect(probe()).toBe('in:Asha'));
  await act(async () => {
    notifySessionEnded();
  });
  expect(await screen.findByText(SESSION_ENDED_TEXT)).toBeTruthy();
});

it('signOut stops the focus timer and forgets per-user data on the phone', async () => {
  await AsyncStorage.setItem(
    'prefs.focusTimer',
    JSON.stringify({ status: 'running', endsAt: 1, remainingMs: 1 }),
  );
  await AsyncStorage.setItem(
    'prefs.onboardingStep',
    JSON.stringify({ userId: 'u1', step: 3 }),
  );
  await signedInSetup();
  await fireEvent.press(screen.getByTestId('out'));
  await waitFor(() => expect(probe()).toBe('signedOut'));
  expect(cancelOneShot).toHaveBeenCalledWith('focus_timer');
  expect(await AsyncStorage.getItem('prefs.focusTimer')).toBeNull();
  expect(await AsyncStorage.getItem('prefs.onboardingStep')).toBeNull();
});

it('a save that finishes after sign-out does not reach the next session', async () => {
  ts.get.mockResolvedValue(tokens);
  http.get.mockResolvedValue(user);
  http.post.mockResolvedValue(undefined);
  let finishSave: (u: UserView) => void = () => {};
  http.patch.mockReturnValue(
    new Promise<UserView>(r => {
      finishSave = r;
    }),
  );
  function Harness() {
    const { signOut } = useAuth();
    const update = useUpdateMe();
    return (
      <>
        <Text
          testID="save"
          onPress={() => update.mutate({ settings: { reminderTime: '09:00' } })}
        >
          save
        </Text>
        <Text testID="out" onPress={() => signOut()}>
          out
        </Text>
      </>
    );
  }
  await setup(
    <>
      <Probe />
      <Harness />
    </>,
  );
  await waitFor(() => expect(probe()).toBe('in:Asha'));
  await fireEvent.press(screen.getByTestId('save'));
  await waitFor(() => expect(http.patch).toHaveBeenCalled());
  await fireEvent.press(screen.getByTestId('out'));
  await waitFor(() => expect(probe()).toBe('signedOut'));
  await act(async () => {
    finishSave(user);
  });
  expect(qc.getQueryData(['me'])).toBeUndefined();
});

it('a revision save rolled back after sign-out never shows in the next account', async () => {
  ts.get.mockResolvedValue(tokens);
  http.get.mockImplementation(async (path: string) => {
    if (path === '/v1/me') return user;
    throw new ApiError('NETWORK', 0);
  });
  let failDone: (e: unknown) => void = () => {};
  const other = { id: 'u2', email: 'b@b.c', name: 'Bala' } as UserView;
  http.post.mockImplementation((path: string) => {
    if (path.endsWith('/complete')) {
      return new Promise((_, reject) => {
        failDone = reject;
      });
    }
    if (path === '/v1/auth/google') {
      return Promise.resolve({ ...tokens, user: other });
    }
    return Promise.resolve(undefined);
  });
  (signInWithGoogle as jest.Mock).mockResolvedValue('idtok');
  const agendaKey = ['agenda', '2026-11-16', 30];
  const item = {
    topicId: 't1',
    topicName: 'Old account topic',
    subjectId: 's1',
    subjectName: 'Anatomy',
    revisionId: 'r1',
    step: 1,
    totalSteps: 6,
    dueOn: '2026-11-16',
    bucket: 'today',
  };
  function Harness() {
    const { signOut, signIn } = useAuth();
    const complete = useCompleteRevision('t1');
    return (
      <>
        <Text
          testID="done"
          onPress={() =>
            complete.mutate({
              topicId: 't1',
              revisionId: 'r1',
              doneOn: '2026-11-16',
            })
          }
        >
          done
        </Text>
        <Text testID="out" onPress={() => signOut()}>
          out
        </Text>
        <Text testID="go" onPress={() => signIn().catch(() => {})}>
          go
        </Text>
      </>
    );
  }
  await setup(
    <>
      <Probe />
      <Harness />
    </>,
  );
  await waitFor(() => expect(probe()).toBe('in:Asha'));
  qc.setQueryData(agendaKey, [item]);
  await fireEvent.press(screen.getByTestId('done'));
  await waitFor(() =>
    expect(http.post).toHaveBeenCalledWith(
      '/v1/topics/t1/revisions/r1/complete',
      { doneOn: '2026-11-16' },
    ),
  );
  await fireEvent.press(screen.getByTestId('out'));
  await waitFor(() => expect(probe()).toBe('signedOut'));
  // The reply arrives after sign-out (http drops it as sessionEnded).
  await act(async () => {
    failDone(
      new ApiError('UNAUTHENTICATED', 401, undefined, { sessionEnded: true }),
    );
  });
  await fireEvent.press(screen.getByTestId('go'));
  await waitFor(() => expect(probe()).toBe('in:Bala'));
  expect(qc.getQueryData(agendaKey)).toBeUndefined();
  expect(qc.getQueryData(['topic', 't1'])).toBeUndefined();
  expect(qc.getQueryData(['me'])).toEqual(other);
});

it('a start-up load dropped by a sign-out is not reported as an ended session', async () => {
  ts.get.mockResolvedValue(tokens);
  http.get.mockRejectedValue(
    new ApiError('UNAUTHENTICATED', 401, undefined, { sessionEnded: true }),
  );
  await setup(
    <>
      <Probe />
      <SignInScreen />
    </>,
  );
  await act(async () => {});
  expect(ts.clear).not.toHaveBeenCalled();
  expect(screen.queryByText(SESSION_ENDED_TEXT)).toBeNull();
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
