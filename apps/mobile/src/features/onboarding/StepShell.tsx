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
import { OnboardingProgressContext } from './progress';

export const TOTAL_STEPS = 4;
export const SWITCH_ACCOUNT_LABEL = 'Use another account';

/**
 * Common frame: scrollable, centred column, "Step N of 4" and a title.
 * Steps 2-4 get a Back button. Step 1 says which Google account is signed in
 * and offers "Use another account" (signs out, for a wrong account pick), and
 * the Android back button there asks before leaving setup.
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
  // `state` may be missing where a test mocks only part of useAuth.
  const { signOut, state } = useAuth();
  const email = state?.status === 'signedIn' ? state.user.email : undefined;
  const [askLeave, setAskLeave] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const first = step === 1;
  const reached = useContext(OnboardingProgressContext);

  // Remember how far setup got, so a relaunch resumes here.
  useEffect(() => {
    if (!navigation || navigation.isFocused()) reached(step);
    return navigation?.addListener('focus', () => reached(step));
  }, [navigation, reached, step]);

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
            title={SWITCH_ACCOUNT_LABEL}
            variant="text"
            onPress={doSignOut}
            loading={signingOut}
            accessibilityHint="Signs you out so you can pick a different Google account"
          />
        ) : null}
      </View>
      {first && email ? (
        <Text
          testID="signed-in-as"
          style={{
            color: colors.muted,
            flexShrink: 1,
            marginBottom: spacing.sm,
          }}
        >
          {`Signed in as ${email}`}
        </Text>
      ) : null}
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
          {`You can finish setting up the next time you open the app.${
            email ? ` You're signed in as ${email}.` : ''
          } To use a different Google account, sign out.`}
        </Text>
      </Dialog>
    </Screen>
  );
}
