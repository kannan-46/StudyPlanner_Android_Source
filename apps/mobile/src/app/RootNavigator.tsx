import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from '../shared/ui/Banner';
import { useOnline } from '../shared/lib/useOnline';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { useAuth, type AuthState } from '../features/auth/AuthProvider';
import { SignInScreen } from '../features/auth/SignInScreen';
import { OnboardingFlow } from '../features/onboarding/OnboardingNavigator';
import { TopicFormScreen } from '../features/topics/TopicFormScreen';
import { TopicDetailScreen } from '../features/topics/TopicDetailScreen';
import { ReminderHealthScreen } from '../features/settings/ReminderHealthScreen';
import { ManageExamsSubjectsScreen } from '../features/settings/ManageExamsSubjectsScreen';
import { MockTestFormScreen } from '../features/mocktests/MockTestFormScreen';
import { UpdateDialog } from '../features/appUpdate/UpdateDialog';
import { useUpdateCheck } from '../features/appUpdate/useUpdateCheck';
import { Screen } from '../shared/ui/Screen';
import { StackHeader, UnderHeaderContext } from '../shared/ui/StackHeader';
import { useTheme } from '../shared/ui/ThemeProvider';
import { MainTabs, type MainTabParamList } from './MainTabs';

export const OFFLINE_TEXT = "No connection — changes can't be saved right now";
/** Offline banner on the sign-in screen: there is nothing to save there. */
export const OFFLINE_SIGN_IN_TEXT =
  'No connection — connect to the internet to sign in';
/** Offline banner while the app is starting. */
export const OFFLINE_LOADING_TEXT =
  'No connection — connect to the internet to continue';

export function offlineText(status: AuthState['status']): string {
  if (status === 'signedOut') return OFFLINE_SIGN_IN_TEXT;
  if (status === 'loading') return OFFLINE_LOADING_TEXT;
  return OFFLINE_TEXT;
}

/** How long the splash waits before saying that loading can take a while. */
export const SPLASH_HINT_DELAY_MS = 3000;
export const SPLASH_HINT_TEXT = 'Still loading — this can take a few seconds';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  TopicForm: { topicId?: string; examId?: string } | undefined;
  TopicDetail: { topicId: string };
  ReminderHealth: undefined;
  ManageExamsSubjects: undefined;
  MockTestForm: { id?: string } | undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>();

function Splash() {
  const { colors, spacing } = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SPLASH_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Screen>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: 28,
          fontWeight: '700',
          textAlign: 'center',
          marginTop: spacing.xxl,
          marginBottom: spacing.lg,
        }}
      >
        Study Planner
      </Text>
      <ActivityIndicator color={colors.accent} accessibilityLabel="Loading" />
      {slow ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color: colors.muted,
            fontSize: 14,
            textAlign: 'center',
            marginTop: spacing.lg,
          }}
        >
          {SPLASH_HINT_TEXT}
        </Text>
      ) : null}
    </Screen>
  );
}

/** Tells Screen when a stack header is drawn above it. */
function underHeaderLayout({
  children,
  options,
}: {
  children: React.ReactElement;
  options: NativeStackNavigationOptions;
}) {
  return (
    <UnderHeaderContext.Provider value={options.headerShown !== false}>
      {children}
    </UnderHeaderContext.Provider>
  );
}

function RootScreens() {
  const { state } = useAuth();
  const { colors } = useTheme();
  if (state.status === 'loading') return <Splash />;
  if (state.status === 'signedOut') return <SignInScreen />;
  if (state.user.onboardingCompletedAt === null) {
    return <OnboardingFlow userId={state.user.id} />;
  }
  return (
    <Stack.Navigator
      screenOptions={{
        header: StackHeader,
        contentStyle: { backgroundColor: colors.background },
      }}
      screenLayout={underHeaderLayout}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TopicForm"
        component={TopicFormScreen}
        options={({ route }) => ({
          title: route.params?.topicId ? 'Edit topic' : 'Add topic',
        })}
      />
      <Stack.Screen
        name="TopicDetail"
        component={TopicDetailScreen}
        options={{ title: 'Topic' }}
      />
      <Stack.Screen
        name="ReminderHealth"
        component={ReminderHealthScreen}
        options={{ title: 'Reminder health' }}
      />
      <Stack.Screen
        name="ManageExamsSubjects"
        component={ManageExamsSubjectsScreen}
        options={{ title: 'Exams & subjects' }}
      />
      <Stack.Screen
        name="MockTestForm"
        component={MockTestFormScreen}
        options={({ route }) => ({
          title: route.params?.id ? 'Edit mock test' : 'Add mock test',
        })}
      />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const online = useOnline();
  const { state } = useAuth();
  const update = useUpdateCheck();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  // The update prompt belongs to the main app, not sign-in or setup.
  const inMainApp =
    state.status === 'signedIn' && state.user.onboardingCompletedAt !== null;
  return (
    <View style={styles.flex}>
      {online ? null : (
        <View
          testID="offline-banner"
          style={{
            backgroundColor: colors.background,
            // Lines up with the 16 dp page gutter used by every screen.
            paddingTop: insets.top,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xs,
          }}
        >
          <Banner tone="warning" text={offlineText(state.status)} announce />
        </View>
      )}
      <View style={styles.flex}>
        <RootScreens />
      </View>
      {inMainApp ? <UpdateDialog check={update} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
