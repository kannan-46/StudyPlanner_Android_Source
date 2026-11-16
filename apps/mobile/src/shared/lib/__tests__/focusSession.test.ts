import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import { FOCUS_ALARM_ID, clearFocusSession } from '../focusSession';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

it('cancels the focus alarm and forgets the saved session', async () => {
  await AsyncStorage.setItem(
    'prefs.focusTimer',
    JSON.stringify({ status: 'paused', endsAt: null, remainingMs: 5 }),
  );
  await clearFocusSession();
  expect(NativeModules.Reminders.cancelOneShot).toHaveBeenCalledWith(
    FOCUS_ALARM_ID,
  );
  expect(FOCUS_ALARM_ID).toBe('focus_timer');
  expect(await AsyncStorage.getItem('prefs.focusTimer')).toBeNull();
});

it('still forgets the session when the alarm cannot be cancelled', async () => {
  (NativeModules.Reminders.cancelOneShot as jest.Mock).mockRejectedValueOnce(
    new Error('native'),
  );
  await AsyncStorage.setItem(
    'prefs.focusTimer',
    JSON.stringify({ status: 'paused', endsAt: null, remainingMs: 5 }),
  );
  await expect(clearFocusSession()).resolves.toBeUndefined();
  expect(await AsyncStorage.getItem('prefs.focusTimer')).toBeNull();
});
