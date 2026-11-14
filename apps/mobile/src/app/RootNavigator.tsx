import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from '../shared/ui/Banner';
import { useOnline } from '../shared/lib/useOnline';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { useAuth } from '../features/auth/AuthProvider';
import { SignInScreen } from '../features/auth/SignInScreen';
import { OnboardingFlow } from '../features/onboarding/OnboardingNavigator';
import { TopicFormScreen } from '../features/topics/TopicFormScreen';
import { TopicDetailScreen } from '../features/topics/TopicDetailScreen';
import { ReminderHealthScreen } from '../features/settings/ReminderHealthScreen';
import { ManageExamsSubjectsScreen } from '../features/settings/ManageExamsSubjectsScreen';
import { MockTestFormScreen } from '../features/mocktests/MockTestFormScreen';
import { Screen } from '../shared/ui/Screen';
import { StackHeader, UnderHeaderContext } from '../shared/ui/StackHeader';
import { useTheme } from '../shared/ui/ThemeProvider';
import { MainTabs, type MainTabParamList } from './MainTabs';

export const OFFLINE_TEXT = "No connection — changes can't be saved right now";

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  TopicForm: { topicId?: string } | undefined;
  TopicDetail: { topicId: string };
  ReminderHealth: undefined;
  ManageExamsSubjects: undefined;
  MockTestForm: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>();

function Splash() {
  const { colors, spacing } = useTheme();
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
        options={{ title: 'Add mock test' }}
      />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const online = useOnline();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      {online ? null : (
        <View
          style={{
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingHorizontal: spacing.sm,
          }}
        >
          <Banner tone="warning" text={OFFLINE_TEXT} />
        </View>
      )}
      <View style={styles.flex}>
        <RootScreens />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
