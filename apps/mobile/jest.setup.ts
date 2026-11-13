/* eslint-env jest */
import { NativeModules } from 'react-native';

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn().mockResolvedValue(true),
  getGenericPassword: jest.fn().mockResolvedValue(false),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
}));

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

NativeModules.AppConfig = {
  API_BASE_URL: 'https://api.test/api/server',
  GOOGLE_WEB_CLIENT_ID: '',
};
NativeModules.GoogleAuth = { signIn: jest.fn(), signOut: jest.fn() };
NativeModules.Reminders = {
  schedule: jest.fn(),
  cancel: jest.fn(),
  getStatus: jest.fn(),
};
NativeModules.BackupFiles = { save: jest.fn(), pick: jest.fn() };
