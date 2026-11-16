import { waitFor } from '@testing-library/react-native';
import {
  createHttp,
  LONG_REQUEST_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
} from '../http';
import {
  ApiError,
  canRetry,
  isSessionEndedError,
  userMessage,
} from '../errors';
import { endSession } from '../session';
import type { Tokens } from '../tokenStore';

function res(status: number, body?: unknown, raw?: string): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () =>
      raw !== undefined ? raw : body === undefined ? '' : JSON.stringify(body),
  } as unknown as Response;
}
const err = (status: number, code: string) =>
  res(status, { error: { code, message: 'm' }, requestId: 'r' });

function makeTokens(initial: Tokens | null) {
  let cur = initial;
  return {
    get: jest.fn(async () => cur),
    set: jest.fn(async (t: Tokens) => {
      cur = t;
    }),
    clear: jest.fn(async () => {
      cur = null;
    }),
  };
}

const base = 'https://api.test/api/server';

describe('http client', () => {
  it('shares one refresh across parallel 401s and retries each', async () => {
    const tokens = makeTokens({ accessToken: 'old', refreshToken: 'r1' });
    let refreshCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>(r => {
      releaseRefresh = r;
    });
    const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/auth/refresh')) {
        refreshCalls++;
        await refreshGate;
        return res(200, { accessToken: 'new', refreshToken: 'r2' });
      }
      const auth = (init.headers as Record<string, string>).Authorization;
      if (auth === 'Bearer old') return err(401, 'TOKEN_EXPIRED');
      return res(200, { path: url });
    });
    const http = createHttp({
      baseUrl: base,
      tokens,
      onSessionEnded: jest.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const pending = Promise.all([
      http.get<{ path: string }>('/v1/a'),
      http.get<{ path: string }>('/v1/b'),
      http.get<{ path: string }>('/v1/c', { x: 1, y: undefined }),
    ]);
    await waitFor(() => expect(refreshCalls).toBe(1));
    releaseRefresh();
    const out = await pending;
    expect(refreshCalls).toBe(1);
    expect(out.map(o => o.path)).toEqual([
      `${base}/v1/a`,
      `${base}/v1/b`,
      `${base}/v1/c?x=1`,
    ]);
    expect(tokens.set).toHaveBeenCalledWith({
      accessToken: 'new',
      refreshToken: 'r2',
    });
  });

  it('ends the session once when refresh fails', async () => {
    const tokens = makeTokens({ accessToken: 'old', refreshToken: 'r1' });
    const onSessionEnded = jest.fn();
    const fetchImpl = jest.fn(async (url: string) =>
      url.endsWith('/v1/auth/refresh')
        ? err(401, 'UNAUTHENTICATED')
        : err(401, 'TOKEN_EXPIRED'),
    );
    const http = createHttp({
      baseUrl: base,
      tokens,
      onSessionEnded,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const results = await Promise.allSettled([
      http.get('/v1/a'),
      http.get('/v1/b'),
    ]);
    for (const r of results) {
      expect(r.status).toBe('rejected');
      expect((r as PromiseRejectedResult).reason).toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    }
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(tokens.clear).toHaveBeenCalled();
    expect(await tokens.get()).toBeNull();
  });

  it('throws NETWORK on fetch failure', async () => {
    const http = createHttp({
      baseUrl: base,
      tokens: makeTokens(null),
      onSessionEnded: jest.fn(),
      fetchImpl: (async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
    });
    await expect(http.get('/v1/a')).rejects.toMatchObject({
      code: 'NETWORK',
      status: 0,
    });
  });

  it('parses error bodies', async () => {
    const http = createHttp({
      baseUrl: base,
      tokens: makeTokens(null),
      onSessionEnded: jest.fn(),
      fetchImpl: (async () =>
        res(409, {
          error: { code: 'DUPLICATE_NAME', message: 'x' },
          requestId: 'r',
        })) as unknown as typeof fetch,
    });
    const e = await http.post('/v1/subjects', {}).catch(x => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({
      code: 'DUPLICATE_NAME',
      status: 409,
      requestId: 'r',
    });
  });

  it('maps non-JSON error bodies to INTERNAL and 204 to undefined', async () => {
    const bad = createHttp({
      baseUrl: base,
      tokens: makeTokens(null),
      onSessionEnded: jest.fn(),
      fetchImpl: (async () =>
        res(502, undefined, '<html>')) as unknown as typeof fetch,
    });
    await expect(bad.get('/v1/a')).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 502,
    });
    const ok = createHttp({
      baseUrl: base,
      tokens: makeTokens(null),
      onSessionEnded: jest.fn(),
      fetchImpl: (async () => res(204)) as unknown as typeof fetch,
    });
    await expect(ok.del('/v1/a')).resolves.toBeUndefined();
  });

  it('never refreshes a 401 from an auth path', async () => {
    const fetchImpl = jest.fn(async () => err(401, 'UNAUTHENTICATED'));
    const onSessionEnded = jest.fn();
    const http = createHttp({
      baseUrl: base,
      tokens: makeTokens({ accessToken: 'a', refreshToken: 'r' }),
      onSessionEnded,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(http.post('/v1/auth/google', {})).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it('userMessage maps constraint texts', () => {
    expect(userMessage(new ApiError('VERSION_CONFLICT', 409))).toBe(
      'This changed on another device — refreshed',
    );
    expect(userMessage(new ApiError('NETWORK', 0))).toBe(
      "Can't reach the server — try again",
    );
    expect(userMessage(new ApiError('REVISION_OUT_OF_ORDER', 409))).toBe(
      'Do the earlier revision first',
    );
    expect(userMessage(new ApiError('NOT_FOUND', 404))).toBe(
      'This has been deleted',
    );
  });

  it('userMessage gives specific, consistent wording for every code', () => {
    const msg = (code: string, status = 400, ctx?: 'topic' | 'mockTest') =>
      userMessage(new ApiError(code as never, status), ctx);
    expect(msg('NOT_FOUND', 404, 'topic')).toBe('This topic has been deleted');
    expect(msg('LIMIT_EXCEEDED', 422, 'topic')).toBe(
      'You can have up to 5,000 topics — delete some to add more',
    );
    expect(msg('LIMIT_EXCEEDED', 422, 'mockTest')).toBe(
      'You can have up to 2,000 mock tests — delete some to add more',
    );
    expect(msg('DUPLICATE_NAME', 409)).toBe(
      'You already have one with that name',
    );
    expect(msg('SUBJECT_IN_USE', 409)).toBe('Move or delete its topics first');
    expect(msg('UNAUTHENTICATED', 401)).toBe(
      'Your session ended — sign in again',
    );
    expect(msg('SERVICE_UNAVAILABLE', 503)).toBe(
      "Can't reach the server — try again",
    );
    // A gateway timeout has no error body: it is a connection problem.
    expect(msg('INTERNAL', 504)).toBe("Can't reach the server — try again");
    expect(msg('INTERNAL', 500)).toBe('Something went wrong — try again');
    expect(userMessage(new Error('x'))).toBe(
      'Something went wrong — try again',
    );
    const codes = [
      'UNAUTHENTICATED',
      'TOKEN_EXPIRED',
      'GOOGLE_TOKEN_INVALID',
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'DUPLICATE_NAME',
      'SUBJECT_IN_USE',
      'REVISION_OUT_OF_ORDER',
      'VERSION_CONFLICT',
      'LIMIT_EXCEEDED',
      'BACKUP_INVALID',
      'RATE_LIMITED',
      'SERVICE_UNAVAILABLE',
      'INTERNAL',
      'NETWORK',
    ];
    for (const code of codes) {
      const text = msg(code);
      // One style: no trailing full stop, never the API's own text.
      expect(text).not.toMatch(/\.$/);
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('canRetry is true only when trying again can help', () => {
    expect(canRetry(new ApiError('NETWORK', 0))).toBe(true);
    expect(canRetry(new ApiError('INTERNAL', 500))).toBe(true);
    expect(canRetry(new ApiError('NOT_FOUND', 404))).toBe(false);
    expect(canRetry(new ApiError('LIMIT_EXCEEDED', 422))).toBe(false);
  });

  describe('timeouts', () => {
    afterEach(() => jest.useRealTimers());

    function stalledFetch() {
      const signals: AbortSignal[] = [];
      const fetchImpl = jest.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_, reject) => {
            const signal = init.signal as AbortSignal;
            signals.push(signal);
            signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
      );
      return { fetchImpl, signals };
    }

    it('fails a stalled request with NETWORK after the timeout', async () => {
      jest.useFakeTimers();
      const { fetchImpl, signals } = stalledFetch();
      const http = createHttp({
        baseUrl: base,
        tokens: makeTokens({ accessToken: 'a', refreshToken: 'r' }),
        onSessionEnded: jest.fn(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      const p = http.post('/v1/topics', { name: 'x' });
      const outcome = p.then(
        () => 'resolved',
        (e: ApiError) => e,
      );
      await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(signals[0].aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      const e = await outcome;
      expect(e).toMatchObject({ code: 'NETWORK' });
      expect(signals[0].aborted).toBe(true);
      expect(userMessage(e)).toBe("Can't reach the server — try again");
    });

    it('still times out when fetch ignores the abort signal', async () => {
      jest.useFakeTimers();
      const fetchImpl = jest.fn(() => new Promise<Response>(() => {}));
      const http = createHttp({
        baseUrl: base,
        tokens: makeTokens({ accessToken: 'a', refreshToken: 'r' }),
        onSessionEnded: jest.fn(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 1000,
      });
      const outcome = http.get('/v1/me').catch((e: ApiError) => e.code);
      await jest.advanceTimersByTimeAsync(1000);
      expect(await outcome).toBe('NETWORK');
    });

    it('gives backup requests the longer timeout', async () => {
      jest.useFakeTimers();
      const { fetchImpl } = stalledFetch();
      const http = createHttp({
        baseUrl: base,
        tokens: makeTokens({ accessToken: 'a', refreshToken: 'r' }),
        onSessionEnded: jest.fn(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      let settled = false;
      const outcome = http.get('/v1/backup').catch((e: ApiError) => {
        settled = true;
        return e.code;
      });
      await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(
        LONG_REQUEST_TIMEOUT_MS - REQUEST_TIMEOUT_MS,
      );
      expect(await outcome).toBe('NETWORK');
    });

    it('a fast answer clears the timer', async () => {
      jest.useFakeTimers();
      const http = createHttp({
        baseUrl: base,
        tokens: makeTokens({ accessToken: 'a', refreshToken: 'r' }),
        onSessionEnded: jest.fn(),
        fetchImpl: (async () => res(200, { ok: 1 })) as unknown as typeof fetch,
      });
      await expect(http.get('/v1/me')).resolves.toEqual({ ok: 1 });
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('after sign-out', () => {
    it('drops a reply that arrives after the session ended', async () => {
      let answer: ((r: Response) => void) | undefined;
      const fetchImpl = jest.fn(
        () =>
          new Promise<Response>(r => {
            answer = r;
          }),
      );
      const http = createHttp({
        baseUrl: base,
        tokens: makeTokens({ accessToken: 'a', refreshToken: 'r' }),
        onSessionEnded: jest.fn(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      const p = http.patch('/v1/me', { settings: {} });
      await waitFor(() => expect(answer).toBeDefined());
      endSession();
      answer?.(res(200, { email: 'old@account' }));
      await expect(p).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
        sessionEnded: true,
      });
      await p.catch(e => expect(isSessionEndedError(e)).toBe(true));
    });

    it('marks a failure that arrives after sign-out as dropped too', async () => {
      let fail: ((e: Error) => void) | undefined;
      const fetchImpl = jest.fn(
        () =>
          new Promise<Response>((_, reject) => {
            fail = reject;
          }),
      );
      const http = createHttp({
        baseUrl: base,
        tokens: makeTokens({ accessToken: 'a', refreshToken: 'r' }),
        onSessionEnded: jest.fn(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      const p = http.post('/v1/topics/t/revisions/r/complete', {});
      await waitFor(() => expect(fail).toBeDefined());
      endSession();
      fail?.(new Error('offline'));
      await expect(p).rejects.toMatchObject({ sessionEnded: true });
    });

    it('does not mark errors of the current session as dropped', async () => {
      const http = createHttp({
        baseUrl: base,
        tokens: makeTokens({ accessToken: 'a', refreshToken: 'r' }),
        onSessionEnded: jest.fn(),
        fetchImpl: (async () =>
          err(404, 'NOT_FOUND')) as unknown as typeof fetch,
      });
      const e = await http.get('/v1/topics/x').catch(x => x);
      expect(e).toBeInstanceOf(ApiError);
      expect(isSessionEndedError(e)).toBe(false);
      expect(isSessionEndedError(new ApiError('UNAUTHENTICATED', 401))).toBe(
        false,
      );
      expect(isSessionEndedError(new Error('x'))).toBe(false);
    });

    it('never stores or clears tokens for a refresh from the old session', async () => {
      const tokens = makeTokens({ accessToken: 'old', refreshToken: 'r1' });
      const onSessionEnded = jest.fn();
      let answerRefresh: ((r: Response) => void) | undefined;
      const fetchImpl = jest.fn((url: string) => {
        if (url.endsWith('/v1/auth/refresh')) {
          return new Promise<Response>(r => {
            answerRefresh = r;
          });
        }
        return Promise.resolve(err(401, 'TOKEN_EXPIRED'));
      });
      const http = createHttp({
        baseUrl: base,
        tokens,
        onSessionEnded,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      const p = http.get('/v1/topics');
      await waitFor(() => expect(answerRefresh).toBeDefined());
      endSession();
      // The next account signs in before the old refresh answers.
      await tokens.set({ accessToken: 'b', refreshToken: 'rb' });
      tokens.set.mockClear();
      answerRefresh?.(err(401, 'UNAUTHENTICATED'));
      await expect(p).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(tokens.set).not.toHaveBeenCalled();
      expect(tokens.clear).not.toHaveBeenCalled();
      expect(onSessionEnded).not.toHaveBeenCalled();
      expect(await tokens.get()).toEqual({
        accessToken: 'b',
        refreshToken: 'rb',
      });
    });

    it('does not store the old account tokens when its refresh succeeds late', async () => {
      const tokens = makeTokens({ accessToken: 'old', refreshToken: 'r1' });
      let answerRefresh: ((r: Response) => void) | undefined;
      const fetchImpl = jest.fn((url: string) => {
        if (url.endsWith('/v1/auth/refresh')) {
          return new Promise<Response>(r => {
            answerRefresh = r;
          });
        }
        return Promise.resolve(err(401, 'TOKEN_EXPIRED'));
      });
      const http = createHttp({
        baseUrl: base,
        tokens,
        onSessionEnded: jest.fn(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      const p = http.get('/v1/topics');
      await waitFor(() => expect(answerRefresh).toBeDefined());
      endSession();
      await tokens.clear();
      answerRefresh?.(res(200, { accessToken: 'a2', refreshToken: 'r2' }));
      await expect(p).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(await tokens.get()).toBeNull();
    });
  });

  it('stays signed in when a refresh response is lost (server retry grace)', async () => {
    // A server that rotates on every refresh and, within its grace window,
    // still accepts a token it just rotated (API sessions.repository rotate).
    const tokens = makeTokens({ accessToken: 'old', refreshToken: 'r0' });
    const onSessionEnded = jest.fn();
    let n = 0;
    const live = new Set(['r0']);
    const rotated = new Set<string>();
    let dropNext = true;
    const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/auth/refresh')) {
        const { refreshToken } = JSON.parse(String(init.body));
        if (!live.has(refreshToken) && !rotated.has(refreshToken)) {
          return err(401, 'UNAUTHENTICATED');
        }
        live.delete(refreshToken);
        rotated.add(refreshToken);
        n++;
        live.add(`r${n}`);
        if (dropNext) {
          dropNext = false;
          throw new TypeError('connection lost');
        }
        return res(200, { accessToken: `t${n}`, refreshToken: `r${n}` });
      }
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer old'
        ? err(401, 'TOKEN_EXPIRED')
        : res(200, { ok: auth });
    });
    const http = createHttp({
      baseUrl: base,
      tokens,
      onSessionEnded,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(http.get('/v1/a')).rejects.toMatchObject({ code: 'NETWORK' });
    await expect(http.get('/v1/a')).resolves.toEqual({ ok: 'Bearer t2' });
    expect(onSessionEnded).not.toHaveBeenCalled();
    expect(await tokens.get()).toEqual({
      accessToken: 't2',
      refreshToken: 'r2',
    });
  });

  it('starts a new refresh for a later expiry after a successful one', async () => {
    const tokens = makeTokens({ accessToken: 'old', refreshToken: 'r0' });
    let refreshCalls = 0;
    const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/auth/refresh')) {
        refreshCalls++;
        return res(200, {
          accessToken: `t${refreshCalls}`,
          refreshToken: `r${refreshCalls}`,
        });
      }
      const auth = (init.headers as Record<string, string>).Authorization;
      // Only the newest access token is valid.
      return auth === `Bearer t${refreshCalls}`
        ? res(200, { ok: true })
        : err(401, 'TOKEN_EXPIRED');
    });
    const http = createHttp({
      baseUrl: base,
      tokens,
      onSessionEnded: jest.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await http.get('/v1/a');
    expect(refreshCalls).toBe(1);
    // t1 expires: server now only accepts a token that does not exist yet.
    fetchImpl.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/auth/refresh')) {
        refreshCalls++;
        return res(200, { accessToken: 't2', refreshToken: 'r2' });
      }
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer t2'
        ? res(200, { ok: true })
        : err(401, 'TOKEN_EXPIRED');
    });
    await http.get('/v1/b');
    expect(refreshCalls).toBe(2);
  });

  it('keeps the session when the refresh fails with a network error or 5xx', async () => {
    for (const failure of ['network', '503'] as const) {
      const tokens = makeTokens({ accessToken: 'old', refreshToken: 'r1' });
      const onSessionEnded = jest.fn();
      const fetchImpl = jest.fn(async (url: string) => {
        if (url.endsWith('/v1/auth/refresh')) {
          if (failure === 'network') throw new TypeError('offline');
          return err(503, 'SERVICE_UNAVAILABLE');
        }
        return err(401, 'TOKEN_EXPIRED');
      });
      const http = createHttp({
        baseUrl: base,
        tokens,
        onSessionEnded,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      await expect(http.get('/v1/a')).rejects.toBeInstanceOf(ApiError);
      expect(onSessionEnded).not.toHaveBeenCalled();
      expect(tokens.clear).not.toHaveBeenCalled();
    }
  });

  it('keeps the session when storing refreshed tokens fails', async () => {
    const tokens = makeTokens({ accessToken: 'old', refreshToken: 'r1' });
    tokens.set.mockRejectedValue(new Error('keychain'));
    const onSessionEnded = jest.fn();
    const fetchImpl = jest.fn(async (url: string) =>
      url.endsWith('/v1/auth/refresh')
        ? res(200, { accessToken: 'n', refreshToken: 'r2' })
        : err(401, 'TOKEN_EXPIRED'),
    );
    const http = createHttp({
      baseUrl: base,
      tokens,
      onSessionEnded,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(http.get('/v1/a')).rejects.toBeInstanceOf(ApiError);
    expect(onSessionEnded).not.toHaveBeenCalled();
    expect(tokens.clear).not.toHaveBeenCalled();
  });

  it('ends the session only once when a 401 arrives after a failed refresh', async () => {
    const tokens = makeTokens({ accessToken: 'old', refreshToken: 'r1' });
    const onSessionEnded = jest.fn();
    let releaseB!: (r: Response) => void;
    let bStarted!: () => void;
    const started = new Promise<void>(r => {
      bStarted = r;
    });
    let sends = 0;
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.endsWith('/v1/auth/refresh')) return err(401, 'UNAUTHENTICATED');
      sends++;
      if (sends === 1) return err(401, 'TOKEN_EXPIRED'); // request A
      bStarted();
      return new Promise<Response>(r => {
        releaseB = r; // request B held until A's refresh has failed
      });
    });
    const http = createHttp({
      baseUrl: base,
      tokens,
      onSessionEnded,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const a = http.get('/v1/a');
    const b = http.get('/v1/b');
    await started;
    await expect(a).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    releaseB(err(401, 'TOKEN_EXPIRED'));
    await expect(b).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(
      fetchImpl.mock.calls.filter(c => String(c[0]).endsWith('/refresh')),
    ).toHaveLength(1);
  });

  it.each([
    [429, 'RATE_LIMITED'],
    [400, 'VALIDATION_FAILED'],
  ])('keeps the session when refresh answers %s', async (status, code) => {
    const tokens = makeTokens({ accessToken: 'old', refreshToken: 'r1' });
    const onSessionEnded = jest.fn();
    const fetchImpl = jest.fn(async (url: string) =>
      url.endsWith('/v1/auth/refresh')
        ? err(status, code)
        : err(401, 'TOKEN_EXPIRED'),
    );
    const http = createHttp({
      baseUrl: base,
      tokens,
      onSessionEnded,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(http.get('/v1/a')).rejects.toMatchObject({ status });
    expect(onSessionEnded).not.toHaveBeenCalled();
    expect(tokens.clear).not.toHaveBeenCalled();
  });

  it('keeps the session when refresh returns 200 with an unparseable body', async () => {
    const tokens = makeTokens({ accessToken: 'old', refreshToken: 'r1' });
    const onSessionEnded = jest.fn();
    const fetchImpl = jest.fn(async (url: string) =>
      url.endsWith('/v1/auth/refresh')
        ? res(200, undefined, '<html>')
        : err(401, 'TOKEN_EXPIRED'),
    );
    const http = createHttp({
      baseUrl: base,
      tokens,
      onSessionEnded,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(http.get('/v1/a')).rejects.toBeInstanceOf(ApiError);
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it('still ends the session when clearing tokens throws', async () => {
    const tokens = makeTokens({ accessToken: 'old', refreshToken: 'r1' });
    tokens.clear.mockRejectedValue(new Error('keychain'));
    const onSessionEnded = jest.fn();
    const fetchImpl = jest.fn(async (url: string) =>
      url.endsWith('/v1/auth/refresh')
        ? err(401, 'UNAUTHENTICATED')
        : err(401, 'TOKEN_EXPIRED'),
    );
    const http = createHttp({
      baseUrl: base,
      tokens,
      onSessionEnded,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(http.get('/v1/a')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });
});
