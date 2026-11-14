import React from 'react';
import { AppState, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { useLocalToday } from '../useLocalToday';

function Probe() {
  return <Text testID="today">{useLocalToday()}</Text>;
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('moves to the new day just after local midnight', async () => {
  jest.useFakeTimers({ now: new Date(2026, 10, 14, 23, 59, 0) });
  await render(<Probe />);
  expect(screen.getByTestId('today')).toHaveTextContent('2026-11-14');
  await act(async () => {
    jest.advanceTimersByTime(30_000);
  });
  expect(screen.getByTestId('today')).toHaveTextContent('2026-11-14');
  await act(async () => {
    jest.advanceTimersByTime(40_000);
  });
  expect(screen.getByTestId('today')).toHaveTextContent('2026-11-15');
});

it('keeps checking when midnight is more than an hour away', async () => {
  jest.useFakeTimers({ now: new Date(2026, 10, 14, 20, 0, 0) });
  await render(<Probe />);
  await act(async () => {
    jest.advanceTimersByTime(4 * 60 * 60 * 1000 + 5_000);
  });
  expect(screen.getByTestId('today')).toHaveTextContent('2026-11-15');
});

it('re-checks the date when the app returns to the foreground', async () => {
  let listener: (s: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _: string,
    l: (s: string) => void,
  ) => {
    listener = l;
    return { remove: jest.fn() };
  }) as never);
  jest.useFakeTimers({ now: new Date(2026, 10, 14, 22, 0, 0) });
  await render(<Probe />);
  await act(async () => {
    listener('background');
  });
  // The phone slept through midnight: no timer ran, the clock moved on.
  jest.setSystemTime(new Date(2026, 10, 15, 7, 30, 0));
  await act(async () => {
    listener('active');
  });
  expect(screen.getByTestId('today')).toHaveTextContent('2026-11-15');
});
