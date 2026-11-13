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
import { ApiError } from '../../shared/api/errors';
import { tokenStore } from '../../shared/api/tokenStore';
import { signInWithGoogle, signOutGoogle } from '../../native/googleAuth';
import { clearReminders } from '../../native/reminders';
import { Button } from '../../shared/ui/Button';
import { Screen } from '../../shared/ui/Screen';
import { useTheme } from '../../shared/ui/ThemeProvider';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: UserView };

export interface AuthContextValue {
  state: AuthState;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  refreshUser(): Promise<void>;
}

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
  const [startupError, setStartupError] = useState(false);
  const cachedUser = useRef<UserView | null>(null);
  const mounted = useRef(true);

  const set = useCallback((s: AuthState) => {
    if (mounted.current) setState(s);
  }, []);

  const bootstrap = useCallback(async () => {
    setStartupError(false);
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
    try {
      const user = await me.get();
      cachedUser.current = user;
      set({ status: 'signedIn', user });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') {
        await tokenStore.clear().catch(() => {});
        set({ status: 'signedOut' });
      } else if (cachedUser.current) {
        set({ status: 'signedIn', user: cachedUser.current });
      } else if (mounted.current) {
        setStartupError(true);
      }
    }
  }, [me, set]);

  useEffect(() => {
    mounted.current = true;
    bootstrap();
    return () => {
      mounted.current = false;
    };
  }, [bootstrap]);

  const localSignOut = useCallback(
    async (callLogout: boolean) => {
      if (callLogout) {
        try {
          const tokens = await tokenStore.get();
          if (tokens) await auth.logout(tokens.refreshToken);
        } catch {
          // best effort
        }
      }
      await tokenStore.clear().catch(() => {});
      await clearReminders().catch(() => {});
      await signOutGoogle().catch(() => {});
      cachedUser.current = null;
      queryClient.clear();
      set({ status: 'signedOut' });
    },
    [auth, queryClient, set],
  );

  useEffect(() => {
    const handler = () => {
      localSignOut(false);
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
    cachedUser.current = res.user;
    set({ status: 'signedIn', user: res.user });
  }, [auth, set]);

  const signOut = useCallback(() => localSignOut(true), [localSignOut]);

  const refreshUser = useCallback(async () => {
    const user = await me.get();
    cachedUser.current = user;
    set({ status: 'signedIn', user });
  }, [me, set]);

  const value = useMemo(
    () => ({ state, signIn, signOut, refreshUser }),
    [state, signIn, signOut, refreshUser],
  );

  if (startupError && state.status === 'loading') {
    return <StartupError onRetry={bootstrap} />;
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function StartupError({ onRetry }: { onRetry: () => void }) {
  const { colors, spacing } = useTheme();
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
        Can't reach the server
      </Text>
      <Button title="Retry" onPress={onRetry} />
    </Screen>
  );
}
