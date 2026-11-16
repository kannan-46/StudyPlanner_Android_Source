import { NativeModules } from 'react-native';

interface ConfigValues {
  API_BASE_URL?: string;
  GOOGLE_WEB_CLIENT_ID?: string;
  /** The phone's 12/24-hour clock setting (Android DateFormat). */
  IS_24_HOUR_CLOCK?: boolean;
  /** Installed release (Android BuildConfig.VERSION_CODE / VERSION_NAME). */
  VERSION_CODE?: number;
  VERSION_NAME?: string;
}
interface AppConfigShape extends ConfigValues {
  getConstants?: () => ConfigValues;
}

const raw: AppConfigShape = NativeModules.AppConfig ?? {};
const constants: ConfigValues = raw.getConstants?.() ?? raw;

export const API_BASE_URL: string =
  constants.API_BASE_URL ?? raw.API_BASE_URL ?? '';
export const GOOGLE_WEB_CLIENT_ID: string =
  constants.GOOGLE_WEB_CLIENT_ID ?? raw.GOOGLE_WEB_CLIENT_ID ?? '';

export type InstalledVersion = {
  /** Android versionCode; null when the native value is missing. */
  code: number | null;
  /** Android versionName, e.g. "4.1.0"; empty when missing. */
  name: string;
};

/** The installed app release, as built into the APK. */
export function getInstalledVersion(): InstalledVersion {
  const mod: AppConfigShape = NativeModules.AppConfig ?? {};
  let values: ConfigValues = mod;
  try {
    values = { ...mod, ...mod.getConstants?.() };
  } catch {
    // Fall back to the plain module fields.
  }
  const code = values.VERSION_CODE;
  const name = values.VERSION_NAME;
  return {
    code:
      typeof code === 'number' && Number.isInteger(code) && code > 0
        ? code
        : null,
    name: typeof name === 'string' ? name : '',
  };
}

/**
 * Gives the native side a copy of the theme choice so the next launch opens
 * in it from the very first frame, before JavaScript has loaded.
 */
export function setNativeThemeMode(mode: 'system' | 'light' | 'dark'): void {
  try {
    NativeModules.AppConfig?.setThemeMode?.(mode);
  } catch {
    // Best effort: the app still applies the theme once it has loaded.
  }
}

/**
 * Whether the phone shows a 24-hour clock. Uses the Android setting, or the
 * locale's usual clock when the native value is missing.
 */
export function uses24HourClock(): boolean {
  const value = constants.IS_24_HOUR_CLOCK ?? raw.IS_24_HOUR_CLOCK;
  if (typeof value === 'boolean') return value;
  try {
    const { hourCycle, hour12 } = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
    }).resolvedOptions() as { hourCycle?: string; hour12?: boolean };
    if (hourCycle) return hourCycle === 'h23' || hourCycle === 'h24';
    return hour12 === false;
  } catch {
    return true;
  }
}
