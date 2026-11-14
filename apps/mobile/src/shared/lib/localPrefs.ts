import AsyncStorage from '@react-native-async-storage/async-storage';
import { setNativeThemeMode } from '../../native/config';

export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * Theme choice kept on the device. `mode` is what the app shows; `synced` is
 * the last value we know the server holds (null when unknown, e.g. before the
 * first sign-in or after sign-out).
 */
export type ThemePrefs = { mode: ThemeMode | null; synced: ThemeMode | null };

const KEY_MODE = 'prefs.theme';
const KEY_SYNCED = 'prefs.themeSynced';
const LOAD_TIMEOUT_MS = 1500;

const isMode = (v: unknown): v is ThemeMode =>
  v === 'system' || v === 'light' || v === 'dark';

const EMPTY: ThemePrefs = { mode: null, synced: null };

/** Never rejects: storage problems or a slow read fall back to no prefs. */
export async function loadThemePrefs(): Promise<ThemePrefs> {
  const read = AsyncStorage.multiGet([KEY_MODE, KEY_SYNCED]).then(
    (pairs): ThemePrefs => {
      const map = new Map(pairs);
      const mode = map.get(KEY_MODE);
      const synced = map.get(KEY_SYNCED);
      return {
        mode: isMode(mode) ? mode : null,
        synced: isMode(synced) ? synced : null,
      };
    },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ThemePrefs>(resolve => {
    timer = setTimeout(() => resolve(EMPTY), LOAD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([read, timeout]);
  } catch {
    return EMPTY;
  } finally {
    clearTimeout(timer);
  }
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  // Native copy, read by the Android activity before its first frame.
  setNativeThemeMode(mode);
  try {
    await AsyncStorage.setItem(KEY_MODE, mode);
  } catch {
    // Best effort: the server copy still restores it on the next launch.
  }
}

export async function saveSyncedTheme(mode: ThemeMode | null): Promise<void> {
  try {
    if (mode === null) await AsyncStorage.removeItem(KEY_SYNCED);
    else await AsyncStorage.setItem(KEY_SYNCED, mode);
  } catch {
    // Best effort.
  }
}

const KEY_ONBOARDING = 'prefs.onboardingStep';
export const ONBOARDING_STEPS = 4;

/**
 * The furthest setup step (1-4) this user reached on this phone, so a
 * relaunch mid-setup resumes there. Never rejects; falls back to step 1.
 */
export async function loadOnboardingStep(userId: string): Promise<number> {
  const read = AsyncStorage.getItem(KEY_ONBOARDING).then(raw => {
    if (!raw) return 1;
    const saved = JSON.parse(raw) as { userId?: unknown; step?: unknown };
    const step = saved.step;
    return saved.userId === userId &&
      typeof step === 'number' &&
      Number.isInteger(step) &&
      step >= 1 &&
      step <= ONBOARDING_STEPS
      ? step
      : 1;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<number>(resolve => {
    timer = setTimeout(() => resolve(1), LOAD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([read, timeout]);
  } catch {
    return 1;
  } finally {
    clearTimeout(timer);
  }
}

export async function saveOnboardingStep(
  userId: string,
  step: number,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEY_ONBOARDING,
      JSON.stringify({ userId, step }),
    );
  } catch {
    // Best effort: a relaunch then starts setup at step 1 again.
  }
}

export async function clearOnboardingStep(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_ONBOARDING);
  } catch {
    // Best effort.
  }
}
