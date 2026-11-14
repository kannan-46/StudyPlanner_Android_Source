import React from 'react';
import { useWindowDimensions } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthProvider';
import { getReminderStatus } from '../../../native/reminders';
import {
  loadOnboardingStep,
  saveOnboardingStep,
} from '../../../shared/lib/localPrefs';
import { OnboardingFlow } from '../OnboardingNavigator';
import { TopicsStep } from '../TopicsStep';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
  topic,
} from '../../../test/testUtils';

jest.mock('../../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
  notifySessionEnded: jest.fn(),
}));
jest.mock('../../../native/reminders', () => ({
  getReminderStatus: jest.fn(),
  requestNotificationPermission: jest.fn(),
  openReminderSettings: jest.fn(),
  configureReminders: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const refreshUser = jest.fn();

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width: 360,
    height: 800,
    scale: 2,
    fontScale: 1,
  });
  (useAuth as jest.Mock).mockReturnValue({
    refreshUser,
    signOut: jest.fn(),
  });
  (getReminderStatus as jest.Mock).mockResolvedValue({
    notificationsEnabled: true,
    exactAlarmsAllowed: true,
    ignoringBatteryOptimizations: true,
    nextFireAtMillis: null,
  });
});
afterEach(cleanupClients);

const renderFlow = (http = makeHttp()) =>
  renderWithProviders(
    <NavigationContainer>
      <OnboardingFlow userId="u1" />
    </NavigationContainer>,
    http,
  );

it('starts a first-time setup at step 1 and remembers each step reached', async () => {
  const http = makeHttp();
  http.patch.mockResolvedValue({});
  await renderFlow(http);
  expect(await screen.findByText('Step 1 of 4')).toBeOnTheScreen();
  await waitFor(() =>
    expect(
      screen.getByRole('checkbox', { name: 'MS General Surgery' }).props
        .accessibilityState.checked,
    ).toBe(true),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Step 2 of 4')).toBeOnTheScreen();
  await waitFor(async () => expect(await loadOnboardingStep('u1')).toBe(2));
});

it('a relaunch resumes at the saved step, with Back to the earlier steps', async () => {
  await saveOnboardingStep('u1', 3);
  await renderFlow();
  expect(await screen.findByText('Step 3 of 4')).toBeOnTheScreen();
  expect(screen.queryByText('Step 1 of 4')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(await screen.findByText('Step 2 of 4')).toBeOnTheScreen();
  // Going back does not forget how far setup got.
  expect(await loadOnboardingStep('u1')).toBe(3);
});

it('resumes on the last step too', async () => {
  await saveOnboardingStep('u1', 4);
  await renderFlow();
  expect(await screen.findByText('Step 4 of 4')).toBeOnTheScreen();
});

it("ignores another account's saved step", async () => {
  await saveOnboardingStep('someone-else', 3);
  await renderFlow();
  expect(await screen.findByText('Step 1 of 4')).toBeOnTheScreen();
});

it('forgets the saved step once setup is finished', async () => {
  await saveOnboardingStep('u1', 4);
  const http = makeHttp([topic()]);
  http.patch.mockResolvedValue({});
  await renderWithProviders(<TopicsStep />, http);
  await screen.findByText('Added: 1 topic');
  await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
  await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  expect(await AsyncStorage.getItem('prefs.onboardingStep')).toBeNull();
});
