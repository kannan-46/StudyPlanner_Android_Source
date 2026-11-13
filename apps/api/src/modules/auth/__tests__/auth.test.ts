import request from 'supertest';
import { type Express } from 'express';
import { DEFAULT_SETTINGS } from '@planner/shared';
import { createApp } from '../../../app';
import type { AppDeps } from '../../../core/deps';
import { requireAuth } from '../../../core/middleware/require-auth';
import { signAccessToken } from '../tokens';
import { makeTestDeps, signIn, startTestDb } from '../../../test/harness';

describe('auth', () => {
  let stop: () => Promise<void>;
  let uri: string;

  beforeAll(async () => {
    const db = await startTestDb();
    stop = db.stop;
    uri = db.uri;
  });
  afterAll(async () => {
    await stop();
  });

  function build(overrides: Partial<AppDeps> = {}): {
    app: Express;
    deps: AppDeps;
  } {
    const deps = makeTestDeps(overrides, uri);
    const app = createApp(deps, a => {
      a.get('/probe', requireAuth(deps), (_req, res) => {
        res.json({ userId: String(res.locals.userId) });
      });
    });
    return { app, deps };
  }

  it('creates a user with defaults on first sign-in', async () => {
    const { app, deps } = build();
    const auth = await signIn(app, 'first');
    expect(auth.accessToken).toEqual(expect.any(String));
    expect(auth.refreshToken).toEqual(expect.any(String));
    expect(auth.user.settings).toEqual(DEFAULT_SETTINGS);
    expect(auth.user.onboardingCompletedAt).toBeNull();
    expect(auth.user.email).toBe('first@test.dev');
    const probe = await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${auth.accessToken}`);
    expect(probe.status).toBe(200);
    expect(probe.body.userId).toBe(auth.user.id);
    const db = await deps.getDb();
    expect(await db.collection('users').countDocuments()).toBe(1);
  });

  it('reuses the user on second sign-in and updates the name', async () => {
    const verifier = jest
      .fn()
      .mockResolvedValueOnce({
        sub: 's1',
        email: 'a@test.dev',
        name: 'Old',
        picture: null,
        emailVerified: true,
      })
      .mockResolvedValueOnce({
        sub: 's1',
        email: 'a@test.dev',
        name: 'New',
        picture: 'http://x/p.png',
        emailVerified: true,
      });
    const { app } = build({ googleVerifier: verifier });
    const a = await signIn(app, 's1');
    const b = await signIn(app, 's1');
    expect(b.user.id).toBe(a.user.id);
    expect(b.user.name).toBe('New');
    expect(b.user.avatarUrl).toBe('http://x/p.png');
  });

  it('returns 401 GOOGLE_TOKEN_INVALID for a bad token', async () => {
    const { app } = build();
    const res = await request(app)
      .post('/v1/auth/google')
      .send({ idToken: 'garbage' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('GOOGLE_TOKEN_INVALID');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const { app } = build();
    const auth = await signIn(app);
    const r1 = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: auth.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toEqual(expect.any(String));
    expect(r1.body.refreshToken).not.toBe(auth.refreshToken);

    const reuse = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: auth.refreshToken });
    expect(reuse.status).toBe(401);

    const after = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: r1.body.refreshToken });
    expect(after.status).toBe(401);
  });

  it('logout revokes the session', async () => {
    const { app } = build();
    const auth = await signIn(app);
    const out = await request(app)
      .post('/v1/auth/logout')
      .send({ refreshToken: auth.refreshToken });
    expect(out.status).toBe(204);
    const res = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: auth.refreshToken });
    expect(res.status).toBe(401);
  });

  it('rejects expired and missing access tokens', async () => {
    const { app, deps } = build();
    const old = await signAccessToken(
      'abc',
      new Date(deps.now().getTime() - 16 * 60 * 1000),
      deps.config.jwtSecret,
    );
    const expired = await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${old}`);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('TOKEN_EXPIRED');
    const none = await request(app).get('/probe');
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe('UNAUTHENTICATED');
    const bad = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer nope');
    expect(bad.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('stores only the token hash', async () => {
    const { app, deps } = build();
    const auth = await signIn(app);
    const db = await deps.getDb();
    const session = await db.collection('sessions').findOne();
    expect(session).not.toBeNull();
    expect(Object.values(session as object)).not.toContain(auth.refreshToken);
    expect(JSON.stringify(session)).not.toContain(auth.refreshToken);
  });

  it('allows exactly one of two concurrent refreshes', async () => {
    const { app } = build();
    const auth = await signIn(app);
    const results = await Promise.all([
      request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: auth.refreshToken }),
      request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: auth.refreshToken }),
    ]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 401)).toHaveLength(1);
  });

  it('rate limits auth routes after 20 requests', async () => {
    const { app } = build();
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await request(app).post('/v1/auth/google').send({})).status;
    }
    expect(last).toBe(429);
  });
});
