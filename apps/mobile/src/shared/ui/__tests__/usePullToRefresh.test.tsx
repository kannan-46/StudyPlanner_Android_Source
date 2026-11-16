import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { ApiError } from '../../api/errors';
import { usePullToRefresh, type RefreshResult } from '../usePullToRefresh';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

afterEach(cleanupClients);

let hook: ReturnType<typeof usePullToRefresh>;
function Probe({
  refetch,
}: {
  refetch: () => Promise<RefreshResult | RefreshResult[]>;
}) {
  hook = usePullToRefresh(refetch);
  return <Text>{hook.refreshing ? 'refreshing' : 'idle'}</Text>;
}

const failed = (data: unknown): RefreshResult => ({
  isError: true,
  error: new ApiError('SERVICE_UNAVAILABLE', 503),
  data,
});

it('says the refresh failed, with Retry, while old data is on screen', async () => {
  const refetch = jest
    .fn()
    .mockResolvedValueOnce(failed([{ id: 1 }]))
    .mockResolvedValueOnce({ isError: false, error: null, data: [{ id: 1 }] });
  await renderWithProviders(<Probe refetch={refetch} />, makeHttp());
  await act(async () => hook.onRefresh());
  expect(screen.getByText('idle')).toBeOnTheScreen();
  expect(
    screen.getByText("Couldn't refresh. Can't reach the server — try again"),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Retry'));
  expect(refetch).toHaveBeenCalledTimes(2);
});

it('stays quiet on success', async () => {
  const refetch = jest
    .fn()
    .mockResolvedValue({ isError: false, error: null, data: [1] });
  await renderWithProviders(<Probe refetch={refetch} />, makeHttp());
  await act(async () => hook.onRefresh());
  expect(screen.queryByTestId('snackbar')).toBeNull();
});

it('leaves an empty or missing list to the screen’s own error view', async () => {
  const refetch = jest
    .fn()
    .mockResolvedValueOnce(failed([]))
    .mockResolvedValueOnce(failed(undefined));
  await renderWithProviders(<Probe refetch={refetch} />, makeHttp());
  await act(async () => hook.onRefresh());
  await act(async () => hook.onRefresh());
  expect(screen.queryByTestId('snackbar')).toBeNull();
});

it('checks every query it refreshed', async () => {
  const refetch = jest
    .fn()
    .mockResolvedValue([
      { isError: false, error: null, data: [1] },
      failed({ items: [] }),
    ]);
  await renderWithProviders(<Probe refetch={refetch} />, makeHttp());
  await act(async () => hook.onRefresh());
  expect(screen.getByText('Retry')).toBeOnTheScreen();
});
