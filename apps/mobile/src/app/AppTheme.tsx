import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, StatusBar } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { hashKey, useQueryClient } from '@tanstack/react-query';
import type { UserView } from '@planner/shared';
import { useApi } from '../shared/api/ApiProvider';
import { queryKeys } from '../shared/api/queryClient';
import {
  saveSyncedTheme,
  saveThemeMode,
  type ThemeMode,
  type ThemePrefs,
} from '../shared/lib/localPrefs';
import {
  ThemeModeContext,
  ThemeProvider,
  useTheme,
} from '../shared/ui/ThemeProvider';
import type { Colors } from '../shared/ui/theme';
import { useAuth } from '../features/auth/AuthProvider';
import { createThemeSync, type ThemeSync } from './themeSync';

const ThemeSyncContext = createContext<ThemeSync | null>(null);

/**
 * Status bar icons follow the app theme, not the phone's dark mode. The bar
 * itself is transparent (edge-to-edge), so the screen colour shows behind it.
 */
function SystemBars() {
  const { isDark } = useTheme();
  return <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />;
}

/**
 * Owns the theme mode. It starts from the value saved on the device (loaded
 * before the first render), changes the moment the user picks a theme, and is
 * saved to the server in the background.
 */
export function AppThemeProvider({
  initial,
  children,
}: {
  initial: ThemePrefs;
  children: ReactNode;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const apiRef = useRef(api);
  apiRef.current = api;
  const [mode, setModeState] = useState<ThemeMode>(initial.mode ?? 'system');

  const syncRef = useRef<ThemeSync | null>(null);
  if (!syncRef.current) {
    syncRef.current = createThemeSync(initial, {
      apply: setModeState,
      persistMode: m => {
        saveThemeMode(m);
      },
      persistSynced: m => {
        saveSyncedTheme(m);
      },
      send: async m => {
        // A /v1/me refetch already on its way may carry the old theme.
        await qc.cancelQueries({ queryKey: queryKeys.me });
        const user = await apiRef.current.me.update({ settings: { theme: m } });
        await qc.cancelQueries({ queryKey: queryKeys.me });
        qc.setQueryData(queryKeys.me, user);
        return user.settings.theme;
      },
    });
  }
  const sync = syncRef.current;

  useEffect(() => {
    // Native night mode drives the navigation bar, dialogs and pickers.
    Appearance.setColorScheme(mode === 'system' ? 'auto' : mode);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => sync.choose(m), [sync]);
  const modeValue = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <ThemeSyncContext.Provider value={sync}>
      <ThemeModeContext.Provider value={modeValue}>
        <ThemeProvider mode={mode}>
          <SystemBars />
          {children}
        </ThemeProvider>
      </ThemeModeContext.Provider>
    </ThemeSyncContext.Provider>
  );
}

const ME_HASH = hashKey(queryKeys.me);

/**
 * Feeds server copies of the user's theme into the sync (must sit below
 * AuthProvider): the signed-in user when it changes, and every fresh /v1/me
 * result that other screens load or save.
 */
export function useServerThemeSync(): void {
  const sync = useContext(ThemeSyncContext);
  if (!sync) throw new Error('useServerThemeSync needs AppThemeProvider');
  const qc = useQueryClient();
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  const signedInRef = useRef(signedIn);
  const authTheme = signedIn ? state.user.settings.theme : null;

  useEffect(() => {
    signedInRef.current = state.status === 'signedIn';
    sync.setAuthStatus(state.status);
  }, [sync, state.status]);

  useEffect(() => {
    if (authTheme) sync.observeServer(authTheme);
  }, [sync, authTheme]);

  useEffect(
    () =>
      // Watches the cache without creating a query of its own.
      qc.getQueryCache().subscribe(event => {
        if (event.type !== 'updated' || event.action.type !== 'success') return;
        if (event.query.queryHash !== ME_HASH || !signedInRef.current) return;
        const theme = (event.query.state.data as UserView | undefined)?.settings
          ?.theme;
        if (theme) sync.observeServer(theme);
      }),
    [qc, sync],
  );
}

/** React Navigation chrome (scene background, tab bar border) in our colours. */
export function navigationTheme(
  colors: Colors,
  isDark: boolean,
): NavigationTheme {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: isDark,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.line,
      notification: colors.danger,
    },
  };
}

export function useNavigationTheme(): NavigationTheme {
  const { colors, isDark } = useTheme();
  return useMemo(() => navigationTheme(colors, isDark), [colors, isDark]);
}
