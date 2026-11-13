import {NativeModules} from 'react-native';

type NativeAppConfig = {
  API_BASE_URL?: string;
  getConstants?: () => {API_BASE_URL?: string};
};

const appConfig = NativeModules.AppConfig as NativeAppConfig | undefined;
const configuredUrl =
  appConfig?.getConstants?.().API_BASE_URL ?? appConfig?.API_BASE_URL;

/** Public API endpoint compiled into the Android app. It is not a secret. */
export const API_BASE_URL = (
  configuredUrl || 'https://api.example.invalid'
).replace(/\/+$/, '');
