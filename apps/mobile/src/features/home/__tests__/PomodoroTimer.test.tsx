import React from 'react';
import { NativeModules, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { FOCUS_ALARM_ID, PomodoroTimer } from '../PomodoroTimer';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

const T0 = 1_700_000_000_000;
const KEY = 'prefs.focusTimer';
const schedule = () => NativeModules.Reminders.scheduleOneShot as jest.Mock;
const cancel = () => NativeModules.Reminders.cancelOneShot as jest.Mock;
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

const renderTimer = async () => {
  await renderWithProviders(<PomodoroTimer />, makeHttp());
  // Let the saved-session read settle.
  await act(async () => {});
};

describe('PomodoroTimer', () => {
  it('counts down, pauses, and announces the finished session', async () => {
    jest.useFakeTimers({ now: T0 });
    await renderTimer();
    expect(screen.getByText('25:00')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Start'));
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('24:00')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Pause'));
    expect(screen.getByText('Resume')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Resume'));
    await act(async () => {
      jest.advanceTimersByTime(24 * 60_000);
    });
    expect(
      screen.getByText('Focus session done — nice work!'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/5-minute break/)).toBeNull();
    expect(Vibration.vibrate).toHaveBeenCalled();
    expect(screen.getByText('25:00')).toBeOnTheScreen();
    expect(screen.getByText('Start')).toBeOnTheScreen();
  });

  it('schedules an end-of-session alert on start and resume, and cancels it on pause, reset and finish', async () => {
    jest.useFakeTimers({ now: T0 });
    await renderTimer();
    cancel().mockClear();

    await fireEvent.press(screen.getByText('Start'));
    expect(schedule()).toHaveBeenLastCalledWith(
      FOCUS_ALARM_ID,
      T0 + 25 * 60_000,
      'Focus session done',
      expect.stringMatching(/Nice work/),
    );

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await fireEvent.press(screen.getByText('Pause'));
    expect(cancel()).toHaveBeenCalledTimes(1);
    expect(cancel()).toHaveBeenLastCalledWith(FOCUS_ALARM_ID);

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await fireEvent.press(screen.getByText('Resume'));
    expect(schedule()).toHaveBeenCalledTimes(2);
    expect(schedule().mock.calls[1][1]).toBe(T0 + 70_000 + 24 * 60_000);

    await fireEvent.press(screen.getByText('Reset'));
    expect(cancel()).toHaveBeenCalledTimes(2);

    await fireEvent.press(screen.getByText('Start'));
    await act(async () => {
      jest.advanceTimersByTime(25 * 60_000);
    });
    expect(cancel()).toHaveBeenCalledTimes(3);
  });

  it('saves the session while it runs or is paused and clears it when stopped', async () => {
    jest.useFakeTimers({ now: T0 });
    await renderTimer();
    await fireEvent.press(screen.getByText('Start'));
    await act(async () => {});
    expect(await saved()).toMatchObject({
      status: 'running',
      endsAt: T0 + 25 * 60_000,
    });
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await fireEvent.press(screen.getByText('Pause'));
    await act(async () => {});
    expect(await saved()).toEqual({
      status: 'paused',
      endsAt: null,
      remainingMs: 24 * 60_000,
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
        endsAt: T0 + 10 * 60_000,
        remainingMs: 0,
      }),
    );
    await renderTimer();
    expect(screen.getByText('10:00')).toBeOnTheScreen();
    expect(screen.getByText('Pause')).toBeOnTheScreen();
    expect(schedule()).toHaveBeenLastCalledWith(
      FOCUS_ALARM_ID,
      T0 + 10 * 60_000,
      'Focus session done',
      expect.any(String),
    );
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
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

  it('says the session is done when it ended while the app was closed', async () => {
    jest.useFakeTimers({ now: T0 });
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ status: 'running', endsAt: T0 - 1000, remainingMs: 0 }),
    );
    await renderTimer();
    expect(
      screen.getByText('Focus session done — nice work!'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Start')).toBeOnTheScreen();
    expect(await saved()).toBeNull();
  });

  it('still works when the native reminders module is missing', async () => {
    jest.useFakeTimers({ now: T0 });
    const mod = NativeModules.Reminders;
    NativeModules.Reminders = undefined;
    try {
      await renderTimer();
      await fireEvent.press(screen.getByText('Start'));
      expect(screen.getByText('Pause')).toBeOnTheScreen();
    } finally {
      NativeModules.Reminders = mod;
    }
  });
});
