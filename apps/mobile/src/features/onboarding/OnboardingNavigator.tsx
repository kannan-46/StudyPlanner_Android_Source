import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import type { StackNavigationState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  loadOnboardingStep,
  saveOnboardingStep,
} from '../../shared/lib/localPrefs';
import { Screen } from '../../shared/ui/Screen';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { ExamStep } from './ExamStep';
import { IntervalsStep } from './IntervalsStep';
import { RemindersStep } from './RemindersStep';
import { TopicsStep } from './TopicsStep';
import { OnboardingProgressContext } from './progress';

export type OnboardingParamList = {
  Exams: undefined;
  Intervals: undefined;
  Reminders: undefined;
  Topics: undefined;
};

export const STEP_ROUTES = [
  'Exams',
  'Intervals',
  'Reminders',
  'Topics',
] as const satisfies readonly (keyof OnboardingParamList)[];

const Stack = createNativeStackNavigator<OnboardingParamList>();

/**
 * Setup steps. `resumeStep` (1-4) opens on that step with the earlier ones
 * behind it; with a `userId` the furthest step reached is saved on the phone.
 */
export function OnboardingNavigator({
  initialRouteName = 'Exams',
  resumeStep = 1,
  userId,
}: {
  initialRouteName?: keyof OnboardingParamList;
  resumeStep?: number;
  userId?: string;
}) {
  // Read once: the router is created on mount (key the navigator to change).
  const [resumeIndex] = useState(
    () => Math.min(Math.max(Math.trunc(resumeStep), 1), STEP_ROUTES.length) - 1,
  );
  const furthest = useRef(resumeStep);
  const reached = useCallback(
    (step: number) => {
      if (!userId || step <= furthest.current) return;
      furthest.current = step;
      saveOnboardingStep(userId, step);
    },
    [userId],
  );
  return (
    <OnboardingProgressContext.Provider value={reached}>
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{ headerShown: false }}
        // Resuming opens on the saved step with the earlier steps behind
        // it, so Back still walks through them.
        UNSTABLE_router={original => ({
          getInitialState(options) {
            if (resumeIndex <= 0) return original.getInitialState(options);
            return original.getRehydratedState(
              {
                stale: true,
                index: resumeIndex,
                routes: STEP_ROUTES.slice(0, resumeIndex + 1).map(name => ({
                  name,
                })),
              } as unknown as StackNavigationState<OnboardingParamList>,
              options,
            );
          },
        })}
      >
        <Stack.Screen name="Exams" component={ExamStep} />
        <Stack.Screen name="Intervals" component={IntervalsStep} />
        <Stack.Screen name="Reminders" component={RemindersStep} />
        <Stack.Screen name="Topics" component={TopicsStep} />
      </Stack.Navigator>
    </OnboardingProgressContext.Provider>
  );
}

/** Loads the saved step, then shows setup from there (step 1 if none). */
export function OnboardingFlow({ userId }: { userId: string }) {
  const { colors } = useTheme();
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    loadOnboardingStep(userId).then(s => {
      if (live) setStep(s);
    });
    return () => {
      live = false;
    };
  }, [userId]);
  if (step === null) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} accessibilityLabel="Loading" />
      </Screen>
    );
  }
  return <OnboardingNavigator key={userId} userId={userId} resumeStep={step} />;
}
