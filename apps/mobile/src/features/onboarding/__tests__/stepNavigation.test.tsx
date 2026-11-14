import React from 'react';
import { useWindowDimensions } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthProvider';
import { getReminderStatus } from '../../../native/reminders';
import { OnboardingNavigator } from '../OnboardingNavigator';
import {
  cleanupClients,
  makeHttp,
  mockHardwareBack,
  renderWithProviders,
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

const signOut = jest.fn();
let back: ReturnType<typeof mockHardwareBack>;

beforeEach(() => {
  jest.clearAllMocks();
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width: 320,
    height: 640,
    scale: 2,
    fontScale: 1.3,
  });
  signOut.mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({ refreshUser: jest.fn(), signOut });
  (getReminderStatus as jest.Mock).mockResolvedValue({
    notificationsEnabled: true,
    exactAlarmsAllowed: true,
    ignoringBatteryOptimizations: true,
    nextFireAtMillis: null,
  });
  back = mockHardwareBack();
});
afterEach(async () => {
  back.restore();
  await cleanupClients();
});

const renderFlow = () => {
  const http = makeHttp();
  http.patch.mockResolvedValue({});
  return renderWithProviders(
    <NavigationContainer>
      <OnboardingNavigator />
    </NavigationContainer>,
    http,
  );
};

const pressBack = () =>
  act(async () => {
    back.press();
  });

it('steps 2-4 have a Back button that returns to the step before', async () => {
  await renderFlow();
  expect(await screen.findByText('Step 1 of 4')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Next' }).props.accessibilityState
        .disabled,
    ).toBe(false),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Step 2 of 4')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(await screen.findByText('Step 1 of 4')).toBeOnTheScreen();
  await waitFor(() => expect(screen.queryByText('Step 2 of 4')).toBeNull());
});

it('step 1 offers Sign out', async () => {
  await renderFlow();
  await screen.findByText('Step 1 of 4');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(signOut).toHaveBeenCalledTimes(1);
});

it('Android back on step 1 asks instead of closing the app', async () => {
  await renderFlow();
  await screen.findByText('Step 1 of 4');
  await pressBack();
  expect(await screen.findByText('Leave setup?')).toBeOnTheScreen();
  expect(back.exitApp).not.toHaveBeenCalled();

  await fireEvent.press(
    screen.getByRole('button', { name: 'Keep setting up' }),
  );
  await waitFor(() => expect(screen.queryByText('Leave setup?')).toBeNull());
  expect(screen.getByText('Step 1 of 4')).toBeOnTheScreen();

  await pressBack();
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Close the app' }),
  );
  expect(back.exitApp).toHaveBeenCalledTimes(1);
});

it('the leave dialog can sign out to switch account', async () => {
  await renderFlow();
  await screen.findByText('Step 1 of 4');
  await pressBack();
  await screen.findByText('Leave setup?');
  const buttons = screen.getAllByRole('button', { name: 'Sign out' });
  await fireEvent.press(buttons[buttons.length - 1]);
  expect(signOut).toHaveBeenCalledTimes(1);
});

it('Android back on step 2 goes to step 1 without asking', async () => {
  await renderFlow();
  await screen.findByText('Step 1 of 4');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Next' }).props.accessibilityState
        .disabled,
    ).toBe(false),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Step 2 of 4');
  await pressBack();
  await waitFor(() => expect(screen.queryByText('Step 2 of 4')).toBeNull());
  expect(screen.getByText('Step 1 of 4')).toBeOnTheScreen();
  expect(screen.queryByText('Leave setup?')).toBeNull();
});
