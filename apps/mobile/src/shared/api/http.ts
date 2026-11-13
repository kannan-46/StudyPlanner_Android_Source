import type { ErrorCode } from '@planner/shared';
import { ApiError } from './errors';
import type { Tokens, tokenStore } from './tokenStore';

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
}): Http {
  const { baseUrl, tokens, onSessionEnded } = opts;
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...a) => fetch(...a));

  async function send(
    method: string,
    path: string,
    accessToken: string | undefined,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    try {
      return await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('NETWORK', 0);
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

  // One shared refresh for all concurrent 401s. Reusing a rotated refresh
  // token would be rejected by the API, so only one call may ever be in flight.
  function refreshOnce(): Promise<Tokens> {
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const current = await tokens.get();
          if (!current) throw new ApiError('UNAUTHENTICATED', 401);
          const res = await send('POST', '/v1/auth/refresh', undefined, {
            refreshToken: current.refreshToken,
          });
          if (!res.ok) throw await parseError(res);
          const next = await parseOk<Tokens>(res);
          await tokens.set({
            accessToken: next.accessToken,
            refreshToken: next.refreshToken,
          });
          return next;
        } catch (e) {
          // Transient failures (offline, server trouble) keep the session.
          if (e instanceof ApiError && (e.code === 'NETWORK' || e.status >= 500)) {
            throw e;
          }
          await tokens.clear();
          onSessionEnded();
          throw new ApiError('UNAUTHENTICATED', 401);
        } finally {
          refreshing = null;
        }
      })();
    }
    return refreshing;
  }

  async function request<T>(
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
        let access: string | undefined;
        if (latest && latest.accessToken !== used.accessToken) {
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
