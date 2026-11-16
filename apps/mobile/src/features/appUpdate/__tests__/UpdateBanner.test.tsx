import React from 'react';
import { Linking, NativeModules } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '../../../shared/api/errors';
import { refreshOnForeground } from '../../../shared/api/queryClient';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';
import { parseAppVersion } from '../api';
import { DOWNLOAD_FAILED_TEXT, UpdateBanner } from '../UpdateBanner';
import { UPDATE_CHECK_STALE_MS, useUpdateCheck } from '../useUpdateCheck';

const URL = 'https://github.com/x/y/releases/latest';
const release = (code: number, notes: string | null = null) => ({
  latestVersionCode: code,
  latestVersionName: `4.${code - 4}.0`,
  downloadUrl: URL,
  notes,
});

function Harness() {
  const check = useUpdateCheck();
  return <UpdateBanner check={check} />;
}

function httpWith(answer: () => Promise<unknown>) {
  const http = makeHttp();
  http.get.mockImplementation(async (p: string) =>
    p === '/v1/app/version' ? answer() : [],
  );
  return http;
}

/** Lets pending queries and storage reads finish inside act. */
const settle = () =>
  act(() => new Promise<void>(resolve => setTimeout(resolve, 20)));

const versionCalls = (http: ReturnType<typeof makeHttp>) =>
  http.get.mock.calls.filter(c => c[0] === '/v1/app/version').length;

beforeEach(async () => {
  await AsyncStorage.clear();
  NativeModules.AppConfig.VERSION_CODE = 5;
  NativeModules.AppConfig.VERSION_NAME = '4.1.0';
});
afterEach(async () => {
  NativeModules.AppConfig.VERSION_CODE = 5;
  NativeModules.AppConfig.VERSION_NAME = '4.1.0';
  jest.restoreAllMocks();
  await cleanupClients();
});

it('shows the banner with notes when the server has a newer version', async () => {
  const http = httpWith(async () => release(6, 'Faster sync'));
  await renderWithProviders(<Harness />, http);
  expect(await screen.findByText('Version 4.2.0 is available')).toBeTruthy();
  expect(screen.getByText('Faster sync')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();
});

it.each([
  ['the same version', async () => release(5)],
  ['an older version', async () => release(4)],
  [
    'a 404 from an older API',
    async () => {
      throw new ApiError('NOT_FOUND', 404);
    },
  ],
  [
    'a network error',
    async () => {
      throw new ApiError('NETWORK', 0);
    },
  ],
  ['an unexpected body', async () => []],
])('shows nothing for %s', async (_label, answer) => {
  const http = httpWith(answer);
  await renderWithProviders(<Harness />, http);
  await waitFor(() => expect(versionCalls(http)).toBe(1));
  await settle();
  expect(screen.queryByTestId('update-banner')).toBeNull();
  expect(screen.queryByText(/is available/)).toBeNull();
  expect(versionCalls(http)).toBe(1); // no retries
});

it('does not ask the server when the installed version is unknown', async () => {
  delete NativeModules.AppConfig.VERSION_CODE;
  const http = httpWith(async () => release(9));
  await renderWithProviders(<Harness />, http);
  await settle();
  expect(versionCalls(http)).toBe(0);
  expect(screen.queryByTestId('update-banner')).toBeNull();
});

it('Later hides the banner for that version only, across restarts', async () => {
  const http = httpWith(async () => release(6));
  const first = await renderWithProviders(<Harness />, http);
  await fireEvent.press(await screen.findByRole('button', { name: 'Later' }));
  await waitFor(() => expect(screen.queryByTestId('update-banner')).toBeNull());
  expect(await AsyncStorage.getItem('prefs.updateDismissedVersionCode')).toBe(
    '6',
  );
  first.unmount();
  await cleanupClients();

  // Restart, same version on the server: stays hidden.
  await renderWithProviders(<Harness />, http);
  await waitFor(() => expect(versionCalls(http)).toBe(2));
  await settle();
  expect(screen.queryByTestId('update-banner')).toBeNull();
  screen.unmount();
  await cleanupClients();

  // A newer release shows the banner again.
  const newer = httpWith(async () => release(7));
  await renderWithProviders(<Harness />, newer);
  expect(await screen.findByText('Version 4.3.0 is available')).toBeTruthy();
});

it('Download opens the download link', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const http = httpWith(async () => release(6));
  await renderWithProviders(<Harness />, http);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Download' }),
  );
  expect(open).toHaveBeenCalledWith(URL);
  // The banner stays until the update is installed or Later is tapped.
  expect(screen.getByTestId('update-banner')).toBeTruthy();
});

it('says so when the download link cannot be opened', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'));
  const http = httpWith(async () => release(6));
  await renderWithProviders(<Harness />, http);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Download' }),
  );
  expect(await screen.findByText(DOWNLOAD_FAILED_TEXT)).toBeTruthy();
});

it('checks at most every 6 hours, also when returning to the foreground', () => {
  expect(UPDATE_CHECK_STALE_MS).toBe(6 * 60 * 60 * 1000);
  expect(refreshOnForeground({ queryKey: ['appUpdate', 'version'] })).toBe(
    false,
  );
  expect(refreshOnForeground({ queryKey: ['me'] })).toBe(true);
});

describe('parseAppVersion', () => {
  it('accepts a valid body and tidies the notes', () => {
    expect(parseAppVersion({ ...release(6), notes: '  ' })).toEqual(release(6));
    expect(parseAppVersion({ ...release(6), notes: ' Hi ' })?.notes).toBe('Hi');
  });

  it.each([
    null,
    'x',
    { ...release(6), latestVersionCode: '6' },
    { ...release(6), latestVersionCode: 6.5 },
    { ...release(6), latestVersionName: '' },
    { ...release(6), downloadUrl: 'data:text/html,x' },
    { ...release(6), downloadUrl: 'market://details' },
  ])('rejects %p', body => {
    expect(parseAppVersion(body)).toBeNull();
  });
});
