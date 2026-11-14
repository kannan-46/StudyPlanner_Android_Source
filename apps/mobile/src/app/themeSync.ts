import type { ThemeMode, ThemePrefs } from '../shared/lib/localPrefs';

export type ThemeSyncDeps = {
  /** Shows the mode in the app (React state). */
  apply(mode: ThemeMode): void;
  persistMode(mode: ThemeMode): void;
  persistSynced(mode: ThemeMode | null): void;
  /** Saves the theme on the server; resolves with the server's theme. */
  send(mode: ThemeMode): Promise<ThemeMode>;
};

export type ThemeSync = {
  readonly mode: ThemeMode;
  /** The user picked a theme: apply now, save on the server in the background. */
  choose(mode: ThemeMode): void;
  /** A server copy of the user arrived (sign-in, /v1/me, a save response). */
  observeServer(theme: ThemeMode): void;
  setAuthStatus(status: 'loading' | 'signedIn' | 'signedOut'): void;
};

/**
 * The device is the source of truth for the theme. The server copy only wins
 * when it differs from the last value we know it holds, which means it was
 * changed somewhere else (another device). Saves run one at a time, and a
 * newer choice made during a save is sent after it, so the last tap wins.
 */
export function createThemeSync(
  initial: ThemePrefs,
  deps: ThemeSyncDeps,
): ThemeSync {
  let local: ThemeMode = initial.mode ?? 'system';
  let synced: ThemeMode | null = initial.synced;
  let signedIn = false;
  let inFlight = false;

  const setLocal = (mode: ThemeMode) => {
    if (mode === local) return;
    local = mode;
    deps.apply(mode);
    deps.persistMode(mode);
  };

  const setSynced = (mode: ThemeMode | null) => {
    if (mode === synced) return;
    synced = mode;
    deps.persistSynced(mode);
  };

  async function flush(): Promise<void> {
    if (inFlight || !signedIn || local === synced) return;
    inFlight = true;
    let ok = false;
    try {
      setSynced(await deps.send(local));
      ok = true;
    } catch {
      // Keep the local choice; it is sent again on the next server reply.
    } finally {
      inFlight = false;
    }
    if (ok) await flush();
  }

  return {
    get mode() {
      return local;
    },
    choose(mode) {
      setLocal(mode);
      flush();
    },
    observeServer(theme) {
      // A reply that left before our save landed says nothing new.
      if (inFlight) return;
      if (theme !== synced) {
        setSynced(theme);
        setLocal(theme);
        return;
      }
      flush();
    },
    setAuthStatus(status) {
      signedIn = status === 'signedIn';
      // The next sign-in may be another account: forget what the server held.
      if (status === 'signedOut') setSynced(null);
    },
  };
}
