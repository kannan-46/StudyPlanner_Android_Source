import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from '../shared/ui/Banner';
import { useOnline } from '../shared/lib/useOnline';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { useAuth } from '../features/auth/AuthProvider';
import { SignInScreen } from '../features/auth/SignInScreen';
import { OnboardingPlaceholder } from '../features/onboarding/OnboardingPlaceholder';
import { TopicFormScreen } from '../features/topics/TopicFormScreen';
import { TopicDetailScreen } from '../features/topics/TopicDetailScreen';
import { ReminderHealthScreen } from '../features/reminders/ReminderHealthScreen';
import { ManageExamsSubjectsScreen } from '../features/exams/ManageExamsSubjectsScreen';
import { MockTestFormScreen } from '../features/mocktests/MockTestFormScreen';
import { Screen } from '../shared/ui/Screen';
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

function RootScreens() {
  const { state } = useAuth();
  if (state.status === 'loading') return <Splash />;
  if (state.status === 'signedOut') return <SignInScreen />;
  if (state.user.onboardingCompletedAt === null) {
    return <OnboardingPlaceholder />;
  }
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="TopicForm" component={TopicFormScreen} />
      <Stack.Screen name="TopicDetail" component={TopicDetailScreen} />
      <Stack.Screen name="ReminderHealth" component={ReminderHealthScreen} />
      <Stack.Screen
        name="ManageExamsSubjects"
        component={ManageExamsSubjectsScreen}
      />
      <Stack.Screen name="MockTestForm" component={MockTestFormScreen} />
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
