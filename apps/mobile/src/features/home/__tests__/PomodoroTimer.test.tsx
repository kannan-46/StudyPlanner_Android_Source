import React from 'react';
import {
  AppState,
  NativeModules,
  Pressable,
  Text,
  Vibration,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import {
  FOCUS_ALARM_ID,
  FOCUS_DONE_MESSAGE,
  LATE_ALERT_TEXT,
  NO_ALERT_TEXT,
  PAUSED_TEXT,
  PomodoroTimer,
  RESET_MESSAGE,
  endedAtMessage,
} from '../PomodoroTimer';
import { useSnackbar } from '../../../shared/ui/Snackbar';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const KEY = 'prefs.focusTimer';
const schedule = () => NativeModules.Reminders.scheduleOneShot as jest.Mock;
const cancel = () => NativeModules.Reminders.cancelOneShot as jest.Mock;
const cancelAlarm = () =>
  NativeModules.Reminders.cancelOneShotAlarm as jest.Mock;
const requestPermission = () =>
  NativeModules.Reminders.requestNotificationPermission as jest.Mock;
const openSettings = () => NativeModules.Reminders.openSettings as jest.Mock;
const saved = async () => {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(async () => {
  jest.useRealTimers();
  await cleanupClients();
});

const renderTimer = async (extra?: React.ReactElement) => {
  await renderWithProviders(
    <>
      {extra}
      <PomodoroTimer />
    </>,
    makeHttp(),
  );
  // Let the saved-session read settle.
  await act(async () => {});
};

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

/** Sends the app to the background and back, like switching apps. */
const foreground = async () => {
  const listeners = (AppState.addEventListener as jest.Mock).mock.calls
    .filter(c => c[0] === 'change')
    .map(c => c[1] as (s: string) => void);
  await act(async () => {
    listeners.forEach(l => l('background'));
    listeners.forEach(l => l('active'));
  });
};

/** Shows a snackbar with Undo, like a revision marked done. */
function UndoSnackbarButton() {
  const snackbar = useSnackbar();
  return (
    <Pressable
      onPress={() =>
        snackbar.show({
          message: 'Revision 1 done',
          actionLabel: 'Undo',
          onAction: () => {},
        })
      }
    >
      <Text>Mark done</Text>
    </Pressable>
  );
}

describe('PomodoroTimer', () => {
  it('counts down, pauses, and announces the finished session', async () => {
    jest.useFakeTimers({ now: T0 });
    await renderTimer();
    expect(screen.getByText('25:00')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Start'));
    await advance(MIN);
    expect(screen.getByText('24:00')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Pause'));
    expect(screen.getByText('Resume')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Resume'));
    await advance(24 * MIN);
    expect(screen.getByText(FOCUS_DONE_MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByText(/5-minute break/)).toBeNull();
    expect(Vibration.vibrate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('25:00')).toBeOnTheScreen();
    expect(screen.getByText('Start')).toBeOnTheScreen();
  });

  it('schedules an end-of-session alert on start and resume, and cancels it on pause and reset', async () => {
    jest.useFakeTimers({ now: T0 });
    await renderTimer();
    // Nothing was saved, so loading clears nothing.
    expect(cancel()).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Start'));
    expect(schedule()).toHaveBeenLastCalledWith(
      FOCUS_ALARM_ID,
      T0 + 25 * MIN,
      'Focus session done',
      expect.stringMatching(/Nice work/),
    );

    await advance(MIN);
    await fireEvent.press(screen.getByText('Pause'));
    expect(cancel()).toHaveBeenCalledTimes(1);
    expect(cancel()).toHaveBeenLastCalledWith(FOCUS_ALARM_ID);

    await advance(10_000);
    await fireEvent.press(screen.getByText('Resume'));
    expect(schedule()).toHaveBeenCalledTimes(2);
    expect(schedule().mock.calls[1][1]).toBe(T0 + 70_000 + 24 * MIN);

    await fireEvent.press(screen.getByText('Reset'));
    expect(cancel()).toHaveBeenCalledTimes(2);
  });

  it('on an in-app finish cancels the alarm but keeps a notification that just showed', async () => {
    jest.useFakeTimers({ now: T0 });
    await renderTimer();
    await fireEvent.press(screen.getByText('Start'));
    await advance(25 * MIN);
    expect(screen.getByText(FOCUS_DONE_MESSAGE)).toBeOnTheScreen();
    expect(cancelAlarm()).toHaveBeenCalledWith(FOCUS_ALARM_ID);
    expect(cancel()).not.toHaveBeenCalled();
    expect(await saved()).toBeNull();
  });

  it('saves the session while it runs or is paused and clears it when stopped', async () => {
    jest.useFakeTimers({ now: T0 });
    await renderTimer();
    await fireEvent.press(screen.getByText('Start'));
    await act(async () => {});
    expect(await saved()).toMatchObject({
      status: 'running',
      endsAt: T0 + 25 * MIN,
    });
    await advance(MIN);
    await fireEvent.press(screen.getByText('Pause'));
    await act(async () => {});
    expect(await saved()).toEqual({
      status: 'paused',
      endsAt: null,
      remainingMs: 24 * MIN,
    });
    await fireEvent.press(screen.getByText('Reset'));
    await act(async () => {});
    expect(await saved()).toBeNull();
  });

  it('picks up a running session after the app restarts', async () => {
    jest.useFakeTimers({ now: T0 });
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        status: 'running',
        endsAt: T0 + 10 * MIN,
        remainingMs: 0,
      }),
    );
    await renderTimer();
    expect(screen.getByText('10:00')).toBeOnTheScreen();
    expect(screen.getByText('Pause')).toBeOnTheScreen();
    expect(schedule()).toHaveBeenLastCalledWith(
      FOCUS_ALARM_ID,
      T0 + 10 * MIN,
      'Focus session done',
      expect.any(String),
    );
    await advance(MIN);
    expect(screen.getByText('09:00')).toBeOnTheScreen();
  });

  it('picks up a paused session after the app restarts', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ status: 'paused', endsAt: null, remainingMs: 90_000 }),
    );
    await renderTimer();
    expect(screen.getByText('01:30')).toBeOnTheScreen();
    expect(screen.getByText('Resume')).toBeOnTheScreen();
    expect(schedule()).not.toHaveBeenCalled();
  });

  describe('a session that ended while the app was away', () => {
    it('clears quietly when it ended hours ago', async () => {
      jest.useFakeTimers({ now: T0 });
      await AsyncStorage.setItem(
        KEY,
        JSON.stringify({
          status: 'running',
          endsAt: T0 - 9 * 3_600_000,
          remainingMs: 0,
        }),
      );
      await renderTimer();
      expect(screen.getByText('Start')).toBeOnTheScreen();
      expect(screen.queryByText(FOCUS_DONE_MESSAGE)).toBeNull();
      expect(screen.queryByText(/ended at/)).toBeNull();
      expect(Vibration.vibrate).not.toHaveBeenCalled();
      expect(await saved()).toBeNull();
      // Its alarm and old notification are cleared.
      expect(cancel()).toHaveBeenCalledWith(FOCUS_ALARM_ID);
    });

    it('says when it ended, without a buzz, when that was recent', async () => {
      jest.useFakeTimers({ now: T0 });
      const endsAt = T0 - 10 * MIN;
      await AsyncStorage.setItem(
        KEY,
        JSON.stringify({ status: 'running', endsAt, remainingMs: 0 }),
      );
      await renderTimer();
      expect(screen.getByText(endedAtMessage(endsAt))).toBeOnTheScreen();
      expect(screen.queryByText(FOCUS_DONE_MESSAGE)).toBeNull();
      expect(Vibration.vibrate).not.toHaveBeenCalled();
      expect(await saved()).toBeNull();
    });

    it('does not buzz again on a return to the app after the end', async () => {
      jest.useFakeTimers({ now: T0 });
      await renderTimer();
      await fireEvent.press(screen.getByText('Start'));
      // Timers stop in the background: only the clock moves on.
      jest.setSystemTime(T0 + 25 * MIN + 3 * MIN);
      await foreground();
      expect(screen.getByText('Start')).toBeOnTheScreen();
      expect(Vibration.vibrate).not.toHaveBeenCalled();
      expect(screen.getByText(endedAtMessage(T0 + 25 * MIN))).toBeOnTheScreen();
    });
  });

  it('formats the end time from local time in the phone clock style', () => {
    const at = new Date(2026, 10, 16, 21, 40).getTime();
    expect(endedAtMessage(at)).toMatch(
      /^Your focus session ended at (21:40|9:40 PM)$/,
    );
  });

  it('lets the done message wait behind an Undo snackbar', async () => {
    jest.useFakeTimers({ now: T0 });
    await renderTimer(<UndoSnackbarButton />);
    await fireEvent.press(screen.getByText('Start'));
    await advance(25 * MIN - 2_000);
    await fireEvent.press(screen.getByText('Mark done'));
    await advance(2_000);
    expect(Vibration.vibrate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Revision 1 done')).toBeOnTheScreen();
    expect(screen.getByText('Undo')).toBeOnTheScreen();
    expect(screen.queryByText(FOCUS_DONE_MESSAGE)).toBeNull();
    await advance(5_000);
    expect(screen.getByText(FOCUS_DONE_MESSAGE)).toBeOnTheScreen();
  });

  describe('Start and Pause', () => {
    it('ignores a Pause tap that comes right after Start (double-tap)', async () => {
      jest.useFakeTimers({ now: T0 });
      await renderTimer();
      await fireEvent.press(screen.getByText('Start'));
      await fireEvent.press(screen.getByText('Pause'));
      expect(screen.getByText('Pause')).toBeOnTheScreen();
      expect(screen.queryByText(PAUSED_TEXT)).toBeNull();
      expect(schedule()).toHaveBeenCalledTimes(1);
      expect(cancel()).not.toHaveBeenCalled();
    });

    it('shows a paused timer clearly', async () => {
      jest.useFakeTimers({ now: T0 });
      await renderTimer();
      await fireEvent.press(screen.getByText('Start'));
      await advance(1_000);
      await fireEvent.press(screen.getByText('Pause'));
      expect(screen.getByText('Resume')).toBeOnTheScreen();
      expect(screen.getByText(PAUSED_TEXT)).toBeOnTheScreen();
      expect(
        screen.getByLabelText('24:59 remaining, paused'),
      ).toBeOnTheScreen();
      await fireEvent.press(screen.getByText('Resume'));
      expect(screen.queryByText(PAUSED_TEXT)).toBeNull();
      expect(screen.getByLabelText('24:59 remaining')).toBeOnTheScreen();
    });
  });

  describe('Reset', () => {
    it('offers Undo, which brings the session back as it was', async () => {
      jest.useFakeTimers({ now: T0 });
      await renderTimer();
      await fireEvent.press(screen.getByText('Start'));
      await advance(20 * MIN);
      await fireEvent.press(screen.getByText('Reset'));
      expect(screen.getByText('25:00')).toBeOnTheScreen();
      expect(screen.getByText(RESET_MESSAGE)).toBeOnTheScreen();
      await act(async () => {});
      expect(await saved()).toBeNull();
      await fireEvent.press(screen.getByText('Undo'));
      expect(screen.getByText('05:00')).toBeOnTheScreen();
      expect(screen.getByText('Pause')).toBeOnTheScreen();
      expect(schedule()).toHaveBeenLastCalledWith(
        FOCUS_ALARM_ID,
        T0 + 25 * MIN,
        'Focus session done',
        expect.any(String),
      );
      await act(async () => {});
      expect(await saved()).toMatchObject({
        status: 'running',
        endsAt: T0 + 25 * MIN,
      });
    });

    it('brings a paused session back paused', async () => {
      jest.useFakeTimers({ now: T0 });
      await renderTimer();
      await fireEvent.press(screen.getByText('Start'));
      await advance(5 * MIN);
      await fireEvent.press(screen.getByText('Pause'));
      await fireEvent.press(screen.getByText('Reset'));
      await fireEvent.press(screen.getByText('Undo'));
      expect(screen.getByText('20:00')).toBeOnTheScreen();
      expect(screen.getByText('Resume')).toBeOnTheScreen();
    });

    it('resets without a message when the session had barely started', async () => {
      jest.useFakeTimers({ now: T0 });
      await renderTimer();
      await fireEvent.press(screen.getByText('Start'));
      await advance(10_000);
      await fireEvent.press(screen.getByText('Reset'));
      expect(screen.getByText('Start')).toBeOnTheScreen();
      expect(screen.queryByText(RESET_MESSAGE)).toBeNull();
    });
  });

  describe('end alert warnings', () => {
    it('says the alert may be late without exact alarms, and Allow opens that setting', async () => {
      jest.useFakeTimers({ now: T0 });
      schedule().mockResolvedValueOnce({ exact: false, canNotify: true });
      await renderTimer();
      await fireEvent.press(screen.getByText('Start'));
      await act(async () => {});
      expect(screen.getByText(LATE_ALERT_TEXT)).toBeOnTheScreen();
      await fireEvent.press(screen.getByText('Allow'));
      expect(openSettings()).toHaveBeenCalledWith('exactAlarm');
    });

    it('sets the alarm again on return to the app, so granted access counts', async () => {
      jest.useFakeTimers({ now: T0 });
      schedule().mockResolvedValueOnce({ exact: false, canNotify: true });
      await renderTimer();
      await fireEvent.press(screen.getByText('Start'));
      await act(async () => {});
      expect(screen.getByText(LATE_ALERT_TEXT)).toBeOnTheScreen();
      jest.setSystemTime(T0 + MIN);
      await foreground();
      expect(schedule()).toHaveBeenCalledTimes(2);
      expect(schedule().mock.calls[1][1]).toBe(T0 + 25 * MIN);
      expect(screen.queryByText(LATE_ALERT_TEXT)).toBeNull();
    });

    it('warns when notifications are off, and Allow asks for them', async () => {
      jest.useFakeTimers({ now: T0 });
      schedule().mockResolvedValueOnce({ exact: true, canNotify: false });
      await renderTimer();
      await fireEvent.press(screen.getByText('Start'));
      await act(async () => {});
      expect(screen.getByText(NO_ALERT_TEXT)).toBeOnTheScreen();
      await fireEvent.press(screen.getByText('Allow'));
      await act(async () => {});
      expect(requestPermission()).toHaveBeenCalled();
      expect(screen.queryByText(NO_ALERT_TEXT)).toBeNull();
      expect(openSettings()).not.toHaveBeenCalled();
    });

    it('opens notification settings when Android no longer shows the dialog', async () => {
      jest.useFakeTimers({ now: T0 });
      schedule().mockResolvedValue({ exact: true, canNotify: false });
      requestPermission().mockResolvedValueOnce(false);
      try {
        await renderTimer();
        await fireEvent.press(screen.getByText('Start'));
        await act(async () => {});
        await fireEvent.press(screen.getByText('Allow'));
        await act(async () => {});
        expect(openSettings()).toHaveBeenCalledWith('notifications');
        // Later taps go straight to Settings.
        await fireEvent.press(screen.getByText('Allow'));
        await act(async () => {});
        expect(requestPermission()).toHaveBeenCalledTimes(1);
        expect(openSettings()).toHaveBeenCalledTimes(2);
      } finally {
        schedule().mockResolvedValue({ exact: true, canNotify: true });
      }
    });

    it('hides the warning while paused', async () => {
      jest.useFakeTimers({ now: T0 });
      schedule().mockResolvedValueOnce({ exact: false, canNotify: true });
      await renderTimer();
      await fireEvent.press(screen.getByText('Start'));
      await act(async () => {});
      await advance(1_000);
      await fireEvent.press(screen.getByText('Pause'));
      expect(screen.queryByText(LATE_ALERT_TEXT)).toBeNull();
    });
  });

  it('keeps a saved session when reading it is slow', async () => {
    jest.useFakeTimers({ now: T0 });
    const session = {
      status: 'running',
      endsAt: T0 + 10 * MIN,
      remainingMs: 0,
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(session));
    // The storage mock's getItem is already a jest.fn: swap its
    // implementation and put the original back afterwards.
    const getItem = AsyncStorage.getItem as jest.Mock;
    const original = getItem.getMockImplementation()!;
    getItem.mockImplementation((key: string, ...rest: unknown[]) =>
      key === KEY
        ? new Promise(resolve =>
            setTimeout(() => resolve(JSON.stringify(session)), 2_000),
          )
        : original(key, ...rest),
    );
    try {
      await renderTimer();
      await advance(2_500);
      expect(screen.getByText('Start')).toBeOnTheScreen();
    } finally {
      getItem.mockImplementation(original);
    }
    expect(cancel()).not.toHaveBeenCalled();
    expect(cancelAlarm()).not.toHaveBeenCalled();
    expect(await saved()).toEqual(session);
  });

  it('still works when the native reminders module is missing', async () => {
    jest.useFakeTimers({ now: T0 });
    const mod = NativeModules.Reminders;
    NativeModules.Reminders = undefined;
    try {
      await renderTimer();
      await fireEvent.press(screen.getByText('Start'));
      expect(screen.getByText('Pause')).toBeOnTheScreen();
      expect(screen.queryByText('Allow')).toBeNull();
    } finally {
      NativeModules.Reminders = mod;
    }
  });
});
