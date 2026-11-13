import React, { useState } from 'react';
import { Text } from 'react-native';
import { Button } from '../../shared/ui/Button';
import { Screen } from '../../shared/ui/Screen';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useApi } from '../../shared/api/ApiProvider';
import { useAuth } from '../auth/AuthProvider';

// Placeholder until Task 8 replaces it with OnboardingNavigator.
export function OnboardingPlaceholder() {
  const { me } = useApi();
  const { refreshUser } = useAuth();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const finish = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await me.update({ onboardingCompleted: true });
      await refreshUser();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>
        Welcome
      </Text>
      <Button title="Finish setup" onPress={finish} loading={busy} />
      {failed ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          Couldn't finish setup, try again
        </Text>
      ) : null}
    </Screen>
  );
}
