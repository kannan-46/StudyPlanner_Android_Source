import AsyncStorage from '@react-native-async-storage/async-storage';

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
