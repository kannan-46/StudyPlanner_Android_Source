/* eslint-env jest */
import { NativeModules } from 'react-native';

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn().mockResolvedValue(true),
  getGenericPassword: jest.fn().mockResolvedValue(false),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

NativeModules.AppConfig = {
  API_BASE_URL: 'https://api.test/api/server',
  GOOGLE_WEB_CLIENT_ID: '',
  setThemeMode: jest.fn(),
};
NativeModules.GoogleAuth = { signIn: jest.fn(), signOut: jest.fn() };
NativeModules.Reminders = {
  syncSnapshot: jest.fn().mockResolvedValue(undefined),
  configure: jest.fn().mockResolvedValue(undefined),
  getStatus: jest.fn().mockResolvedValue(null),
  requestNotificationPermission: jest.fn().mockResolvedValue(true),
  openSettings: jest.fn().mockResolvedValue(undefined),
  sendTestNotification: jest.fn().mockResolvedValue(undefined),
  clearAll: jest.fn().mockResolvedValue(undefined),
};
NativeModules.BackupFiles = {
  exportBackup: jest.fn().mockResolvedValue(undefined),
  importBackup: jest.fn(),
};
