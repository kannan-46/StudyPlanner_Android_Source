import React from 'react';
import { Linking, NativeModules, Text } from 'react-native';
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
import { DOWNLOAD_FAILED_TEXT, UpdateDialog } from '../UpdateDialog';
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
  return <UpdateDialog check={check} />;
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

it('shows a centred dialog with notes when the server has a newer version', async () => {
  const http = httpWith(async () => release(6, 'Faster sync'));
  await renderWithProviders(<Harness />, http);
  expect(await screen.findByText('Update available')).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Update available' })).toBeTruthy();
  expect(screen.getByText('Version 4.2.0 is ready to install.')).toBeTruthy();
  expect(screen.getByText('Faster sync')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();
});

it('holds at 320 dp with a large font scale', async () => {
  const dims = jest.spyOn(require('react-native'), 'useWindowDimensions');
  dims.mockReturnValue({ width: 320, height: 640, scale: 2, fontScale: 2 });
  const http = httpWith(async () => release(6, 'A '.repeat(300)));
  await renderWithProviders(<Harness />, http);
  expect(await screen.findByTestId('update-dialog')).toBeTruthy();
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
  expect(screen.queryByTestId('update-dialog')).toBeNull();
  expect(screen.queryByText('Update available')).toBeNull();
  expect(versionCalls(http)).toBe(1); // no retries
});

it('does not ask the server when the installed version is unknown', async () => {
  delete NativeModules.AppConfig.VERSION_CODE;
  const http = httpWith(async () => release(9));
  await renderWithProviders(<Harness />, http);
  await settle();
  expect(versionCalls(http)).toBe(0);
  expect(screen.queryByTestId('update-dialog')).toBeNull();
});

it('Later hides the dialog for that version only, across restarts', async () => {
  const http = httpWith(async () => release(6));
  const first = await renderWithProviders(<Harness />, http);
  await fireEvent.press(await screen.findByRole('button', { name: 'Later' }));
  await waitFor(() => expect(screen.queryByTestId('update-dialog')).toBeNull());
  expect(await AsyncStorage.getItem('prefs.updateDismissedVersionCode')).toBe(
    '6',
  );
  first.unmount();
  await cleanupClients();

  // Restart, same version on the server: stays hidden.
  await renderWithProviders(<Harness />, http);
  await waitFor(() => expect(versionCalls(http)).toBe(2));
  await settle();
  expect(screen.queryByTestId('update-dialog')).toBeNull();
  screen.unmount();
  await cleanupClients();

  // A newer release shows the dialog again.
  const newer = httpWith(async () => release(7));
  await renderWithProviders(<Harness />, newer);
  expect(
    await screen.findByText('Version 4.3.0 is ready to install.'),
  ).toBeTruthy();
});

it('Back works like Later', async () => {
  const http = httpWith(async () => release(6));
  await renderWithProviders(<Harness />, http);
  // The hardware Back button reaches the Modal as onRequestClose.
  let modal = (await screen.findByTestId('update-dialog')).parent;
  while (modal && modal.type !== 'Modal') modal = modal.parent;
  expect(modal).toBeTruthy();
  await fireEvent(modal!, 'requestClose');
  await waitFor(() => expect(screen.queryByTestId('update-dialog')).toBeNull());
  expect(await AsyncStorage.getItem('prefs.updateDismissedVersionCode')).toBe(
    '6',
  );
});

it('Download opens the link and closes the dialog until the next start', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const http = httpWith(async () => release(6));
  const first = await renderWithProviders(<Harness />, http);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Download' }),
  );
  expect(open).toHaveBeenCalledWith(URL);
  await waitFor(() => expect(screen.queryByTestId('update-dialog')).toBeNull());
  // Not remembered as Later.
  expect(
    await AsyncStorage.getItem('prefs.updateDismissedVersionCode'),
  ).toBeNull();
  first.unmount();
  await cleanupClients();

  // Next start, still not updated: the dialog is back.
  await renderWithProviders(<Harness />, http);
  expect(await screen.findByTestId('update-dialog')).toBeTruthy();
});

it('shows the dialog again after the next check from the server', async () => {
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const http = httpWith(async () => release(6));
  function WithRecheck() {
    const check = useUpdateCheck();
    return (
      <>
        <UpdateDialog check={check} />
        <Text onPress={check.recheck}>recheck</Text>
      </>
    );
  }
  await renderWithProviders(<WithRecheck />, http);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Download' }),
  );
  await waitFor(() => expect(screen.queryByTestId('update-dialog')).toBeNull());
  await settle();
  expect(screen.queryByTestId('update-dialog')).toBeNull();

  await fireEvent.press(screen.getByText('recheck'));
  expect(await screen.findByTestId('update-dialog')).toBeTruthy();
});

it('says so in the dialog when the download link cannot be opened', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'));
  const http = httpWith(async () => release(6));
  await renderWithProviders(<Harness />, http);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Download' }),
  );
  expect(await screen.findByText(DOWNLOAD_FAILED_TEXT)).toBeTruthy();
  expect(screen.getByTestId('update-dialog')).toBeTruthy();
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
