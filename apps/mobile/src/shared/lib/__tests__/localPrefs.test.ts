import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadThemePrefs, saveSyncedTheme, saveThemeMode } from '../localPrefs';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

it('loads nothing on a fresh install', async () => {
  expect(await loadThemePrefs()).toEqual({ mode: null, synced: null });
});

it('round-trips the theme and the synced value', async () => {
  await saveThemeMode('dark');
  await saveSyncedTheme('light');
  expect(await loadThemePrefs()).toEqual({ mode: 'dark', synced: 'light' });
  await saveSyncedTheme(null);
  expect(await loadThemePrefs()).toEqual({ mode: 'dark', synced: null });
});

it('saving a theme also gives the native side a copy for the next launch', async () => {
  await saveThemeMode('light');
  expect(NativeModules.AppConfig.setThemeMode).toHaveBeenCalledWith('light');
  expect(await AsyncStorage.getItem('prefs.theme')).toBe('light');
});

it('a native failure does not stop the theme being saved', async () => {
  (NativeModules.AppConfig.setThemeMode as jest.Mock).mockImplementationOnce(
    () => {
      throw new Error('x');
    },
  );
  await expect(saveThemeMode('dark')).resolves.toBeUndefined();
  expect(await AsyncStorage.getItem('prefs.theme')).toBe('dark');
});

it('ignores unknown stored values', async () => {
  await AsyncStorage.setItem('prefs.theme', 'purple');
  expect(await loadThemePrefs()).toEqual({ mode: null, synced: null });
});

it('never fails: storage errors fall back to no prefs', async () => {
  (AsyncStorage.multiGet as jest.Mock).mockRejectedValueOnce(new Error('x'));
  expect(await loadThemePrefs()).toEqual({ mode: null, synced: null });
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('x'));
  await expect(saveThemeMode('dark')).resolves.toBeUndefined();
});

it('a storage read that hangs does not block startup', async () => {
  jest.useFakeTimers();
  try {
    (AsyncStorage.multiGet as jest.Mock).mockReturnValueOnce(
      new Promise(() => {}),
    );
    const p = loadThemePrefs();
    jest.advanceTimersByTime(1500);
    expect(await p).toEqual({ mode: null, synced: null });
  } finally {
    jest.useRealTimers();
  }
});
