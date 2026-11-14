import type { ThemeMode, ThemePrefs } from '../../shared/lib/localPrefs';
import { createThemeSync } from '../themeSync';

type Deferred = {
  mode: ThemeMode;
  resolve(v: ThemeMode): void;
  reject(e: unknown): void;
};

function setup(initial: ThemePrefs = { mode: null, synced: null }) {
  const sends: Deferred[] = [];
  const deps = {
    apply: jest.fn(),
    persistMode: jest.fn(),
    persistSynced: jest.fn(),
    send: jest.fn(
      (mode: ThemeMode) =>
        new Promise<ThemeMode>((resolve, reject) => {
          sends.push({ mode, resolve, reject });
        }),
    ),
  };
  const sync = createThemeSync(initial, deps);
  return { sync, deps, sends };
}

const flush = () => new Promise<void>(r => setTimeout(() => r(), 0));

it('starts from the saved mode, or System when nothing is saved', () => {
  expect(setup().sync.mode).toBe('system');
  expect(setup({ mode: 'dark', synced: null }).sync.mode).toBe('dark');
});

it('a choice applies and is saved on the phone at once, then sent to the server', async () => {
  const { sync, deps, sends } = setup({ mode: 'dark', synced: 'dark' });
  sync.setAuthStatus('signedIn');
  sync.choose('light');
  expect(deps.apply).toHaveBeenCalledWith('light');
  expect(deps.persistMode).toHaveBeenCalledWith('light');
  expect(sync.mode).toBe('light');
  expect(sends.map(s => s.mode)).toEqual(['light']);
  sends[0].resolve('light');
  await flush();
  expect(deps.persistSynced).toHaveBeenLastCalledWith('light');
});

it('does not send while signed out', () => {
  const { sync, deps } = setup();
  sync.choose('dark');
  expect(deps.apply).toHaveBeenCalledWith('dark');
  expect(deps.send).not.toHaveBeenCalled();
});

it('quick taps end on the last choice, sending one save at a time', async () => {
  const { sync, deps, sends } = setup({ mode: 'system', synced: 'system' });
  sync.setAuthStatus('signedIn');
  sync.choose('light');
  sync.choose('dark');
  expect(sync.mode).toBe('dark');
  expect(sends).toHaveLength(1);
  sends[0].resolve('light');
  await flush();
  // The reply for the first tap does not move the app back to Light.
  expect(sync.mode).toBe('dark');
  expect(deps.apply).toHaveBeenLastCalledWith('dark');
  expect(sends.map(s => s.mode)).toEqual(['light', 'dark']);
  sends[1].resolve('dark');
  await flush();
  expect(deps.persistSynced).toHaveBeenLastCalledWith('dark');
  expect(sends).toHaveLength(2);
});

it('a failed save keeps the choice and retries when the server is next heard from', async () => {
  const { sync, deps, sends } = setup({ mode: 'dark', synced: 'dark' });
  sync.setAuthStatus('signedIn');
  sync.choose('light');
  sends[0].reject(new Error('offline'));
  await flush();
  expect(sync.mode).toBe('light');
  // The server still has the value we last knew: our choice is newer.
  sync.observeServer('dark');
  expect(sync.mode).toBe('light');
  expect(deps.apply).not.toHaveBeenCalledWith('dark');
  expect(sends.map(s => s.mode)).toEqual(['light', 'light']);
});

it('a server reply that arrives while a save is in flight is ignored', () => {
  const { sync, sends } = setup({ mode: 'dark', synced: 'dark' });
  sync.setAuthStatus('signedIn');
  sync.choose('light');
  sync.observeServer('system');
  expect(sync.mode).toBe('light');
  expect(sends).toHaveLength(1);
});

it('the server wins when it changed somewhere else (another device)', () => {
  const { sync, deps } = setup({ mode: 'light', synced: 'light' });
  sync.setAuthStatus('signedIn');
  sync.observeServer('dark');
  expect(sync.mode).toBe('dark');
  expect(deps.apply).toHaveBeenCalledWith('dark');
  expect(deps.persistMode).toHaveBeenCalledWith('dark');
  expect(deps.persistSynced).toHaveBeenCalledWith('dark');
  expect(deps.send).not.toHaveBeenCalled();
});

it('a new install adopts the theme saved on the account', () => {
  const { sync, deps } = setup();
  sync.setAuthStatus('signedIn');
  sync.observeServer('dark');
  expect(sync.mode).toBe('dark');
  expect(deps.send).not.toHaveBeenCalled();
});

it('an unchanged server value with nothing pending does nothing', () => {
  const { sync, deps } = setup({ mode: 'dark', synced: 'dark' });
  sync.setAuthStatus('signedIn');
  sync.observeServer('dark');
  expect(deps.apply).not.toHaveBeenCalled();
  expect(deps.send).not.toHaveBeenCalled();
});

it('signing out forgets the server copy, so the next account’s theme is used', () => {
  const { sync, deps } = setup({ mode: 'dark', synced: 'dark' });
  sync.setAuthStatus('signedIn');
  sync.setAuthStatus('signedOut');
  expect(deps.persistSynced).toHaveBeenCalledWith(null);
  sync.setAuthStatus('signedIn');
  sync.observeServer('dark');
  expect(deps.send).not.toHaveBeenCalled();
  sync.observeServer('light');
  expect(sync.mode).toBe('light');
});
