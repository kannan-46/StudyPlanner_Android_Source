import { createHttp } from '../http';
import { ApiError, userMessage } from '../errors';
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
    const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/auth/refresh')) {
        refreshCalls++;
        await new Promise<void>(r => setTimeout(r, 10));
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
    const out = await Promise.all([
      http.get<{ path: string }>('/v1/a'),
      http.get<{ path: string }>('/v1/b'),
      http.get<{ path: string }>('/v1/c', { x: 1, y: undefined }),
    ]);
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
    expect(userMessage(new ApiError('NOT_FOUND', 404))).toBe('Not found.');
  });
});
