import React, { useMemo } from 'react';
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
  useAuth,
} from '../features/auth/AuthProvider';
import { ThemeProvider } from '../shared/ui/ThemeProvider';
import { SnackbarProvider } from '../shared/ui/Snackbar';
import { useAppForeground } from '../shared/lib/useAppForeground';
import { linking } from './linking';
import { RootNavigator } from './RootNavigator';

function ThemedApp() {
  const { state } = useAuth();
  const queryClient = useQueryClient();
  useAppForeground(() => {
    queryClient.invalidateQueries();
  });
  const mode =
    state.status === 'signedIn' ? state.user.settings.theme : 'system';
  return (
    <ThemeProvider mode={mode}>
      <SnackbarProvider>
        <NavigationContainer linking={linking}>
          <RootNavigator />
        </NavigationContainer>
      </SnackbarProvider>
    </ThemeProvider>
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
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ApiProvider http={http}>
          <AuthProvider>
            <ThemedApp />
          </AuthProvider>
        </ApiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
