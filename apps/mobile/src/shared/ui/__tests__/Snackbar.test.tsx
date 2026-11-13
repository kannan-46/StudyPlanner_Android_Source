import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SnackbarProvider, useSnackbar } from '../Snackbar';
import { ThemeProvider } from '../ThemeProvider';

let api: ReturnType<typeof useSnackbar>;
function Grab() {
  api = useSnackbar();
  return null;
}
const setup = async () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider mode="light">
        <SnackbarProvider>
          <Grab />
        </SnackbarProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('action calls onAction and hides', async () => {
  const onAction = jest.fn();
  const { getByText, queryByText } = await setup();
  await act(async () =>
    api.show({ message: 'Done', actionLabel: 'Undo', onAction }),
  );
  expect(getByText('Done')).toBeTruthy();
  await fireEvent.press(getByText('Undo'));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(queryByText('Done')).toBeNull();
});

it('auto-hides after durationMs', async () => {
  const { getByText, queryByText } = await setup();
  await act(async () => api.show({ message: 'Saved', durationMs: 3000 }));
  await act(async () => {
    jest.advanceTimersByTime(2999);
  });
  expect(getByText('Saved')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(2);
  });
  expect(queryByText('Saved')).toBeNull();
});

it('a new snackbar replaces the old one', async () => {
  const { getByText, queryByText } = await setup();
  await act(async () => api.show({ message: 'One' }));
  await act(async () => api.show({ message: 'Two' }));
  expect(queryByText('One')).toBeNull();
  expect(getByText('Two')).toBeTruthy();
});
