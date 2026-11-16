import React from 'react';
import { NativeModules, useWindowDimensions } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  MAY_BE_LATE_TEXT,
  NEXT_REMINDER_TEXT,
  ONE_A_DAY_TEXT,
  ReminderHealthScreen,
  nextReminderLabel,
  reminderWhen,
} from '../ReminderHealthScreen';
import {
  getReminderStatus,
  openReminderSettings,
  sendTestNotification,
} from '../../../native/reminders';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../../native/reminders', () => ({
  getReminderStatus: jest.fn(),
  openReminderSettings: jest.fn().mockResolvedValue(undefined),
  sendTestNotification: jest.fn(),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mockDims = (width: number, fontScale = 1) =>
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width,
    height: 800,
    scale: 2,
    fontScale,
  });
const status = (over = {}) => ({
  notificationsEnabled: true,
  exactAlarmsAllowed: true,
  ignoringBatteryOptimizations: true,
  nextFireAtMillis: null,
  ...over,
});
/** `days` from today at hh:mm, local time. */
const at = (days: number, hh: number, mm = 0) => {
  const n = new Date();
  return new Date(
    n.getFullYear(),
    n.getMonth(),
    n.getDate() + days,
    hh,
    mm,
  ).getTime();
};

afterEach(cleanupClients);
beforeEach(() => {
  jest.clearAllMocks();
  mockDims(360);
  NativeModules.AppConfig.IS_24_HOUR_CLOCK = false;
  (getReminderStatus as jest.Mock).mockResolvedValue(status());
});

it('notifications off says Not allowed; Allow opens notification settings', async () => {
  (getReminderStatus as jest.Mock).mockResolvedValue(
    status({ notificationsEnabled: false }),
  );
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(await screen.findByText('Not allowed')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Allow Notifications'));
  expect(openReminderSettings).toHaveBeenCalledWith('notifications');
  expect(
    screen.getByText(
      "Shows your daily revision reminder and the focus timer's end alert.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(/focus timer's alert right when it ends/),
  ).toBeTruthy();
  expect(screen.queryByText('Off — Fix')).toBeNull();
});

it('uses Android\'s name "Alarms & reminders" and explains it', async () => {
  (getReminderStatus as jest.Mock).mockResolvedValue(
    status({ exactAlarmsAllowed: false }),
  );
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(await screen.findByText('Alarms & reminders')).toBeTruthy();
  expect(screen.queryByText('Exact alarms')).toBeNull();
  expect(screen.getByText(/may come a few minutes late/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Allow Alarms & reminders'));
  expect(openReminderSettings).toHaveBeenCalledWith('exactAlarm');
});

it('battery is an optional tip, never an error row', async () => {
  (getReminderStatus as jest.Mock).mockResolvedValue(
    status({ ignoringBatteryOptimizations: false }),
  );
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(await screen.findByText('Optional: background usage')).toBeTruthy();
  expect(screen.queryByText('Not allowed')).toBeNull();
  expect(screen.queryByText('Battery')).toBeNull();
  expect(screen.queryByText('✗')).toBeNull();
  await fireEvent.press(screen.getByText('Open battery settings'));
  expect(openReminderSettings).toHaveBeenCalledWith('battery');
});

it('battery tip shows a tick instead of the button once allowed', async () => {
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(await screen.findByText('Optional: background usage')).toBeTruthy();
  expect(screen.getByLabelText('Background usage allowed')).toBeTruthy();
  expect(screen.queryByText('Open battery settings')).toBeNull();
});

it('shows ticks when everything is on and the next reminder that will show', async () => {
  (getReminderStatus as jest.Mock).mockResolvedValue(
    status({
      nextFireAtMillis: at(1, 8),
      nextShowAtMillis: at(1, 20, 30),
      blockedReason: null,
    }),
  );
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(
    await screen.findByText('Next reminder: Tomorrow, 8:30 PM'),
  ).toBeTruthy();
  expect(screen.getByLabelText('Notifications allowed')).toBeTruthy();
  expect(screen.getByLabelText('Alarms & reminders allowed')).toBeTruthy();
  expect(screen.getByText(ONE_A_DAY_TEXT)).toBeTruthy();
  expect(screen.queryByText(MAY_BE_LATE_TEXT)).toBeNull();
});

it('follows a 24-hour clock and notes a late reminder', async () => {
  NativeModules.AppConfig.IS_24_HOUR_CLOCK = true;
  (getReminderStatus as jest.Mock).mockResolvedValue(
    status({
      nextShowAtMillis: at(0, 23, 59),
      blockedReason: null,
      exactTiming: false,
    }),
  );
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(await screen.findByText('Next reminder: Today, 23:59')).toBeTruthy();
  expect(screen.getByText(MAY_BE_LATE_TEXT)).toBeTruthy();
});

it('says it will not appear when notifications are off', async () => {
  (getReminderStatus as jest.Mock).mockResolvedValue(
    status({
      notificationsEnabled: false,
      nextFireAtMillis: at(1, 8),
      nextShowAtMillis: at(1, 8),
      blockedReason: 'notificationsOff',
    }),
  );
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(
    await screen.findByText(
      "Next reminder: Won't appear: notifications are off",
    ),
  ).toBeTruthy();
});

it('explains that nothing is due', async () => {
  (getReminderStatus as jest.Mock).mockResolvedValue(
    status({
      nextFireAtMillis: at(1, 8),
      nextShowAtMillis: null,
      blockedReason: 'nothingDue',
    }),
  );
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(
    await screen.findByText(
      'Next reminder: No revisions due in the next 60 days',
    ),
  ).toBeTruthy();
});

it('when the reminder is off, links back to the Settings switch', async () => {
  (getReminderStatus as jest.Mock).mockResolvedValue(
    status({ nextFireAtMillis: null, blockedReason: 'off' }),
  );
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(await screen.findByText('Next reminder: Off')).toBeTruthy();
  await fireEvent.press(screen.getByText('Turn it on in Settings'));
  expect(mockNavigate).toHaveBeenCalledWith('MainTabs', {
    screen: 'Settings',
  });
});

it('says Unavailable, not Nothing due, when the status is missing', async () => {
  (getReminderStatus as jest.Mock).mockResolvedValue(null);
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(await screen.findByText('Next reminder: Unavailable')).toBeTruthy();
  expect(screen.queryByText(/Nothing due/)).toBeNull();
});

it('test notification: success and notifications-off error', async () => {
  (sendTestNotification as jest.Mock).mockResolvedValueOnce(undefined);
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  await fireEvent.press(await screen.findByText('Send test notification'));
  expect(await screen.findByText('Test notification sent')).toBeTruthy();
  (sendTestNotification as jest.Mock).mockRejectedValueOnce({
    code: 'E_NOTIFICATIONS_OFF',
  });
  await fireEvent.press(screen.getByText('Send test notification'));
  expect(
    await screen.findByText('Notifications are off — turn them on first'),
  ).toBeTruthy();
});

it('shows Checking… and no Allow rows until the status resolves', async () => {
  let resolve!: (v: unknown) => void;
  (getReminderStatus as jest.Mock).mockReturnValue(
    new Promise(r => {
      resolve = r;
    }),
  );
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(screen.getByText('Checking reminder status…')).toBeTruthy();
  expect(screen.getByText('Next reminder: Checking…')).toBeTruthy();
  expect(screen.queryByText('Not allowed')).toBeNull();
  await act(async () => {
    resolve(status());
  });
  await waitFor(() =>
    expect(screen.queryByText('Checking reminder status…')).toBeNull(),
  );
  expect(screen.queryByText('Not allowed')).toBeNull();
});

it('renders at 320 dp with font scale 1.3 and at 1000 dp', async () => {
  mockDims(320, 1.3);
  const { unmount } = await renderWithProviders(
    <ReminderHealthScreen />,
    makeHttp(),
  );
  expect(await screen.findByText('Send test notification')).toBeTruthy();
  await act(async () => {
    unmount();
  });
  mockDims(1000);
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(await screen.findByText('Send test notification')).toBeTruthy();
});

describe('nextReminderLabel', () => {
  const now = new Date(2026, 10, 16, 7, 0); // Monday 07:00

  it('uses Today, Tomorrow, or the weekday and date', () => {
    expect(reminderWhen(new Date(2026, 10, 16, 8, 0).getTime(), now)).toBe(
      'Today, 8:00 AM',
    );
    expect(reminderWhen(new Date(2026, 10, 17, 8, 0).getTime(), now)).toBe(
      'Tomorrow, 8:00 AM',
    );
    expect(reminderWhen(new Date(2026, 10, 20, 8, 0).getTime(), now)).toBe(
      'Fri, 20 Nov, 8:00 AM',
    );
  });

  it('works out the reason from an older native status', () => {
    const old = status({
      nextFireAtMillis: new Date(2026, 10, 17, 8).getTime(),
    });
    expect(nextReminderLabel(true, old, false, now)).toBe(
      NEXT_REMINDER_TEXT.off,
    );
    expect(
      nextReminderLabel(
        true,
        { ...old, notificationsEnabled: false },
        true,
        now,
      ),
    ).toBe(NEXT_REMINDER_TEXT.notificationsOff);
    expect(nextReminderLabel(true, old, true, now)).toBe('Tomorrow, 8:00 AM');
    expect(nextReminderLabel(false, old, true, now)).toBe(
      NEXT_REMINDER_TEXT.checking,
    );
  });
});
