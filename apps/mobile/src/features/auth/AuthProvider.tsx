import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Text } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { UserView } from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import {
  ApiError,
  isSessionEndedError,
  userMessage,
} from '../../shared/api/errors';
import { isUserDataQuery, queryKeys } from '../../shared/api/queryClient';
import { endSession } from '../../shared/api/session';
import { tokenStore } from '../../shared/api/tokenStore';
import { signInWithGoogle, signOutGoogle } from '../../native/googleAuth';
import { clearReminders } from '../../native/reminders';
import { clearFocusSession } from '../../shared/lib/focusSession';
import { clearOnboardingStep } from '../../shared/lib/localPrefs';
import { useAppForeground } from '../../shared/lib/useAppForeground';
import { useOnline } from '../../shared/lib/useOnline';
import { useAnnounce } from '../../shared/ui/announce';
import { Button } from '../../shared/ui/Button';
import { Screen } from '../../shared/ui/Screen';
import { useTheme } from '../../shared/ui/ThemeProvider';

/**
 * Why the user is signed out. 'sessionEnded': the app signed them out by
 * itself (the session expired or was ended elsewhere), so the sign-in screen
 * explains it. No reason: they signed out themselves, or never signed in.
 */
export type SignedOutReason = 'sessionEnded';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; reason?: SignedOutReason }
  | { status: 'signedIn'; user: UserView };

export interface AuthContextValue {
  state: AuthState;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  refreshUser(): Promise<void>;
}

/** How long the background server logout may take before we give up. */
export const LOGOUT_TIMEOUT_MS = 5000;

/**
 * Waits before each extra try of the first /v1/me (a sleeping free server
 * often fails the first request and answers the next one).
 */
export const BOOTSTRAP_RETRY_DELAYS_MS = [1000, 2000];
/** No extra tries once start-up has already taken this long. */
const BOOTSTRAP_RETRY_BUDGET_MS = 15_000;

/** Offline text on the start-up error screen. */
export const STARTUP_OFFLINE_TEXT =
  'No connection — connect to the internet to continue';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Connection problems and server hiccups are worth another try. */
const isTransient = (e: unknown) =>
  e instanceof ApiError && (e.code === 'NETWORK' || e.status >= 500);

// createHttp is built before the provider tree, so it reports an ended
// session through this module-level bridge; the mounted AuthProvider listens.
let sessionEndedHandler: (() => void) | null = null;
export function notifySessionEnded(): void {
  sessionEndedHandler?.();
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { auth, me } = useApi();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [startupError, setStartupError] = useState<unknown>(null);
  const cachedUser = useRef<UserView | null>(null);
  const mounted = useRef(true);

  const set = useCallback((s: AuthState) => {
    if (mounted.current) setState(s);
  }, []);

  /** Signed in: the user also goes into the /v1/me cache (no second load). */
  const signedIn = useCallback(
    (user: UserView) => {
      cachedUser.current = user;
      queryClient.setQueryData(queryKeys.me, user);
      set({ status: 'signedIn', user });
    },
    [queryClient, set],
  );

  const localSignOut = useCallback(
    async (callLogout: boolean, reason?: SignedOutReason) => {
      // Replies to anything still on its way now belong to an old session.
      endSession();
      let refreshToken: string | undefined;
      if (callLogout) {
        try {
          refreshToken = (await tokenStore.get())?.refreshToken;
        } catch {
          // No readable token: nothing to revoke on the server.
        }
      }
      // Sign out on the phone first, so it never waits for the network.
      await tokenStore.clear().catch(() => {});
      await clearReminders().catch(() => {});
      await clearFocusSession();
      await clearOnboardingStep();
      await signOutGoogle().catch(() => {});
      cachedUser.current = null;
      queryClient.clear();
      set(reason ? { status: 'signedOut', reason } : { status: 'signedOut' });
      // Then tell the server, best effort and never awaited.
      if (refreshToken) {
        withTimeout(auth.logout(refreshToken), LOGOUT_TIMEOUT_MS).catch(
          () => {},
        );
      }
    },
    [auth, queryClient, set],
  );

  const bootstrap = useCallback(async () => {
    setStartupError(null);
    let tokens;
    try {
      tokens = await tokenStore.get();
    } catch {
      tokens = null;
    }
    if (!tokens) {
      set({ status: 'signedOut' });
      return;
    }
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        const user = await me.get();
        if (mounted.current) signedIn(user);
        return;
      } catch (e) {
        if (!mounted.current) return;
        // Signed out while this load was on its way: already handled.
        if (isSessionEndedError(e)) return;
        if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') {
          await localSignOut(false, 'sessionEnded');
          return;
        }
        const delay = BOOTSTRAP_RETRY_DELAYS_MS[attempt];
        if (
          isTransient(e) &&
          delay !== undefined &&
          Date.now() - started < BOOTSTRAP_RETRY_BUDGET_MS
        ) {
          await sleep(delay);
          if (!mounted.current) return;
          continue;
        }
        if (cachedUser.current) {
          set({ status: 'signedIn', user: cachedUser.current });
        } else {
          setStartupError(e);
        }
        return;
      }
    }
  }, [me, set, signedIn, localSignOut]);

  useEffect(() => {
    mounted.current = true;
    bootstrap();
    return () => {
      mounted.current = false;
    };
  }, [bootstrap]);

  useEffect(() => {
    const handler = () => {
      localSignOut(false, 'sessionEnded');
    };
    sessionEndedHandler = handler;
    return () => {
      if (sessionEndedHandler === handler) sessionEndedHandler = null;
    };
  }, [localSignOut]);

  const signIn = useCallback(async () => {
    const idToken = await signInWithGoogle();
    const res = await auth.googleSignIn(idToken, 'Android');
    await tokenStore.set({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
    });
    // A save from the previous session that finished after sign-out may have
    // written its data (or rolled back to it) meanwhile: start empty.
    queryClient.getMutationCache().clear();
    queryClient.removeQueries({ predicate: isUserDataQuery });
    signedIn(res.user);
  }, [auth, queryClient, signedIn]);

  const signOut = useCallback(() => localSignOut(true), [localSignOut]);

  const refreshUser = useCallback(async () => {
    const user = await me.get();
    signedIn(user);
  }, [me, signedIn]);

  const value = useMemo(
    () => ({ state, signIn, signOut, refreshUser }),
    [state, signIn, signOut, refreshUser],
  );

  if (startupError && state.status === 'loading') {
    return <StartupError error={startupError} onRetry={bootstrap} />;
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Shown when the first load failed even after a few tries. It tries again by
 * itself when the connection comes back or the app returns to the screen.
 */
function StartupError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { colors, spacing } = useTheme();
  const online = useOnline();
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) onRetry();
    wasOnline.current = online;
  }, [online, onRetry]);
  useAppForeground(onRetry);
  const message = online ? userMessage(error) : STARTUP_OFFLINE_TEXT;
  useAnnounce(message);
  return (
    <Screen>
      <Text
        accessibilityRole="alert"
        style={{
          color: colors.text,
          textAlign: 'center',
          fontSize: 16,
          marginTop: spacing.xxl,
          marginBottom: spacing.lg,
        }}
      >
        {message}
      </Text>
      <Button title="Retry" onPress={onRetry} />
    </Screen>
  );
}
