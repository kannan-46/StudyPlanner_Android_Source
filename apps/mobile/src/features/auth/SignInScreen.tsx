import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { useAnnounce } from '../../shared/ui/announce';
import { Banner } from '../../shared/ui/Banner';
import { Button } from '../../shared/ui/Button';
import { Screen } from '../../shared/ui/Screen';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useResponsive } from '../../shared/ui/responsive';
import { ApiError, userMessage } from '../../shared/api/errors';
import { GoogleAuthError } from '../../native/googleAuth';
import { useAuth } from './AuthProvider';

/** Shown when the app signed the user out by itself. */
export const SESSION_ENDED_TEXT =
  "You've been signed out — sign in again to continue";

/** Shown after a failed tap on 'Continue with Google' while offline. */
export const SIGN_IN_OFFLINE_TEXT =
  'No connection — connect to the internet to sign in';

function errorText(e: unknown): string | null {
  const cancelled = e instanceof GoogleAuthError && e.code === 'E_CANCELLED';
  if (!cancelled && !onlineManager.isOnline()) return SIGN_IN_OFFLINE_TEXT;
  if (e instanceof GoogleAuthError) {
    switch (e.code) {
      case 'E_CANCELLED':
        return null;
      case 'E_NO_ACCOUNT':
        return 'Add a Google account to this phone first';
      case 'E_CONFIG':
        return 'Google sign-in is not configured';
      default:
        return "Couldn't sign in — try again";
    }
  }
  if (e instanceof ApiError) return userMessage(e);
  return "Couldn't sign in — try again";
}

export function SignInScreen() {
  const { signIn, state } = useAuth();
  const sessionEnded =
    state.status === 'signedOut' && state.reason === 'sessionEnded';
  const { colors, spacing } = useTheme();
  const { isLandscape, height } = useResponsive();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Role 'alert' is silent on Android, so say the error out loud.
  useAnnounce(error);

  const onPress = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <View
        style={{
          flexGrow: 1,
          justifyContent: 'center',
          gap: spacing.lg,
          paddingVertical:
            isLandscape || height < 500 ? spacing.lg : spacing.xxl,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ color: colors.text, fontSize: 32, fontWeight: '700' }}
        >
          Study Planner
        </Text>
        <Text style={{ color: colors.muted, fontSize: 16 }}>
          Never miss a revision: spaced-repetition reminders for your exam
          topics.
        </Text>
        {sessionEnded ? <Banner tone="info" text={SESSION_ENDED_TEXT} /> : null}
        <Button
          title="Continue with Google"
          onPress={onPress}
          loading={loading}
        />
        {error ? (
          <Text
            accessibilityRole="alert"
            style={{ color: colors.danger, fontSize: 14 }}
          >
            {error}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
