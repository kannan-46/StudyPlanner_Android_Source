import React from 'react';
import { Linking, useWindowDimensions } from 'react-native';
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

it('quick off/on taps on the reminder switch end on the last tap', async () => {
  const http = setup();
  const replies: Array<() => void> = [];
  const real = http.patch.getMockImplementation()!;
  http.patch.mockImplementation(
    (p: string, body: any) =>
      new Promise(resolve => {
        replies.push(() => resolve(real(p, body)));
      }),
  );
  await renderWithProviders(<SettingsScreen />, http);
  const sw = () => screen.getByLabelText('Daily reminder');
  await screen.findByLabelText('Daily reminder');
  await fireEvent(sw(), 'valueChange', false);
  await fireEvent(sw(), 'valueChange', true);
  await waitFor(() => expect(replies).toHaveLength(2));

  // The first save finishing must not flip the switch back to off.
  await act(async () => replies[0]());
  expect(sw().props.value).toBe(true);
  expect(configureReminders).not.toHaveBeenCalled();

  await act(async () => replies[1]());
  await waitFor(() =>
    expect(configureReminders).toHaveBeenCalledWith(true, '08:00'),
  );
  expect(configureReminders).toHaveBeenCalledTimes(1);
  expect(sw().props.value).toBe(true);
});

it('theme chips apply the local theme at once, without waiting for the server', async () => {
  const http = setup();
  await renderWithProviders(<SettingsScreen />, http);
  const chip = (name: string) => screen.getByRole('radio', { name });
  await screen.findByText('Dark');
  expect(chip('Light').props.accessibilityState.checked).toBe(true);
  await fireEvent.press(chip('Dark'));
  expect(chip('Dark').props.accessibilityState.checked).toBe(true);
  await fireEvent.press(chip('System'));
  expect(chip('System').props.accessibilityState.checked).toBe(true);
  expect(chip('Dark').props.accessibilityState.checked).toBe(false);
  // Saving to the server is the app theme provider's job, not this screen's.
  expect(http.patch).not.toHaveBeenCalled();
  expect(refreshUser).not.toHaveBeenCalled();
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

it('failed interval save keeps the typed intervals', async () => {
  const http = setup();
  await renderWithProviders(<SettingsScreen />, http);
  await fireEvent.changeText(
    await screen.findByLabelText('Revision intervals (days)'),
    '3, 7, 21, 45',
  );
  http.patch.mockRejectedValueOnce(new ApiError('NETWORK', 0));
  await fireEvent.press(screen.getByText('Save intervals'));
  expect(
    await screen.findByText("Can't reach the server — try again"),
  ).toBeTruthy();
  expect(screen.getByDisplayValue('3, 7, 21, 45')).toBeTruthy();
  expect(isDisabled('Save intervals')).toBe(false);
});

it('Save intervals shows a spinner while saving', async () => {
  const http = setup();
  let release: () => void = () => {};
  http.patch.mockReturnValueOnce(new Promise(r => (release = () => r(user))));
  await renderWithProviders(<SettingsScreen />, http);
  await fireEvent.changeText(
    await screen.findByLabelText('Revision intervals (days)'),
    '2, 5, 9',
  );
  fireEvent.press(screen.getByText('Save intervals'));
  expect(await screen.findByTestId('button-spinner')).toBeTruthy();
  await act(async () => {
    release();
  });
  await waitFor(() =>
    expect(screen.queryByTestId('button-spinner')).toBeNull(),
  );
});

it('sign out asks first, then signs out with feedback', async () => {
  await renderWithProviders(<SettingsScreen />, setup());
  await fireEvent.press(await screen.findByText('Sign out'));
  expect(await screen.findByText('Sign out?')).toBeTruthy();
  expect(signOut).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Cancel'));
  await waitFor(() => expect(screen.queryByText('Sign out?')).toBeNull());
  expect(signOut).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByText('Sign out'));
  const all = await screen.findAllByText('Sign out');
  await fireEvent.press(all[all.length - 1]);
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("You're signed out")).toBeTruthy();
});

it('navigation links work', async () => {
  await renderWithProviders(<SettingsScreen />, setup());
  await screen.findByText('Sign out');
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

describe('app version', () => {
  const release = {
    latestVersionCode: 6,
    latestVersionName: '4.2.0',
    downloadUrl: 'https://github.com/x/y/releases/latest',
    notes: 'Faster sync',
  };
  function setupWithVersion(body: unknown) {
    const http = setup();
    const base = http.get.getMockImplementation()!;
    http.get.mockImplementation(async (p: string) =>
      p === '/v1/app/version' ? body : base(p),
    );
    return http;
  }

  it('shows the installed version and a check button when up to date', async () => {
    const http = setupWithVersion({ ...release, latestVersionCode: 5 });
    await renderWithProviders(<SettingsScreen />, http);
    expect(await screen.findByText('You have the latest version')).toBeTruthy();
    expect(screen.getByText('App version 4.1.0')).toBeTruthy();
    const calls = () =>
      http.get.mock.calls.filter(c => c[0] === '/v1/app/version').length;
    expect(calls()).toBe(1);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Check for updates' }),
    );
    await waitFor(() => expect(calls()).toBe(2));
    expect(screen.queryByText(/Update available/)).toBeNull();
  });

  it('still shows the installed version when the check fails', async () => {
    const http = setup();
    const base = http.get.getMockImplementation()!;
    http.get.mockImplementation(async (p: string) => {
      if (p === '/v1/app/version') throw new ApiError('NOT_FOUND', 404);
      return base(p);
    });
    await renderWithProviders(<SettingsScreen />, http);
    expect(await screen.findByText('App version 4.1.0')).toBeTruthy();
    // Once the failed check settles, the button is ready again; no error shown.
    expect(
      await screen.findByRole('button', { name: 'Check for updates' }),
    ).toBeTruthy();
    expect(screen.queryByText('You have the latest version')).toBeNull();
  });

  it('shows the update row and opens the download link', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderWithProviders(<SettingsScreen />, setupWithVersion(release));
    expect(
      await screen.findByText('App version 4.1.0 · Update available'),
    ).toBeTruthy();
    expect(screen.getByText('Version 4.2.0 is available')).toBeTruthy();
    expect(screen.getByText('Faster sync')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Download update' }),
    );
    expect(open).toHaveBeenCalledWith(release.downloadUrl);
    open.mockRestore();
  });
});
