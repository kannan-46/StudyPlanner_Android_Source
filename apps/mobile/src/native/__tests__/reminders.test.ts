import { NativeModules } from 'react-native';
import { cancelOneShot, scheduleOneShot } from '../reminders';

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

it('does nothing when the native module is missing', async () => {
  NativeModules.Reminders = undefined;
  await expect(scheduleOneShot('a', 1, 't', 'b')).resolves.toBeUndefined();
  await expect(cancelOneShot('a')).resolves.toBeUndefined();
});
