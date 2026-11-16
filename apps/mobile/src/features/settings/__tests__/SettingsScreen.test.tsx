import React from 'react';
import {
  Linking,
  NativeModules,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { DEFAULT_SETTINGS } from '@planner/shared';
import { ApiError } from '../../../shared/api/errors';
import { useAuth } from '../../auth/AuthProvider';
import { SettingsScreen } from '../SettingsScreen';
import { INTERVALS_LABEL } from '../../onboarding/intervalsText';
import {
  configureReminders,
  getReminderStatus,
  openReminderSettings,
  requestNotificationPermission,
} from '../../../native/reminders';
import { saveBackupFile } from '../../../native/backupFiles';
import { useFocusEffect } from '@react-navigation/native';
import {
  ACCOUNT_DELETED_TEXT,
  CHECK_FAILED_TEXT,
  EMPTY_INTERVALS_MESSAGE,
  EXACT_ALARMS_OFF_TEXT,
  INTERVALS_SAVED_TEXT,
  INTERVALS_SCOPE_TEXT,
  NOTIFICATIONS_BLOCKED_TEXT,
  UPDATE_RECHECK_AFTER_MS,
} from '../SettingsScreen';
import { UPDATE_INSTALL_HINT } from '../../appUpdate/UpdateDialog';
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
  getReminderStatus: jest.fn().mockResolvedValue(null),
  requestNotificationPermission: jest.fn().mockResolvedValue(true),
  openReminderSettings: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../native/backupFiles', () => ({
  ...jest.requireActual('../../../native/backupFiles'),
  pickBackupFile: jest.fn(),
  saveBackupFile: jest.fn(),
}));
let mockPickerProps: Record<string, unknown> = {};
jest.mock('@react-native-community/datetimepicker', () => {
  const { Pressable } = require('react-native');
  const R = require('react');
  return {
    __esModule: true,
    default: (props: {
      onChange: (e: unknown, d: Date) => void;
      [k: string]: unknown;
    }) => {
      mockPickerProps = props;
      return R.createElement(Pressable, {
        testID: 'time-picker',
        onPress: () =>
          props.onChange({ type: 'set' }, new Date(2000, 0, 1, 21, 15)),
      });
    },
  };
});
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
  NativeModules.AppConfig.IS_24_HOUR_CLOCK = false;
  (getReminderStatus as jest.Mock).mockResolvedValue(null);
  (useFocusEffect as jest.Mock).mockImplementation(() => {});
  (useAuth as jest.Mock).mockReturnValue({ signOut, refreshUser });
});
const afterOs: (() => void)[] = [];
afterEach(async () => {
  afterOs.splice(0).forEach(f => f());
  await cleanupClients();
});

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
  expect(await screen.findByText('Signed in as a@b.com')).toBeTruthy();
  expect(screen.getByTestId('interval-preview')).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText(INTERVALS_LABEL),
    '2, 5, 9',
  );
  await fireEvent.press(screen.getByText('Save intervals'));
  await waitFor(() =>
    expect(http.patch).toHaveBeenCalledWith('/v1/me', {
      settings: { intervals: [2, 5, 9] },
    }),
  );
  expect(await screen.findByText(INTERVALS_SAVED_TEXT)).toBeTruthy();
  expect(INTERVALS_SAVED_TEXT).toBe(
    'Intervals saved — new topics will use them',
  );
  // Says that existing topics keep their own schedule.
  expect(screen.getByText(INTERVALS_SCOPE_TEXT)).toBeTruthy();
  expect(INTERVALS_SCOPE_TEXT).toMatch(
    /Existing topics keep their own schedule/,
  );
});

it('invalid intervals show an error after leaving the field and disable save', async () => {
  await renderWithProviders(<SettingsScreen />, setup());
  const field = await screen.findByLabelText(INTERVALS_LABEL);
  await fireEvent.changeText(field, 'a, b');
  expect(screen.queryByTestId('text-field-error')).toBeNull();
  await fireEvent(field, 'blur');
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
  expect(await screen.findByText(ACCOUNT_DELETED_TEXT)).toBeTruthy();
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
    await screen.findByLabelText(INTERVALS_LABEL),
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
    await screen.findByLabelText(INTERVALS_LABEL),
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

it('has the Settings title as its first heading', async () => {
  await renderWithProviders(<SettingsScreen />, setup());
  expect(await screen.findByRole('header', { name: 'Study' })).toBeTruthy();
  const headers = screen.getAllByRole('header');
  expect(headers[0].props.children).toBe('Settings');
});

describe('intervals field', () => {
  it('stays calm while typing and keeps the last good preview', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    afterOs.push(() => os.restore());
    await renderWithProviders(<SettingsScreen />, setup());
    const field = await screen.findByLabelText(INTERVALS_LABEL);
    // A number pad on Android; dots and spaces work as separators.
    expect(field.props.keyboardType).toBe('numeric');
    // On the way to "4, 7, 15": not increasing yet, but no error mid-typing.
    await fireEvent.changeText(field, '4, 7, 1');
    expect(screen.queryByTestId('text-field-error')).toBeNull();
    expect(screen.getByTestId('interval-preview')).toBeTruthy();
    expect(screen.getByText(/Separate the days with commas/)).toBeTruthy();
  });

  it('asks for at least one interval when empty', async () => {
    await renderWithProviders(<SettingsScreen />, setup());
    const field = await screen.findByLabelText(INTERVALS_LABEL);
    await fireEvent.changeText(field, '');
    await fireEvent(field, 'blur');
    expect(screen.getByText(EMPTY_INTERVALS_MESSAGE)).toBeTruthy();
    expect(screen.queryByTestId('interval-preview')).toBeNull();
  });
});

describe('reminders', () => {
  const blocked = {
    notificationsEnabled: false,
    exactAlarmsAllowed: true,
    ignoringBatteryOptimizations: true,
    nextFireAtMillis: null,
  };

  it('turning the reminder on asks for notification permission when blocked', async () => {
    (getReminderStatus as jest.Mock).mockResolvedValue(blocked);
    const http = setup();
    http.get.mockImplementation(async (p: string) =>
      p === '/v1/me'
        ? { ...user, settings: { ...user.settings, dailyReminder: false } }
        : [],
    );
    await renderWithProviders(<SettingsScreen />, http);
    const sw = await screen.findByLabelText('Daily reminder');
    // Off: no warning about blocked notifications.
    await waitFor(() => expect(getReminderStatus).toHaveBeenCalled());
    expect(screen.queryByText(NOTIFICATIONS_BLOCKED_TEXT)).toBeNull();
    await fireEvent(sw, 'valueChange', true);
    await waitFor(() =>
      expect(requestNotificationPermission).toHaveBeenCalled(),
    );
  });

  it('warns while the reminder is on and notifications are blocked', async () => {
    (getReminderStatus as jest.Mock).mockResolvedValue(blocked);
    await renderWithProviders(<SettingsScreen />, setup());
    expect(await screen.findByText(NOTIFICATIONS_BLOCKED_TEXT)).toBeTruthy();
    // Android will not ask again: Fix opens the app's notification settings.
    (requestNotificationPermission as jest.Mock).mockResolvedValueOnce(false);
    await fireEvent.press(screen.getByText('Fix'));
    await waitFor(() =>
      expect(openReminderSettings).toHaveBeenCalledWith('notifications'),
    );
  });

  it('notes a possibly late reminder when exact alarms are off', async () => {
    (getReminderStatus as jest.Mock).mockResolvedValue({
      ...blocked,
      notificationsEnabled: true,
      exactAlarmsAllowed: false,
    });
    await renderWithProviders(<SettingsScreen />, setup());
    expect(await screen.findByText(EXACT_ALARMS_OFF_TEXT)).toBeTruthy();
    expect(screen.queryByText(NOTIFICATIONS_BLOCKED_TEXT)).toBeNull();
    await fireEvent.press(screen.getByText('Allow'));
    expect(openReminderSettings).toHaveBeenCalledWith('exactAlarm');
  });

  it('shows a labelled time in the phone 12-hour format', async () => {
    const http = setup();
    const base = http.patch.getMockImplementation()!;
    let current = {
      ...user,
      settings: { ...user.settings, reminderTime: '20:30' },
    };
    http.get.mockImplementation(async (p: string) =>
      p === '/v1/me' ? current : [],
    );
    http.patch.mockImplementation(async (p: string, body: any) => {
      current = await base(p, body);
      return current;
    });
    await renderWithProviders(<SettingsScreen />, http);
    expect(await screen.findByText('8:30 PM')).toBeTruthy();
    expect(screen.getByText('Remind me at')).toBeTruthy();
    const box = screen.getByRole('button', { name: 'Remind me at' });
    expect(box.props.accessibilityValue).toEqual({ text: '8:30 PM' });
    expect(box.props.accessibilityHint).toBe(
      'Opens a clock to change the time',
    );
    await fireEvent.press(box);
    expect(mockPickerProps.is24Hour).toBeUndefined();
    await fireEvent.press(screen.getByTestId('time-picker'));
    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith('/v1/me', {
        settings: { dailyReminder: true, reminderTime: '21:15' },
      }),
    );
  });

  it('shows a 24-hour time when the phone uses a 24-hour clock', async () => {
    NativeModules.AppConfig.IS_24_HOUR_CLOCK = true;
    await renderWithProviders(<SettingsScreen />, setup());
    expect(await screen.findByText('08:00')).toBeTruthy();
  });
});

describe('delete account', () => {
  it('accepts a trailing space or lower case', async () => {
    await renderWithProviders(<SettingsScreen />, setup());
    await fireEvent.press(await screen.findByText('Delete account'));
    const field = screen.getByLabelText('Type DELETE');
    expect(field.props.autoCorrect).toBe(false);
    await fireEvent.changeText(field, 'DELETE ');
    expect(isDisabled('Delete forever')).toBe(false);
    await fireEvent.changeText(field, 'delete');
    expect(isDisabled('Delete forever')).toBe(false);
    expect(screen.getByText(/mock tests and settings/)).toBeTruthy();
  });

  it('shows a failure inside the dialog, cleared by editing', async () => {
    const http = setup();
    http.del.mockRejectedValue(new ApiError('NETWORK', 0));
    await renderWithProviders(<SettingsScreen />, http);
    await fireEvent.press(await screen.findByText('Delete account'));
    await fireEvent.changeText(screen.getByLabelText('Type DELETE'), 'DELETE');
    await fireEvent.press(screen.getByText('Delete forever'));
    const error = await screen.findByTestId('delete-error');
    expect(error.props.children).toBe(
      "Couldn't delete your account. Can't reach the server — try again",
    );
    // Still open, still signed in.
    expect(screen.getByText('Delete account?')).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Type DELETE'), 'DELETE');
    expect(screen.queryByTestId('delete-error')).toBeNull();
  });

  it('offers to export a backup first', async () => {
    const http = setup();
    const base = http.get.getMockImplementation()!;
    http.get.mockImplementation(async (p: string) =>
      p === '/v1/backup' ? { format: 'x', topics: [] } : base(p),
    );
    (saveBackupFile as jest.Mock).mockResolvedValue(undefined);
    await renderWithProviders(<SettingsScreen />, http);
    await fireEvent.press(await screen.findByText('Delete account'));
    await fireEvent.press(screen.getByText('Export a backup first'));
    await waitFor(() =>
      expect(saveBackupFile).toHaveBeenCalledWith(
        JSON.stringify({ format: 'x', topics: [] }),
      ),
    );
    expect(await screen.findByTestId('delete-note')).toBeTruthy();
    expect(screen.getByText('Delete account?')).toBeTruthy();
    expect(http.del).not.toHaveBeenCalled();
  });
});

describe('update check feedback', () => {
  const latest = {
    latestVersionCode: 5,
    latestVersionName: '4.1.0',
    downloadUrl: 'https://github.com/x/y/releases/latest',
    notes: null,
  };

  it('a failed check says so and drops the old "latest version" line', async () => {
    const http = setup();
    const base = http.get.getMockImplementation()!;
    let fail = false;
    http.get.mockImplementation(async (p: string) => {
      if (p === '/v1/app/version') {
        if (fail) throw new ApiError('NETWORK', 0);
        return latest;
      }
      return base(p);
    });
    await renderWithProviders(<SettingsScreen />, http);
    expect(await screen.findByText('You have the latest version')).toBeTruthy();
    fail = true;
    await fireEvent.press(
      screen.getByRole('button', { name: 'Check for updates' }),
    );
    expect(await screen.findByText(CHECK_FAILED_TEXT)).toBeTruthy();
    expect(screen.queryByText('You have the latest version')).toBeNull();
  });

  it('a check that works confirms it', async () => {
    const http = setup();
    const base = http.get.getMockImplementation()!;
    http.get.mockImplementation(async (p: string) =>
      p === '/v1/app/version' ? latest : base(p),
    );
    await renderWithProviders(<SettingsScreen />, http);
    await screen.findByText('You have the latest version');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Check for updates' }),
    );
    expect(
      await screen.findByText('Checked — you have the latest version'),
    ).toBeTruthy();
  });

  it('checks again on a visit when the last answer is old', async () => {
    const focus = new Set<() => void>();
    (useFocusEffect as jest.Mock).mockImplementation((cb: () => void) => {
      focus.add(cb);
    });
    const http = setup();
    const base = http.get.getMockImplementation()!;
    http.get.mockImplementation(async (p: string) =>
      p === '/v1/app/version' ? latest : base(p),
    );
    const calls = () =>
      http.get.mock.calls.filter(c => c[0] === '/v1/app/version').length;
    await renderWithProviders(<SettingsScreen />, http);
    await screen.findByText('You have the latest version');
    expect(calls()).toBe(1);
    // A visit soon after: no new check.
    await act(async () => focus.forEach(cb => cb()));
    expect(calls()).toBe(1);
    const realNow = Date.now();
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(realNow + UPDATE_RECHECK_AFTER_MS + 1000);
    await act(async () => focus.forEach(cb => cb()));
    await waitFor(() => expect(calls()).toBeGreaterThanOrEqual(2));
    now.mockRestore();
  });

  it('the update row says how to install, like the dialog', async () => {
    const http = setup();
    const base = http.get.getMockImplementation()!;
    http.get.mockImplementation(async (p: string) =>
      p === '/v1/app/version'
        ? { ...latest, latestVersionCode: 6, latestVersionName: '4.2.0' }
        : base(p),
    );
    await renderWithProviders(<SettingsScreen />, http);
    expect(await screen.findByText(UPDATE_INSTALL_HINT)).toBeTruthy();
  });
});
