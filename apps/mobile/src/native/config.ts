import { NativeModules } from 'react-native';

interface ConfigValues {
  API_BASE_URL?: string;
  GOOGLE_WEB_CLIENT_ID?: string;
  /** The phone's 12/24-hour clock setting (Android DateFormat). */
  IS_24_HOUR_CLOCK?: boolean;
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
