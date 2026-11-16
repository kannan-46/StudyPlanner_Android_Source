import React from 'react';
import { AppState, NativeModules, useWindowDimensions } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { addDays, localToday } from '@planner/shared';
import { formatDate } from '../../../shared/lib/format';
import { fromLocalDate, toLocalDate } from '../../../shared/ui/DateField';
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
  ID,
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
let mockPickerProps: Record<string, unknown> = {};
jest.mock('@react-native-community/datetimepicker', () => {
  const { Pressable } = require('react-native');
  const R = require('react');
  return {
    __esModule: true,
    default: (props: {
      onChange: (e: unknown, d: Date) => void;
      [k: string]: unknown;
    }) => {
      mockPickerProps = props;
      return R.createElement(Pressable, {
        testID: 'date-picker',
        onPress: () => props.onChange({ type: 'set' }, mockPickDate),
      });
    },
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
  NativeModules.AppConfig.IS_24_HOUR_CLOCK = false;
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
    expect(
      screen.getByText('Pick or add at least one exam to continue'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('NEET SS'));
    expect(
      screen.queryByText('Pick or add at least one exam to continue'),
    ).toBeNull();
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
  it('rejects [4,4] only after leaving the field and previews [4,7,15] from today + 4', async () => {
    const http = makeHttp();
    await renderStep('Intervals', http);
    const field = await screen.findByLabelText('Intervals (days)');
    await waitFor(() => expect(field.props.value).toBe('4, 7, 15'));
    await fireEvent.changeText(field, '4, 4');
    // Still typing: no error yet, and the last good preview stays.
    expect(screen.queryByText(/must increase/)).toBeNull();
    expect(screen.getByTestId('interval-preview')).toBeOnTheScreen();
    await fireEvent(field, 'blur');
    expect(
      await screen.findByText('Intervals must increase, e.g. 4, 7, 15'),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('interval-preview')).toBeNull();
    // Typing again hides the error until the user is done.
    await fireEvent.changeText(field, '4, 7, 1');
    expect(screen.queryByText(/must increase/)).toBeNull();
    await fireEvent.changeText(field, '4, 7, 15');
    expect(screen.getByTestId('preview-1')).toHaveTextContent(
      `Revision 1: ${formatDate(addDays(localToday(), 4))}`,
    );
    expect(http.patch).not.toHaveBeenCalled();
  });

  it('shows friendly errors when Next is tapped with bad gaps', async () => {
    const http = makeHttp();
    await renderStep('Intervals', http);
    const field = await screen.findByLabelText('Intervals (days)');
    await waitFor(() => expect(field.props.value).toBe('4, 7, 15'));
    await fireEvent.changeText(field, '4, 7, 1000');
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByText('Each interval must be between 1 and 999 days'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/expected/)).toBeNull();
    await fireEvent.changeText(field, '0');
    await fireEvent(field, 'blur');
    expect(
      await screen.findByText('Each interval must be between 1 and 999 days'),
    ).toBeOnTheScreen();
    expect(http.patch).not.toHaveBeenCalled();
    expect(screen.getByText('Step 2 of 4')).toBeOnTheScreen();
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

  it('shows only Notifications and Alarms & reminders, never a Battery row', async () => {
    (getReminderStatus as jest.Mock).mockResolvedValue(
      status({
        notificationsEnabled: true,
        ignoringBatteryOptimizations: false,
      }),
    );
    await renderStep('Reminders');
    expect(await screen.findByText('Notifications')).toBeOnTheScreen();
    expect(screen.getByText('Alarms & reminders')).toBeOnTheScreen();
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
  const finishDisabled = () =>
    screen.getByRole('button', { name: 'Finish' }).props.accessibilityState
      .disabled;

  it('disables Finish with a hint until a topic is added, then completes onboarding', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue(topic({ name: 'Thyroid' }));
    http.patch.mockResolvedValue({});
    await renderWithProviders(<TopicsStep />, http);
    expect(await screen.findByText('Added: 0 topics')).toBeOnTheScreen();
    expect(finishDisabled()).toBe(true);
    expect(
      screen.getByText('Add at least one topic, or tap Skip for now'),
    ).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Topic name'), 'Thyroid');
    await fireEvent.press(await screen.findByText('Anatomy'));
    await fireEvent.press(screen.getByText('Save & add another'));
    expect(await screen.findByText('Added: 1 topic')).toBeOnTheScreen();
    expect(
      screen.getByText(
        `Thyroid added — first revision ${formatDate('2026-11-12')}`,
      ),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText('Add at least one topic, or tap Skip for now'),
    ).toBeNull();
    expect(screen.getByLabelText('Topic name').props.value).toBe('');
    expect(
      screen.getByRole('radio', { name: 'Anatomy' }).props.accessibilityState
        .checked,
    ).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith('/v1/me', {
        onboardingCompleted: true,
      }),
    );
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it('Finish saves the typed topic first, then completes onboarding', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue(topic({ name: 'Thyroid' }));
    http.patch.mockResolvedValue({});
    await renderWithProviders(<TopicsStep />, http);
    await screen.findByText('Added: 0 topics');
    await fireEvent.changeText(screen.getByLabelText('Topic name'), 'Thyroid');
    expect(finishDisabled()).toBe(false);
    await fireEvent.press(await screen.findByText('Anatomy'));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
    expect(http.post).toHaveBeenCalledWith(
      '/v1/topics',
      expect.objectContaining({ name: 'Thyroid' }),
    );
    expect(http.patch).toHaveBeenCalledWith('/v1/me', {
      onboardingCompleted: true,
    });
    expect(http.post.mock.invocationCallOrder[0]).toBeLessThan(
      http.patch.mock.invocationCallOrder[0],
    );
  });

  it('Finish stops with the error in the form when the typed topic is incomplete', async () => {
    const http = makeHttp();
    await renderWithProviders(<TopicsStep />, http);
    await screen.findByText('Anatomy');
    await fireEvent.changeText(screen.getByLabelText('Topic name'), 'Thyroid');
    await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    expect(await screen.findByText('Choose a subject')).toBeOnTheScreen();
    expect(http.post).not.toHaveBeenCalled();
    expect(http.patch).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
  });

  it('Finish shows the connection error and Retry when offline', async () => {
    const http = makeHttp([topic()]);
    http.patch.mockRejectedValueOnce(new ApiError('NETWORK', 0));
    http.patch.mockResolvedValueOnce({});
    await renderWithProviders(<TopicsStep />, http);
    await screen.findByText('Added: 1 topic');
    await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    expect(finishDisabled()).toBe(false);
    await fireEvent.press(screen.getByText('Retry'));
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it('Skip for now asks before discarding a typed topic', async () => {
    const http = makeHttp();
    http.patch.mockResolvedValue({});
    await renderWithProviders(<TopicsStep />, http);
    await screen.findByText('Anatomy');
    await fireEvent.changeText(screen.getByLabelText('Topic name'), 'Thyroid');
    await fireEvent.press(screen.getByText('Skip for now'));
    expect(
      await screen.findByText('Discard the topic you typed?'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Keep editing'));
    await waitFor(() =>
      expect(screen.queryByText('Discard the topic you typed?')).toBeNull(),
    );
    expect(http.patch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Topic name').props.value).toBe('Thyroid');

    await fireEvent.press(screen.getByText('Skip for now'));
    await fireEvent.press(await screen.findByText('Discard and skip'));
    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith('/v1/me', {
        onboardingCompleted: true,
      }),
    );
    expect(http.post).not.toHaveBeenCalled();
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
    await waitFor(() => expect(screen.getByText('6:30 AM')).toBeOnTheScreen());
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

describe('ExamStep typed, unticked and past exams', () => {
  it('Next counts an exam typed in "Add your own" and creates it', async () => {
    const http = makeHttp();
    http.get.mockImplementation(async () => []);
    http.post.mockResolvedValue({ id: 'e1', name: 'FMGE', examDate: null });
    await renderStep('Exams', http);
    await screen.findByText('NEET SS');
    await fireEvent.changeText(screen.getByLabelText('Add your own'), ' FMGE ');
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next.props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(next);
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/v1/exams', { name: 'FMGE' }),
    );
    expect(await screen.findByText('Step 2 of 4')).toBeOnTheScreen();
  });

  it('Next saves both the ticked exams and the typed one', async () => {
    const http = makeHttp();
    http.get.mockImplementation(async () => []);
    http.post.mockResolvedValue({ id: 'e', name: 'x', examDate: null });
    await renderStep('Exams', http);
    await fireEvent.press(await screen.findByText('NEET SS'));
    await fireEvent.changeText(screen.getByLabelText('Add your own'), 'FMGE');
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(2));
    expect(http.post).toHaveBeenCalledWith('/v1/exams', { name: 'NEET SS' });
    expect(http.post).toHaveBeenCalledWith('/v1/exams', { name: 'FMGE' });
  });

  it('a typed name matching a quick pick is not created twice', async () => {
    const http = makeHttp();
    http.get.mockImplementation(async () => []);
    http.post.mockResolvedValue({ id: 'e', name: 'x', examDate: null });
    await renderStep('Exams', http);
    await fireEvent.press(await screen.findByText('NEET SS'));
    await fireEvent.changeText(
      screen.getByLabelText('Add your own'),
      'neet ss',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 2 of 4')).toBeOnTheScreen();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith('/v1/exams', { name: 'NEET SS' });
  });

  const untickSaved = async (http: ReturnType<typeof makeHttp>) => {
    await renderStep('Exams', http);
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'MS General Surgery' }).props
          .accessibilityState.checked,
      ).toBe(true),
    );
    await fireEvent.press(screen.getByText('NEET SS'));
    await fireEvent.press(screen.getByText('MS General Surgery'));
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  };

  it('asks before removing a saved exam the user unticked, then deletes it', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({ id: 'e', name: 'x', examDate: null });
    http.del.mockResolvedValue(undefined);
    await untickSaved(http);
    expect(
      await screen.findByText('Remove MS General Surgery?'),
    ).toBeOnTheScreen();
    expect(http.del).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove exam' }));
    await waitFor(() =>
      expect(http.del).toHaveBeenCalledWith(
        '/v1/exams/000000000000000000000011',
      ),
    );
    expect(http.post).toHaveBeenCalledWith('/v1/exams', { name: 'NEET SS' });
    expect(await screen.findByText('Step 2 of 4')).toBeOnTheScreen();
  });

  it('"Keep it" keeps the saved exam and carries on', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({ id: 'e', name: 'x', examDate: null });
    await untickSaved(http);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Keep it' }),
    );
    expect(await screen.findByText('Step 2 of 4')).toBeOnTheScreen();
    expect(http.del).not.toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledWith('/v1/exams', { name: 'NEET SS' });
  });

  it('the exam date picker starts at today and ignores past dates', async () => {
    const http = makeHttp();
    http.get.mockImplementation(async () => []);
    await renderStep('Exams', http);
    await fireEvent.press(await screen.findByText('NEET SS'));
    await fireEvent.press(screen.getByText('Set date for NEET SS'));
    const today = localToday();
    expect(toLocalDate(mockPickerProps.minimumDate as Date)).toBe(today);
    expect(toLocalDate(mockPickerProps.value as Date)).toBe(today);
    mockPickDate = fromLocalDate(addDays(today, -30));
    await fireEvent.press(screen.getByTestId('date-picker'));
    expect(
      screen.getByText('NEET SS exam date (optional): none'),
    ).toBeOnTheScreen();
  });

  it('opens the picker at today when a saved exam date has passed', async () => {
    const http = makeHttp();
    http.get.mockImplementation(async (p: string) =>
      p === '/v1/exams'
        ? [
            {
              id: ID(11),
              name: 'NEET SS',
              examDate: addDays(localToday(), -10),
            },
          ]
        : [],
    );
    await renderStep('Exams', http);
    await fireEvent.press(await screen.findByText('Change date for NEET SS'));
    expect(toLocalDate(mockPickerProps.value as Date)).toBe(localToday());
  });
});

describe('RemindersStep permissions and time', () => {
  it('opens notification settings when Android refuses without asking', async () => {
    (requestNotificationPermission as jest.Mock).mockResolvedValue(false);
    await renderStep('Reminders');
    await fireEvent.press(await screen.findByRole('button', { name: 'Allow' }));
    await waitFor(() =>
      expect(openReminderSettings).toHaveBeenCalledWith('notifications'),
    );
    expect(
      screen.getByRole('button', { name: 'Open settings' }),
    ).toBeOnTheScreen();
  });

  it("after the user says Don't allow, the button opens settings next time", async () => {
    (requestNotificationPermission as jest.Mock).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(false), 700)),
    );
    await renderStep('Reminders');
    await fireEvent.press(await screen.findByRole('button', { name: 'Allow' }));
    await screen.findByRole('button', { name: 'Open settings' });
    expect(openReminderSettings).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Open settings' }),
    );
    expect(openReminderSettings).toHaveBeenCalledWith('notifications');
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
  });

  it('shows no "Not allowed" or warning until the status has loaded', async () => {
    (getReminderStatus as jest.Mock).mockReturnValue(new Promise(() => {}));
    await renderStep('Reminders');
    await screen.findByText('Remind me at');
    expect(screen.queryByText('Not allowed')).toBeNull();
    expect(screen.queryByText(/reminders may not appear/)).toBeNull();
  });

  it('keeps showing the last status if a re-check fails', async () => {
    await renderStep('Reminders');
    expect(await screen.findByText('Not allowed')).toBeOnTheScreen();
    (getReminderStatus as jest.Mock).mockRejectedValue(new Error('x'));
    (requestNotificationPermission as jest.Mock).mockResolvedValue(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Allow' }));
    expect(screen.getByText('Not allowed')).toBeOnTheScreen();
  });

  it('hides the permission rows and warning when the daily reminder is off', async () => {
    await renderStep('Reminders');
    expect(await screen.findByText('Not allowed')).toBeOnTheScreen();
    await fireEvent(
      screen.getByLabelText('Daily reminder'),
      'valueChange',
      false,
    );
    expect(screen.queryByText('Not allowed')).toBeNull();
    expect(screen.queryByText(/reminders may not appear/)).toBeNull();
  });

  it('explains permissions in plain words and labels the time', async () => {
    await renderStep('Reminders');
    expect(
      await screen.findByText(/So we can remind you to revise/),
    ).toBeOnTheScreen();
    expect(screen.getByText('Remind me at')).toBeOnTheScreen();
    expect(screen.queryByText('Exact alarms')).toBeNull();
  });

  it('shows a 12-hour time when the phone uses a 12-hour clock', async () => {
    const http = makeHttp();
    http.get.mockImplementation(async (p: string) =>
      p === '/v1/me' ? { settings: { reminderTime: '20:30' } } : [],
    );
    await renderStep('Reminders', http);
    expect(await screen.findByText('8:30 PM')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Remind me at 8:30 PM'));
    expect(mockPickerProps.is24Hour).toBeUndefined();
  });

  it('shows a 24-hour time when the phone uses a 24-hour clock', async () => {
    NativeModules.AppConfig.IS_24_HOUR_CLOCK = true;
    const http = makeHttp();
    http.get.mockImplementation(async (p: string) =>
      p === '/v1/me' ? { settings: { reminderTime: '20:30' } } : [],
    );
    await renderStep('Reminders', http);
    expect(await screen.findByText('20:30')).toBeOnTheScreen();
  });

  it('keeps Next disabled until the saved reminder time has loaded', async () => {
    const http = makeHttp();
    http.get.mockImplementation((p: string) =>
      p === '/v1/me' ? new Promise(() => {}) : Promise.resolve([]),
    );
    await renderStep('Reminders', http);
    await screen.findByText('Remind me at');
    expect(
      screen.getByRole('button', { name: 'Next' }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });
});
