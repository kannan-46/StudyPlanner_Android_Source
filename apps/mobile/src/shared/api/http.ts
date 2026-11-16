import type { ErrorCode } from '@planner/shared';
import { ApiError } from './errors';
import { currentSession, isCurrentSession } from './session';
import type { Tokens, tokenStore } from './tokenStore';

/**
 * How long a request may take before it fails with the usual "Can't reach the
 * server" error: longer than the server's 10 s limit plus a cold start, so a
 * slow but working server still answers, while a stalled connection (weak
 * mobile data, a network switch) never leaves a spinner running forever.
 */
export const REQUEST_TIMEOUT_MS = 20_000;
/** Backup export and import move much more data. */
export const LONG_REQUEST_TIMEOUT_MS = 60_000;

const isLongRequest = (path: string) => path.startsWith('/v1/backup');

export interface Http {
  get<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  del(path: string): Promise<void>;
}

export function createHttp(opts: {
  baseUrl: string;
  tokens: typeof tokenStore;
  onSessionEnded: () => void;
  fetchImpl?: typeof fetch;
  /** Overrides REQUEST_TIMEOUT_MS (tests). */
  timeoutMs?: number;
  /** Overrides LONG_REQUEST_TIMEOUT_MS (tests). */
  longTimeoutMs?: number;
}): Http {
  const { baseUrl, tokens, onSessionEnded } = opts;
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...a) => fetch(...a));
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const longTimeoutMs = opts.longTimeoutMs ?? LONG_REQUEST_TIMEOUT_MS;

  async function send(
    method: string,
    path: string,
    accessToken: string | undefined,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    // React Native's fetch resolves only once the whole body has arrived, so
    // this timer covers the full response, not just the first byte.
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          controller?.abort();
          reject(new ApiError('NETWORK', 0));
        },
        isLongRequest(path) ? longTimeoutMs : timeoutMs,
      );
    });
    try {
      return await Promise.race([
        doFetch(`${baseUrl}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller?.signal,
        }),
        timedOut,
      ]);
    } catch {
      throw new ApiError('NETWORK', 0);
    } finally {
      clearTimeout(timer);
    }
  }

  async function parseError(res: Response): Promise<ApiError> {
    try {
      const json = JSON.parse(await res.text());
      const code = json?.error?.code as ErrorCode | undefined;
      if (typeof code === 'string') {
        return new ApiError(code, res.status, json.error.message, {
          details: json.error.details,
          requestId: json.requestId,
        });
      }
    } catch {
      // non-JSON body
    }
    return new ApiError('INTERNAL', res.status);
  }

  async function parseOk<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError('INTERNAL', res.status);
    }
  }

  let refreshing: Promise<Tokens> | null = null;
  let refreshingSession = currentSession();
  let refreshRun = 0;

  // One shared refresh for all concurrent 401s. Reusing a rotated refresh
  // token would be rejected by the API, so only one call may ever be in flight.
  function refreshOnce(): Promise<Tokens> {
    if (!refreshing || !isCurrentSession(refreshingSession)) {
      const session = currentSession();
      refreshingSession = session;
      const run = ++refreshRun;
      refreshing = (async () => {
        try {
          const current = await tokens.get();
          if (!current) throw new ApiError('UNAUTHENTICATED', 401);
          const res = await send('POST', '/v1/auth/refresh', undefined, {
            refreshToken: current.refreshToken,
          });
          if (!res.ok) throw await parseError(res);
          const next = await parseOk<Tokens>(res);
          // Signed out meanwhile: never store the old account's tokens again.
          if (!isCurrentSession(session)) {
            throw new ApiError('UNAUTHENTICATED', 401);
          }
          try {
            await tokens.set({
              accessToken: next.accessToken,
              refreshToken: next.refreshToken,
            });
          } catch {
            // Storage failure is not an auth failure: keep the session.
            throw new ApiError('INTERNAL', 500);
          }
          return next;
        } catch (e) {
          // The session already ended on the phone (and the next one may have
          // started): leave its tokens alone.
          if (!isCurrentSession(session)) {
            throw new ApiError('UNAUTHENTICATED', 401);
          }
          // Only an explicit 401 means the refresh token is dead. Everything
          // else (offline, 429, 5xx, bad body) is transient: keep the session.
          if (!(e instanceof ApiError) || e.status !== 401) {
            throw e instanceof ApiError ? e : new ApiError('INTERNAL', 500);
          }
          try {
            await tokens.clear();
          } catch {
            // Storage failure must not stop the session from ending.
          }
          onSessionEnded();
          throw new ApiError('UNAUTHENTICATED', 401);
        } finally {
          // A refresh for a newer session may have replaced this one.
          if (refreshRun === run) refreshing = null;
        }
      })();
    }
    return refreshing;
  }

  /**
   * A reply to a request made before sign-out is dropped: the caller gets an
   * UNAUTHENTICATED error marked sessionEnded instead (see
   * isSessionEndedError), so nothing from the old session reaches the next
   * one and callers know not to show an error for it.
   */
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const session = currentSession();
    const dropped = () =>
      new ApiError('UNAUTHENTICATED', 401, undefined, { sessionEnded: true });
    let out: T;
    try {
      out = await requestOnce<T>(method, path, body);
    } catch (e) {
      if (!isCurrentSession(session)) throw dropped();
      throw e;
    }
    if (!isCurrentSession(session)) throw dropped();
    return out;
  }

  async function requestOnce<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const isAuthPath = path.startsWith('/v1/auth/');
    const used = isAuthPath ? null : await tokens.get();
    let res = await send(method, path, used?.accessToken, body);

    if (res.status === 401 && !isAuthPath) {
      const err = await parseError(res);
      if (err.code === 'TOKEN_EXPIRED' || err.code === 'UNAUTHENTICATED') {
        if (!used) throw err;
        // If another request already rotated the tokens, just retry with them.
        const latest = await tokens.get();
        // Tokens already cleared by a failed refresh: the session has ended.
        if (!latest) throw new ApiError('UNAUTHENTICATED', 401);
        let access: string | undefined;
        if (latest.accessToken !== used.accessToken) {
          access = latest.accessToken;
        } else {
          access = (await refreshOnce()).accessToken;
        }
        res = await send(method, path, access, body);
        if (!res.ok) throw await parseError(res);
        return parseOk<T>(res);
      }
      throw err;
    }

    if (!res.ok) throw await parseError(res);
    return parseOk<T>(res);
  }

  function withQuery(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): string {
    if (!query) return path;
    const parts = Object.entries(query)
      .filter(([, v]) => v !== undefined)
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      );
    return parts.length ? `${path}?${parts.join('&')}` : path;
  }

  return {
    get: (path, query) => request('GET', withQuery(path, query)),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    del: async path => {
      await request<void>('DELETE', path);
    },
  };
}
