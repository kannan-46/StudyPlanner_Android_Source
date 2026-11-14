import React, { useContext, useEffect, useState, type ReactNode } from 'react';
import {
  BackHandler,
  Text,
  View,
  type NativeEventSubscription,
} from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { Screen } from '../../shared/ui/Screen';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useAuth } from '../auth/AuthProvider';

export const TOTAL_STEPS = 4;

/**
 * Common frame: scrollable, centred column, "Step N of 4" and a title.
 * Steps 2-4 get a Back button. Step 1 offers Sign out (wrong Google account),
 * and the Android back button there asks before leaving setup.
 */
export function StepShell({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  // Optional, so a step can also be shown on its own.
  const navigation = useContext(NavigationContext);
  const { signOut } = useAuth();
  const [askLeave, setAskLeave] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const first = step === 1;

  // Step 1 is the bottom of the stack: Android back would close the app.
  useEffect(() => {
    if (!first) return;
    let sub: NativeEventSubscription | null = null;
    const listen = () => {
      sub?.remove();
      sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setAskLeave(true);
        return true;
      });
    };
    const stop = () => {
      sub?.remove();
      sub = null;
    };
    if (!navigation || navigation.isFocused()) listen();
    const offFocus = navigation?.addListener('focus', listen);
    const offBlur = navigation?.addListener('blur', stop);
    return () => {
      stop();
      offFocus?.();
      offBlur?.();
    };
  }, [first, navigation]);

  const doSignOut = async () => {
    setAskLeave(false);
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Screen scroll>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          marginBottom: spacing.xs,
        }}
      >
        {!first && navigation?.canGoBack() ? (
          <Button
            title="Back"
            variant="text"
            onPress={() => navigation?.goBack()}
          />
        ) : null}
        <Text style={{ color: colors.muted, flexShrink: 1 }}>
          {`Step ${step} of ${TOTAL_STEPS}`}
        </Text>
        {first ? (
          <Button
            title="Sign out"
            variant="text"
            onPress={doSignOut}
            loading={signingOut}
          />
        ) : null}
      </View>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: 24,
          fontWeight: '700',
          marginBottom: spacing.lg,
        }}
      >
        {title}
      </Text>
      <View>{children}</View>
      <Dialog
        visible={askLeave}
        title="Leave setup?"
        onRequestClose={() => setAskLeave(false)}
        actions={
          <>
            <Button
              title="Keep setting up"
              onPress={() => setAskLeave(false)}
            />
            <Button
              title="Close the app"
              variant="secondary"
              onPress={() => {
                setAskLeave(false);
                BackHandler.exitApp();
              }}
            />
            <Button title="Sign out" variant="text" onPress={doSignOut} />
          </>
        }
      >
        <Text style={{ color: colors.text }}>
          You can finish setting up the next time you open the app. To use a
          different Google account, sign out.
        </Text>
      </Dialog>
    </Screen>
  );
}
