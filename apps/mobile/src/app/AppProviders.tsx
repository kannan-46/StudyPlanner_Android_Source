import React, { useEffect, useMemo, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider } from '../shared/api/ApiProvider';
import { createHttp } from '../shared/api/http';
import { createQueryClient } from '../shared/api/queryClient';
import { tokenStore } from '../shared/api/tokenStore';
import { API_BASE_URL } from '../native/config';
import {
  AuthProvider,
  notifySessionEnded,
} from '../features/auth/AuthProvider';
import { SnackbarProvider } from '../shared/ui/Snackbar';
import { loadThemePrefs, type ThemePrefs } from '../shared/lib/localPrefs';
import { useAppForeground } from '../shared/lib/useAppForeground';
import {
  AppThemeProvider,
  useNavigationTheme,
  useServerThemeSync,
} from './AppTheme';
import { linking } from './linking';
import { RootNavigator } from './RootNavigator';

function ThemedNavigation() {
  const theme = useNavigationTheme();
  return (
    <NavigationContainer linking={linking} theme={theme}>
      <RootNavigator />
    </NavigationContainer>
  );
}

function ThemedApp() {
  const queryClient = useQueryClient();
  useServerThemeSync();
  useAppForeground(() => {
    queryClient.invalidateQueries();
  });
  return (
    <SnackbarProvider>
      <ThemedNavigation />
    </SnackbarProvider>
  );
}

export function AppProviders() {
  const queryClient = useMemo(() => createQueryClient(), []);
  const http = useMemo(
    () =>
      createHttp({
        baseUrl: API_BASE_URL,
        tokens: tokenStore,
        onSessionEnded: notifySessionEnded,
      }),
    [],
  );
  // The saved theme is read before anything is drawn, so the first frame is
  // already in the right colours (the read takes a few milliseconds).
  const [themePrefs, setThemePrefs] = useState<ThemePrefs | null>(null);
  useEffect(() => {
    let live = true;
    loadThemePrefs().then(p => {
      if (live) setThemePrefs(p);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!themePrefs) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ApiProvider http={http}>
          <AppThemeProvider initial={themePrefs}>
            <AuthProvider>
              <ThemedApp />
            </AuthProvider>
          </AppThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
