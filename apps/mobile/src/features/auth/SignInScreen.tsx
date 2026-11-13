import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../shared/ui/Button';
import { Screen } from '../../shared/ui/Screen';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useResponsive } from '../../shared/ui/responsive';
import { userMessage } from '../../shared/api/errors';
import { ApiError } from '../../shared/api/errors';
import { GoogleAuthError } from '../../native/googleAuth';
import { useAuth } from './AuthProvider';

function errorText(e: unknown): string | null {
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
  const { signIn } = useAuth();
  const { colors, spacing } = useTheme();
  const { isLandscape, height } = useResponsive();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
