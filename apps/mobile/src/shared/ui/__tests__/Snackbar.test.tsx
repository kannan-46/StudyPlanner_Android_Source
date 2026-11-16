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

it('update replaces its own snackbar and restarts the timer', async () => {
  const { getByText, queryByText } = await setup();
  let id = 0;
  await act(async () => {
    id = api.show({ message: 'Revision 1 done' });
  });
  await act(async () => {
    jest.advanceTimersByTime(4000);
  });
  let ok = false;
  await act(async () => {
    ok = api.update(id, {
      message: 'Revision 1 done',
      actionLabel: 'Undo',
      onAction: () => {},
    });
  });
  expect(ok).toBe(true);
  expect(getByText('Undo')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(4000);
  });
  expect(getByText('Revision 1 done')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(1001);
  });
  expect(queryByText('Revision 1 done')).toBeNull();
});

it('update does nothing once its snackbar timed out (no pop-up again)', async () => {
  const { queryByText, queryByTestId } = await setup();
  let id = 0;
  await act(async () => {
    id = api.show({ message: 'Saving' });
  });
  await act(async () => {
    jest.advanceTimersByTime(6000);
  });
  let ok = true;
  await act(async () => {
    ok = api.update(id, { message: 'Saved' });
  });
  expect(ok).toBe(false);
  expect(queryByText('Saved')).toBeNull();
  expect(queryByTestId('snackbar')).toBeNull();
});

it('update does nothing once another snackbar replaced it', async () => {
  const { getByText, queryByText } = await setup();
  let id = 0;
  await act(async () => {
    id = api.show({ message: 'One' });
  });
  await act(async () => {
    api.show({ message: 'Two' });
  });
  let ok = true;
  await act(async () => {
    ok = api.update(id, { message: 'One again' });
  });
  expect(ok).toBe(false);
  expect(queryByText('One again')).toBeNull();
  expect(getByText('Two')).toBeTruthy();
});
