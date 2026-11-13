import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
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

export function RootNavigator() {
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
