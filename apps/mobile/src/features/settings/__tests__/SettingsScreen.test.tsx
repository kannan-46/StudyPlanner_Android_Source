import React from 'react';
import { useWindowDimensions } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { DEFAULT_SETTINGS } from '@planner/shared';
import { ApiError } from '../../../shared/api/errors';
import { useAuth } from '../../auth/AuthProvider';
import { SettingsScreen } from '../SettingsScreen';
import { configureReminders } from '../../../native/reminders';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('../../../native/reminders', () => ({
  configureReminders: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../native/backupFiles', () => ({
  pickBackupFile: jest.fn(),
  saveBackupFile: jest.fn(),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mockDims = (width: number, fontScale = 1) =>
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width,
    height: 800,
    scale: 2,
    fontScale,
  });

const signOut = jest.fn().mockResolvedValue(undefined);
const refreshUser = jest.fn().mockResolvedValue(undefined);
const user = {
  id: 'u',
  email: 'a@b.com',
  name: 'A',
  avatarUrl: null,
  onboardingCompletedAt: 'x',
  settings: { ...DEFAULT_SETTINGS, intervals: [4, 7, 15] },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDims(360);
  (useAuth as jest.Mock).mockReturnValue({ signOut, refreshUser });
});
afterEach(cleanupClients);

function setup() {
  const http = makeHttp();
  let current = user;
  http.get.mockImplementation(async (p: string) =>
    p === '/v1/me' ? current : [],
  );
  http.patch.mockImplementation(async (_p: string, body: any) => {
    current = {
      ...current,
      settings: { ...current.settings, ...body.settings },
    };
    return current;
  });
  return http;
}

const isDisabled = (label: string) =>
  screen.getByRole('button', { name: label }).props.accessibilityState.disabled;

it('shows email and the intervals preview, saves valid intervals', async () => {
  const http = setup();
  await renderWithProviders(<SettingsScreen />, http);
  expect(await screen.findByText('a@b.com')).toBeTruthy();
  expect(screen.getByTestId('interval-preview')).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText('Revision intervals (days)'),
    '2, 5, 9',
  );
  await fireEvent.press(screen.getByText('Save intervals'));
  await waitFor(() =>
    expect(http.patch).toHaveBeenCalledWith('/v1/me', {
      settings: { intervals: [2, 5, 9] },
    }),
  );
});

it('invalid intervals show an error and disable save', async () => {
  await renderWithProviders(<SettingsScreen />, setup());
  await fireEvent.changeText(
    await screen.findByLabelText('Revision intervals (days)'),
    'a, b',
  );
  expect(screen.getByText('Use whole numbers like 4, 7, 15')).toBeTruthy();
  expect(screen.queryByTestId('interval-preview')).toBeNull();
  expect(isDisabled('Save intervals')).toBe(true);
});

it('reminder switch saves and reconfigures; failure reverts with a snackbar', async () => {
  const http = setup();
  await renderWithProviders(<SettingsScreen />, http);
  const sw = await screen.findByLabelText('Daily reminder');
  await fireEvent(sw, 'valueChange', false);
  await waitFor(() =>
    expect(http.patch).toHaveBeenCalledWith('/v1/me', {
      settings: { dailyReminder: false, reminderTime: '08:00' },
    }),
  );
  await waitFor(() =>
    expect(configureReminders).toHaveBeenCalledWith(false, '08:00'),
  );

  http.patch.mockRejectedValueOnce(new ApiError('NETWORK', 0));
  await fireEvent(screen.getByLabelText('Daily reminder'), 'valueChange', true);
  expect(
    await screen.findByText("Can't reach the server — try again"),
  ).toBeTruthy();
  await waitFor(() =>
    expect(screen.getByLabelText('Daily reminder').props.value).toBe(false),
  );
});

it('theme change saves and refreshes the signed-in user', async () => {
  const http = setup();
  await renderWithProviders(<SettingsScreen />, http);
  await fireEvent.press(await screen.findByText('Dark'));
  await waitFor(() =>
    expect(http.patch).toHaveBeenCalledWith('/v1/me', {
      settings: { theme: 'dark' },
    }),
  );
  await waitFor(() => expect(refreshUser).toHaveBeenCalled());
});

it('delete account stays disabled until DELETE is typed', async () => {
  const http = setup();
  http.del.mockResolvedValue(undefined);
  await renderWithProviders(<SettingsScreen />, http);
  await fireEvent.press(await screen.findByText('Delete account'));
  expect(isDisabled('Delete forever')).toBe(true);
  await fireEvent.changeText(screen.getByLabelText('Type DELETE'), 'DELET');
  expect(isDisabled('Delete forever')).toBe(true);
  await fireEvent.changeText(screen.getByLabelText('Type DELETE'), 'DELETE');
  expect(isDisabled('Delete forever')).toBe(false);
  await fireEvent.press(screen.getByText('Delete forever'));
  await waitFor(() => expect(http.del).toHaveBeenCalledWith('/v1/me'));
  await waitFor(() => expect(signOut).toHaveBeenCalled());
});

it('delete dialog cannot be dismissed while deleting', async () => {
  const http = setup();
  let release!: () => void;
  http.del.mockImplementation(
    () =>
      new Promise<void>(r => {
        release = r;
      }),
  );
  await renderWithProviders(<SettingsScreen />, http);
  await fireEvent.press(await screen.findByText('Delete account'));
  await fireEvent.changeText(screen.getByLabelText('Type DELETE'), 'DELETE');
  fireEvent.press(screen.getByText('Delete forever'));
  await waitFor(() => expect(http.del).toHaveBeenCalled());
  expect(isDisabled('Cancel')).toBe(true);
  // Hardware back press on the modal.
  await fireEvent(screen.getByText('Cancel'), 'requestClose');
  expect(screen.getByText('Cancel')).toBeTruthy();
  await act(async () => {
    release();
  });
  await waitFor(() => expect(signOut).toHaveBeenCalled());
});

it('sign out and navigation links work', async () => {
  await renderWithProviders(<SettingsScreen />, setup());
  await fireEvent.press(await screen.findByText('Sign out'));
  expect(signOut).toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Reminder health'));
  expect(mockNavigate).toHaveBeenCalledWith('ReminderHealth');
  await fireEvent.press(screen.getByText('Manage exams & subjects'));
  expect(mockNavigate).toHaveBeenCalledWith('ManageExamsSubjects');
});

it('renders at 320 dp / font scale 1.3 and at 1000 dp', async () => {
  mockDims(320, 1.3);
  const { unmount } = await renderWithProviders(<SettingsScreen />, setup());
  expect(await screen.findByText('Sign out')).toBeTruthy();
  await act(async () => {
    unmount();
  });
  mockDims(1000);
  await renderWithProviders(<SettingsScreen />, setup());
  expect(await screen.findByText('Sign out')).toBeTruthy();
  expect(screen.getByTestId('responsive-container').props.style).toMatchObject({
    maxWidth: 720,
  });
});
