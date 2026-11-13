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
