import { NativeModules } from 'react-native';
import {
  FOCUS_ALARM_ID,
  cancelOneShot,
  clearReminders,
  getReminderStatus,
  scheduleOneShot,
  scheduleOneShotWithStatus,
} from '../reminders';

const original = NativeModules.Reminders;
afterEach(() => {
  NativeModules.Reminders = original;
  jest.clearAllMocks();
});

it('passes a one-shot alert through to the native module', async () => {
  await scheduleOneShot('focus_timer', 1_700_000_000_000, 'Title', 'Body');
  expect(NativeModules.Reminders.scheduleOneShot).toHaveBeenCalledWith(
    'focus_timer',
    1_700_000_000_000,
    'Title',
    'Body',
  );
  await cancelOneShot('focus_timer');
  expect(NativeModules.Reminders.cancelOneShot).toHaveBeenCalledWith(
    'focus_timer',
  );
});

it('reports whether the one-shot alarm is exact and can show', async () => {
  NativeModules.Reminders.scheduleOneShot.mockResolvedValueOnce({
    exact: false,
    canNotify: true,
  });
  await expect(
    scheduleOneShotWithStatus(FOCUS_ALARM_ID, 1, 't', 'b'),
  ).resolves.toEqual({
    exact: false,
    canNotify: true,
  });
});

it('gives null when the native module reports nothing', async () => {
  NativeModules.Reminders.scheduleOneShot.mockResolvedValueOnce(undefined);
  await expect(
    scheduleOneShotWithStatus(FOCUS_ALARM_ID, 1, 't', 'b'),
  ).resolves.toBe(null);
});

it('can cancel the alarm but keep a notification that already showed', async () => {
  await cancelOneShot(FOCUS_ALARM_ID, { keepNotification: true });
  expect(NativeModules.Reminders.cancelOneShotAlarm).toHaveBeenCalledWith(
    'focus_timer',
  );
  expect(NativeModules.Reminders.cancelOneShot).not.toHaveBeenCalled();
});

it('falls back to a full cancel when the keep-notification call is missing', async () => {
  NativeModules.Reminders = {
    ...original,
    cancelOneShotAlarm: undefined,
  };
  await cancelOneShot(FOCUS_ALARM_ID, { keepNotification: true });
  expect(NativeModules.Reminders.cancelOneShot).toHaveBeenCalledWith(
    'focus_timer',
  );
});

it('passes the new status fields through', async () => {
  const status = {
    notificationsEnabled: true,
    exactAlarmsAllowed: false,
    ignoringBatteryOptimizations: false,
    nextFireAtMillis: 1,
    dailyReminderEnabled: true,
    exactTiming: false,
    nextShowAtMillis: null,
    blockedReason: 'nothingDue',
    focusAlertsEnabled: true,
  };
  NativeModules.Reminders.getStatus.mockResolvedValueOnce(status);
  await expect(getReminderStatus()).resolves.toEqual(status);
});

it('clears everything on sign-out through one native call', async () => {
  await clearReminders();
  expect(NativeModules.Reminders.clearAll).toHaveBeenCalledTimes(1);
});

it('does nothing when the native module is missing', async () => {
  NativeModules.Reminders = undefined;
  await expect(scheduleOneShot('a', 1, 't', 'b')).resolves.toBeUndefined();
  await expect(scheduleOneShotWithStatus('a', 1, 't', 'b')).resolves.toBeNull();
  await expect(cancelOneShot('a')).resolves.toBeUndefined();
  await expect(
    cancelOneShot('a', { keepNotification: true }),
  ).resolves.toBeUndefined();
  await expect(getReminderStatus()).resolves.toBeNull();
});
