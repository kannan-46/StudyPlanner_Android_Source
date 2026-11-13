import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ExamStep } from './ExamStep';
import { IntervalsStep } from './IntervalsStep';
import { RemindersStep } from './RemindersStep';
import { TopicsStep } from './TopicsStep';

export type OnboardingParamList = {
  Exams: undefined;
  Intervals: undefined;
  Reminders: undefined;
  Topics: undefined;
};

const Stack = createNativeStackNavigator<OnboardingParamList>();

/** Relaunching mid-setup restarts at Exams; earlier steps are idempotent. */
export function OnboardingNavigator({
  initialRouteName = 'Exams',
}: {
  initialRouteName?: keyof OnboardingParamList;
}) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Exams" component={ExamStep} />
      <Stack.Screen name="Intervals" component={IntervalsStep} />
      <Stack.Screen name="Reminders" component={RemindersStep} />
      <Stack.Screen name="Topics" component={TopicsStep} />
    </Stack.Navigator>
  );
}
