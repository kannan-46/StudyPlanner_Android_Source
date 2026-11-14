import React from 'react';
import { AppState, useWindowDimensions } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { addDays, localToday } from '@planner/shared';
import { formatDate } from '../../../shared/lib/format';
import { ApiError } from '../../../shared/api/errors';
import { useAuth } from '../../auth/AuthProvider';
import {
  getReminderStatus,
  openReminderSettings,
  requestNotificationPermission,
} from '../../../native/reminders';
import { OnboardingNavigator } from '../OnboardingNavigator';
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
let mockPickDate = new Date(2027, 0, 15);
jest.mock('@react-native-community/datetimepicker', () => {
  const { Pressable } = require('react-native');
  const R = require('react');
  return {
    __esModule: true,
    default: ({ onChange }: { onChange: (e: unknown, d: Date) => void }) =>
      R.createElement(Pressable, {
        testID: 'date-picker',
        onPress: () => onChange({ type: 'set' }, mockPickDate),
      }),
  };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const refreshUser = jest.fn();
const mockDims = (width: number, fontScale = 1) =>
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width,
    height: 800,
    scale: 2,
    fontScale,
  });
const status = (over = {}) => ({
  notificationsEnabled: false,
  exactAlarmsAllowed: true,
  ignoringBatteryOptimizations: true,
  nextFireAtMillis: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDims(360);
  (useAuth as jest.Mock).mockReturnValue({ refreshUser });
  (getReminderStatus as jest.Mock).mockResolvedValue(status());
});
afterEach(cleanupClients);

const renderStep = (
  initialRouteName: 'Exams' | 'Intervals' | 'Reminders' | 'Topics',
  http = makeHttp(),
) =>
  renderWithProviders(
    <NavigationContainer>
      <OnboardingNavigator initialRouteName={initialRouteName} />
    </NavigationContainer>,
    http,
  );

describe('ExamStep', () => {
  it('disables Next with nothing selected, then creates the picked exam', async () => {
    const http = makeHttp();
    http.get.mockImplementation(async () => []);
    http.post.mockResolvedValue({ id: 'e1', name: 'NEET SS', examDate: null });
    await renderStep('Exams', http);
    expect(await screen.findByText('Step 1 of 4')).toBeOnTheScreen();
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByText('NEET SS'));
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/v1/exams', { name: 'NEET SS' }),
    );
    expect(await screen.findByText('Step 2 of 4')).toBeOnTheScreen();
  });

  it('keeps the selection on errors and ignores DUPLICATE_NAME', async () => {
    const http = makeHttp();
    http.get.mockImplementation(async () => []);
    http.post
      .mockRejectedValueOnce(new ApiError('NETWORK', 0))
      .mockRejectedValueOnce(new ApiError('DUPLICATE_NAME', 409));
    await renderStep('Exams', http);
    await fireEvent.press(await screen.findByText('NEET SS'));
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('checkbox', { name: 'NEET SS' }).props.accessibilityState
        .checked,
    ).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 2 of 4')).toBeOnTheScreen();
  });

  it('pre-selects existing exams and keeps Next reachable at 320 dp', async () => {
    mockDims(320, 1.3);
    await renderStep('Exams');
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'MS General Surgery' }).props
          .accessibilityState.checked,
      ).toBe(true),
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeOnTheScreen();
  });
});

describe('IntervalsStep', () => {
  it('rejects [4,4] and previews [4,7,15] from today + 4', async () => {
    await renderStep('Intervals');
    const field = await screen.findByLabelText('Intervals (days)');
    await waitFor(() => expect(field.props.value).toBe('4, 7, 15'));
    await fireEvent.changeText(field, '4, 4');
    expect(
      await screen.findByText('Intervals must increase, e.g. 4, 7, 15'),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Next' }).props.accessibilityState
        .disabled,
    ).toBe(true);
    await fireEvent.changeText(field, '4, 7, 15');
    expect(screen.queryByText(/must increase/)).toBeNull();
    expect(screen.getByTestId('interval-preview')).toBeOnTheScreen();
    expect(screen.getByTestId('preview-1')).toHaveTextContent(
      `Revision 1: ${formatDate(addDays(localToday(), 4))}`,
    );
  });

  it('saves intervals and moves on', async () => {
    const http = makeHttp();
    http.patch.mockResolvedValue({ settings: { intervals: [4, 7, 15] } });
    await renderStep('Intervals', http);
    const field = await screen.findByLabelText('Intervals (days)');
    await waitFor(() => expect(field.props.value).toBe('4, 7, 15'));
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith('/v1/me', {
        settings: { intervals: [4, 7, 15] },
      }),
    );
    expect(await screen.findByText('Step 3 of 4')).toBeOnTheScreen();
  });
});

describe('RemindersStep', () => {
  it('shows Not allowed and requests notification permission', async () => {
    (requestNotificationPermission as jest.Mock).mockResolvedValue(true);
    await renderStep('Reminders');
    expect(await screen.findByText('Not allowed')).toBeOnTheScreen();
    expect(screen.getByText(/reminders may not appear/)).toBeOnTheScreen();
    (getReminderStatus as jest.Mock).mockResolvedValue(
      status({ notificationsEnabled: true }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Allow' }));
    expect(requestNotificationPermission).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Not allowed')).toBeNull());
  });

  it('shows only Notifications and Exact alarms, never a Battery row', async () => {
    (getReminderStatus as jest.Mock).mockResolvedValue(
      status({
        notificationsEnabled: true,
        ignoringBatteryOptimizations: false,
      }),
    );
    await renderStep('Reminders');
    expect(await screen.findByText('Notifications')).toBeOnTheScreen();
    expect(screen.getByText('Exact alarms')).toBeOnTheScreen();
    expect(screen.queryByText('Battery')).toBeNull();
    expect(screen.queryByText('Not allowed')).toBeNull();
    expect(screen.queryByText(/reminders may not appear/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unrestrict' })).toBeNull();
  });

  it('re-checks exact alarms on foreground', async () => {
    (getReminderStatus as jest.Mock).mockResolvedValue(
      status({ notificationsEnabled: true, exactAlarmsAllowed: false }),
    );
    await renderStep('Reminders');
    await fireEvent.press(await screen.findByRole('button', { name: 'Allow' }));
    expect(openReminderSettings).toHaveBeenCalledWith('exactAlarm');
    (getReminderStatus as jest.Mock).mockResolvedValue(
      status({ notificationsEnabled: true }),
    );
    const listeners = (AppState.addEventListener as jest.Mock).mock.calls
      .filter(c => c[0] === 'change')
      .map(c => c[1] as (s: string) => void);
    listeners.forEach(l => l('background'));
    listeners.forEach(l => l('active'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull(),
    );
  });

  it('saves reminder settings even with missing permissions', async () => {
    const http = makeHttp();
    http.patch.mockResolvedValue({});
    await renderStep('Reminders', http);
    await screen.findByText('Not allowed');
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith('/v1/me', {
        settings: {
          reminderTime: '08:00',
          dailyReminder: true,
          timezone: expect.any(String),
        },
      }),
    );
    expect(await screen.findByText('Step 4 of 4')).toBeOnTheScreen();
  });
});

describe('TopicsStep', () => {
  it('disables Finish until a topic is added, then completes onboarding', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue(topic());
    http.patch.mockResolvedValue({});
    await renderWithProviders(<TopicsStep />, http);
    expect(await screen.findByText('Added: 0 topics')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Finish' }).props.accessibilityState
        .disabled,
    ).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Topic name'), 'Hernia');
    await fireEvent.press(await screen.findByText('Anatomy'));
    await fireEvent.press(screen.getByText('Add another'));
    expect(await screen.findByText('Added: 1 topic')).toBeOnTheScreen();
    expect(screen.getByLabelText('Topic name').props.value).toBe('');
    expect(
      screen.getByRole('radio', { name: 'Anatomy' }).props.accessibilityState
        .selected,
    ).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith('/v1/me', {
        onboardingCompleted: true,
      }),
    );
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it('Skip for now completes onboarding without topics', async () => {
    const http = makeHttp();
    http.patch.mockResolvedValue({});
    await renderWithProviders(<TopicsStep />, http);
    await fireEvent.press(await screen.findByText('Skip for now'));
    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith('/v1/me', {
        onboardingCompleted: true,
      }),
    );
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it('centres the step in a 720 dp column on large screens', async () => {
    mockDims(1000);
    await renderWithProviders(<TopicsStep />, makeHttp());
    await screen.findByText('Added: 0 topics');
    expect(screen.getByTestId('responsive-container').props.style).toEqual(
      expect.objectContaining({ maxWidth: 720 }),
    );
  });
});

describe('relaunch-safe setup', () => {
  it('sends each exam its own date and none when untouched', async () => {
    const http = makeHttp();
    http.get.mockImplementation(async () => []);
    http.post.mockResolvedValue({ id: 'e', name: 'x', examDate: null });
    await renderStep('Exams', http);
    await fireEvent.press(await screen.findByText('NEET SS'));
    await fireEvent.press(screen.getByText('MS General Surgery'));
    mockPickDate = new Date(2027, 0, 15);
    await fireEvent.press(screen.getByText('Set date for NEET SS'));
    await fireEvent.press(screen.getByTestId('date-picker'));
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(2));
    expect(http.post).toHaveBeenCalledWith('/v1/exams', {
      name: 'NEET SS',
      examDate: '2027-01-15',
    });
    expect(http.post).toHaveBeenCalledWith('/v1/exams', {
      name: 'MS General Surgery',
    });
  });

  it('gives two exams different dates and PATCHes an existing one', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({ id: 'e', name: 'x', examDate: null });
    http.patch.mockResolvedValue({});
    await renderStep('Exams', http);
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'MS General Surgery' }).props
          .accessibilityState.checked,
      ).toBe(true),
    );
    await fireEvent.press(screen.getByText('NEET SS'));
    mockPickDate = new Date(2027, 0, 15);
    await fireEvent.press(screen.getByText('Set date for NEET SS'));
    await fireEvent.press(screen.getByTestId('date-picker'));
    mockPickDate = new Date(2027, 5, 2);
    await fireEvent.press(screen.getByText('Set date for MS General Surgery'));
    await fireEvent.press(screen.getAllByTestId('date-picker')[0]);
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith(
        '/v1/exams/000000000000000000000011',
        {
          examDate: '2027-06-02',
        },
      ),
    );
    expect(http.post).toHaveBeenCalledWith('/v1/exams', {
      name: 'NEET SS',
      examDate: '2027-01-15',
    });
  });

  it('counts existing topics so Finish works after a relaunch', async () => {
    await renderWithProviders(<TopicsStep />, makeHttp([topic()]));
    expect(await screen.findByText('Added: 1 topic')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Finish' }).props.accessibilityState
        .disabled,
    ).toBe(false);
  });

  it('ignores a second Finish press while pending', async () => {
    const http = makeHttp([topic()]);
    let release!: () => void;
    http.patch.mockImplementation(
      () =>
        new Promise(resolve => {
          release = () => resolve({});
        }),
    );
    await renderWithProviders(<TopicsStep />, http);
    await screen.findByText('Added: 1 topic');
    // fireEvent awaits the pending async handler, so keep the first press
    // un-awaited while the request is held open by the deferred promise.
    const firstPress = fireEvent.press(
      screen.getByRole('button', { name: 'Finish' }),
    );
    await waitFor(() => expect(http.patch).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole('button', { name: 'Skip for now' }).props
        .accessibilityState.disabled,
    ).toBe(true);
    await waitFor(() => {
      release(); // idempotent: lets the held request resolve inside waitFor
      expect(refreshUser).toHaveBeenCalledTimes(1);
    });
    expect(http.patch).toHaveBeenCalledTimes(1);
    await firstPress;
  });

  it('defaults reminder settings from the user', async () => {
    const http = makeHttp();
    http.get.mockImplementation(async (p: string) =>
      p === '/v1/me'
        ? { settings: { reminderTime: '06:30', dailyReminder: false } }
        : [],
    );
    http.patch.mockResolvedValue({});
    await renderStep('Reminders', http);
    await waitFor(() => expect(screen.getByText('06:30')).toBeOnTheScreen());
    expect(screen.getByLabelText('Daily reminder').props.value).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith('/v1/me', {
        settings: expect.objectContaining({
          reminderTime: '06:30',
          dailyReminder: false,
        }),
      }),
    );
  });
});
