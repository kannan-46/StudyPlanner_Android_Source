import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { PomodoroTimer } from '../PomodoroTimer';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

afterEach(async () => {
  jest.useRealTimers();
  await cleanupClients();
});

describe('PomodoroTimer', () => {
  it('counts down, pauses, and announces the finished session', async () => {
    jest.useFakeTimers({ now: 1_700_000_000_000 });
    await renderWithProviders(<PomodoroTimer />, makeHttp());
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
      screen.getByText('Focus session done — take a 5-minute break'),
    ).toBeOnTheScreen();
    expect(screen.getByText('25:00')).toBeOnTheScreen();
    expect(screen.getByText('Start')).toBeOnTheScreen();
  });
});
