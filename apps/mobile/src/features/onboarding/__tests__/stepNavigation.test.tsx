import React from 'react';
import { useWindowDimensions } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthProvider';
import { getReminderStatus } from '../../../native/reminders';
import { STILL_SAVING_MESSAGE } from '../../../shared/ui/useLeaveGuard';
import { OnboardingNavigator } from '../OnboardingNavigator';
import {
  cleanupClients,
  makeHttp,
  mockHardwareBack,
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

const STEPS = ['Exams', 'Intervals', 'Reminders', 'Topics'] as const;

/** Opens setup on `step` (1-4) with the earlier steps behind it. */
const renderFlow = (step = 1, http = makeHttp()) => {
  http.patch.mockResolvedValue({});
  const initialState =
    step > 1
      ? {
          index: step - 1,
          routes: STEPS.slice(0, step).map(name => ({ name })),
        }
      : undefined;
  return renderWithProviders(
    <NavigationContainer initialState={initialState}>
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

it('step 1 offers "Use another account", which signs out', async () => {
  await renderFlow();
  await screen.findByText('Step 1 of 4');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Use another account' }),
  );
  expect(signOut).toHaveBeenCalledTimes(1);
});

describe('signed-in account', () => {
  const EMAIL = 'student.long.name@college.example.edu';
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({
      refreshUser: jest.fn(),
      signOut,
      state: {
        status: 'signedIn',
        user: { id: 'u1', email: EMAIL, name: 'Student' },
      },
    });
  });

  it('step 1 says which Google account is signed in', async () => {
    await renderFlow();
    await screen.findByText('Step 1 of 4');
    expect(screen.getByText(`Signed in as ${EMAIL}`)).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Use another account' }),
    ).toBeOnTheScreen();
  });

  it('the leave dialog names the account too', async () => {
    await renderFlow();
    await screen.findByText('Step 1 of 4');
    await pressBack();
    expect(
      await screen.findByText(new RegExp(`You're signed in as ${EMAIL}\\.`)),
    ).toBeOnTheScreen();
  });

  it('later steps do not repeat the account', async () => {
    await renderFlow(2);
    await screen.findByText('Step 2 of 4');
    expect(screen.queryByText(/Signed in as/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Use another account' }),
    ).toBeNull();
  });
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

it.each([3, 4])(
  'step %i has a Back button that returns to the step before',
  async step => {
    await renderFlow(step);
    expect(await screen.findByText(`Step ${step} of 4`)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText(`Step ${step - 1} of 4`)).toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.queryByText(`Step ${step} of 4`)).toBeNull(),
    );
  },
);

describe('step 4 with a topic half typed', () => {
  const typeName = async () => {
    await screen.findByText('Step 4 of 4');
    await fireEvent.changeText(screen.getByLabelText('Topic name'), 'Hernia');
  };

  it('Back asks before throwing the topic away', async () => {
    await renderFlow(4);
    await typeName();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Discard changes?')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() =>
      expect(screen.queryByText('Discard changes?')).toBeNull(),
    );
    expect(screen.getByText('Step 4 of 4')).toBeOnTheScreen();
    expect(screen.getByLabelText('Topic name').props.value).toBe('Hernia');

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Discard' }),
    );
    expect(await screen.findByText('Step 3 of 4')).toBeOnTheScreen();
  });

  it('Android back asks too', async () => {
    await renderFlow(4);
    await typeName();
    await pressBack();
    expect(await screen.findByText('Discard changes?')).toBeOnTheScreen();
    expect(screen.getByText('Step 4 of 4')).toBeOnTheScreen();
  });

  it('goes back without asking once the topic has been added', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue(topic());
    await renderFlow(4, http);
    await typeName();
    await fireEvent.press(await screen.findByText('Anatomy'));
    await fireEvent.press(screen.getByText('Save & add another'));
    expect(await screen.findByText('Added: 1 topic')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Step 3 of 4')).toBeOnTheScreen();
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });

  it('Back waits (no "Discard changes?") while the topic is still saving', async () => {
    const http = makeHttp();
    let release!: () => void;
    http.post.mockImplementation(
      () =>
        new Promise(resolve => {
          release = () => resolve(topic());
        }),
    );
    await renderFlow(4, http);
    await typeName();
    await fireEvent.press(await screen.findByText('Anatomy'));
    // Keep the save open: fireEvent would wait for the pending handler.
    const saving = fireEvent.press(screen.getByText('Save & add another'));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    await pressBack();
    expect(await screen.findByText(STILL_SAVING_MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByText('Discard changes?')).toBeNull();
    expect(screen.getByText('Step 4 of 4')).toBeOnTheScreen();
    await waitFor(() => {
      release();
      expect(screen.getByText('Added: 1 topic')).toBeOnTheScreen();
    });
    await saving;
  });
});
