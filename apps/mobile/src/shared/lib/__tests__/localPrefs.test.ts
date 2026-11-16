import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearOnboardingStep,
  loadDismissedUpdate,
  loadFocusTimer,
  loadOnboardingStep,
  loadThemePrefs,
  saveDismissedUpdate,
  saveFocusTimer,
  saveOnboardingStep,
  saveSyncedTheme,
  saveThemeMode,
} from '../localPrefs';

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

describe('onboarding step', () => {
  it('starts at step 1 on a fresh install', async () => {
    expect(await loadOnboardingStep('u1')).toBe(1);
  });

  it('round-trips the step for the same user', async () => {
    await saveOnboardingStep('u1', 3);
    expect(await loadOnboardingStep('u1')).toBe(3);
  });

  it('ignores a step saved by another account', async () => {
    await saveOnboardingStep('u1', 3);
    expect(await loadOnboardingStep('u2')).toBe(1);
  });

  it('falls back to step 1 for broken or out-of-range values', async () => {
    await AsyncStorage.setItem('prefs.onboardingStep', '{not json');
    expect(await loadOnboardingStep('u1')).toBe(1);
    await AsyncStorage.setItem(
      'prefs.onboardingStep',
      JSON.stringify({ userId: 'u1', step: 9 }),
    );
    expect(await loadOnboardingStep('u1')).toBe(1);
  });

  it('clears the saved step', async () => {
    await saveOnboardingStep('u1', 4);
    await clearOnboardingStep();
    expect(await loadOnboardingStep('u1')).toBe(1);
  });
});

describe('focus timer', () => {
  it('has nothing saved on a fresh install', async () => {
    expect(await loadFocusTimer()).toBeNull();
  });

  it('round-trips a running and a paused session', async () => {
    const running = {
      status: 'running' as const,
      endsAt: 1_700_000_000_000,
      remainingMs: 60_000,
    };
    await saveFocusTimer(running);
    expect(await loadFocusTimer()).toEqual(running);
    const paused = {
      status: 'paused' as const,
      endsAt: null,
      remainingMs: 90_000,
    };
    await saveFocusTimer(paused);
    expect(await loadFocusTimer()).toEqual(paused);
  });

  it('saving null clears it', async () => {
    await saveFocusTimer({ status: 'paused', endsAt: null, remainingMs: 5 });
    await saveFocusTimer(null);
    expect(await loadFocusTimer()).toBeNull();
    expect(await AsyncStorage.getItem('prefs.focusTimer')).toBeNull();
  });

  it('ignores broken saved values', async () => {
    await AsyncStorage.setItem('prefs.focusTimer', '{oops');
    expect(await loadFocusTimer()).toBeNull();
    await AsyncStorage.setItem(
      'prefs.focusTimer',
      JSON.stringify({ status: 'running', endsAt: null, remainingMs: 5 }),
    );
    expect(await loadFocusTimer()).toBeNull();
    await AsyncStorage.setItem(
      'prefs.focusTimer',
      JSON.stringify({ status: 'idle', endsAt: null, remainingMs: 5 }),
    );
    expect(await loadFocusTimer()).toBeNull();
  });
});

describe('dismissed update', () => {
  it('remembers the version hidden with Later', async () => {
    expect(await loadDismissedUpdate()).toBeNull();
    await saveDismissedUpdate(6);
    expect(await loadDismissedUpdate()).toBe(6);
    await saveDismissedUpdate(7);
    expect(await loadDismissedUpdate()).toBe(7);
  });

  it('ignores broken saved values', async () => {
    await AsyncStorage.setItem('prefs.updateDismissedVersionCode', 'abc');
    expect(await loadDismissedUpdate()).toBeNull();
    await AsyncStorage.setItem('prefs.updateDismissedVersionCode', '-1');
    expect(await loadDismissedUpdate()).toBeNull();
  });
});
