import { NativeModules } from 'react-native';

interface ConfigValues {
  API_BASE_URL?: string;
  GOOGLE_WEB_CLIENT_ID?: string;
}
interface AppConfigShape extends ConfigValues {
  getConstants?: () => ConfigValues;
}

const raw: AppConfigShape = NativeModules.AppConfig ?? {};
const constants: ConfigValues = raw.getConstants?.() ?? raw;

export const API_BASE_URL: string = constants.API_BASE_URL ?? raw.API_BASE_URL ?? '';
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
