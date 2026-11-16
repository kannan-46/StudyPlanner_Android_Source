import request from 'supertest';
import { type Express } from 'express';
import { ObjectId } from 'mongodb';
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

  it('rotates refresh tokens; the rotated token works after use', async () => {
    const { app } = build();
    const auth = await signIn(app);
    const r1 = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: auth.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toEqual(expect.any(String));
    expect(r1.body.refreshToken).not.toBe(auth.refreshToken);

    const after = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: r1.body.refreshToken });
    expect(after.status).toBe(200);

    // The first token's replacement was used, so a late retry is refused.
    const reuse = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: auth.refreshToken });
    expect(reuse.status).toBe(401);
  });

  it('keeps the device signed in when a refresh response was lost', async () => {
    let t = new Date('2026-11-13T10:00:00Z').getTime();
    const { app, deps } = build({ now: () => new Date(t) });
    const auth = await signIn(app);
    const lost = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: auth.refreshToken });
    expect(lost.status).toBe(200);
    // The phone never saw `lost`, so it sends the old token again.
    t += 5_000;
    const retry = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: auth.refreshToken });
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(retry.body.refreshToken).not.toBe(lost.body.refreshToken);
    // The pair that never arrived is retired: one live session remains.
    const db = await deps.getDb();
    expect(
      await db.collection('sessions').countDocuments({
        userId: new ObjectId(auth.user.id),
        revokedAt: null,
      }),
    ).toBe(1);
    const next = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: retry.body.refreshToken });
    expect(next.status).toBe(200);
    const probe = await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${retry.body.accessToken}`);
    expect(probe.status).toBe(200);
    expect(probe.body.userId).toBe(auth.user.id);
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

  it('accepts an access token signed 6 days 23 hours ago', async () => {
    const { app, deps } = build();
    const auth = await signIn(app);
    const recent = await signAccessToken(
      auth.user.id,
      new Date(deps.now().getTime() - (7 * 24 - 1) * 60 * 60 * 1000),
      deps.config.jwtSecret,
    );
    const res = await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${recent}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(auth.user.id);
  });

  it('rejects expired and missing access tokens', async () => {
    const { app, deps } = build();
    const old = await signAccessToken(
      'abc',
      new Date(deps.now().getTime() - (7 * 24 * 60 + 1) * 60 * 1000),
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

  it('gives every pair from two concurrent refreshes a clear outcome', async () => {
    const t = new Date('2026-11-13T10:00:00Z').getTime();
    const { app, deps } = build({ now: () => new Date(t) });
    const auth = await signIn(app);
    const results = await Promise.all([
      request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: auth.refreshToken }),
      request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: auth.refreshToken }),
    ]);
    // One wins; the other is refused at once and does not retire the winner.
    const ok = results.filter(r => r.status === 200);
    expect(ok).toHaveLength(1);
    expect(results.filter(r => r.status === 401)).toHaveLength(1);
    const db = await deps.getDb();
    const live = await db.collection('sessions').countDocuments({
      userId: new ObjectId(auth.user.id),
      revokedAt: null,
    });
    expect(live).toBe(1);
    // The pair that was handed out keeps working.
    const next = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: ok[0]?.body.refreshToken });
    expect(next.status).toBe(200);
  });

  describe('refresh reuse', () => {
    let t = new Date('2026-11-13T10:00:00Z').getTime();
    const setup = async () => {
      t = new Date('2026-11-13T10:00:00Z').getTime();
      const { app, deps } = build({ now: () => new Date(t) });
      const a = await signIn(app);
      const b = await signIn(app); // second device, same user
      const rot = await request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: a.refreshToken });
      return { app, deps, a, b, rot };
    };
    const refresh = (app: Express, refreshToken: string) =>
      request(app).post('/v1/auth/refresh').send({ refreshToken });

    it('treats a retry within 60s as a lost response and keeps everyone signed in', async () => {
      const { app, deps, a, b } = await setup();
      t += 59_000;
      const retry = await refresh(app, a.refreshToken);
      expect(retry.status).toBe(200);
      // No revoke-all: both devices still have exactly one live session.
      const db = await deps.getDb();
      expect(
        await db.collection('sessions').countDocuments({ revokedAt: null }),
      ).toBe(2);
      expect((await refresh(app, b.refreshToken)).status).toBe(200);
      expect((await refresh(app, retry.body.refreshToken)).status).toBe(200);
    });

    it('keeps the device signed in after a second lost reply within 60s', async () => {
      const { app, deps, a, b } = await setup();
      t += 5_000;
      const lost2 = await refresh(app, a.refreshToken);
      expect(lost2.status).toBe(200);
      t += 5_000;
      const retry = await refresh(app, a.refreshToken);
      expect(retry.status).toBe(200);
      const db = await deps.getDb();
      expect(
        await db.collection('sessions').countDocuments({ revokedAt: null }),
      ).toBe(2);
      expect((await refresh(app, lost2.body.refreshToken)).status).toBe(401);
      expect((await refresh(app, b.refreshToken)).status).toBe(200);
      expect((await refresh(app, retry.body.refreshToken)).status).toBe(200);
    });

    it('refuses a retry that arrives while the new pair is still on its way', async () => {
      const { app, deps, a, b, rot } = await setup();
      t += 500;
      expect((await refresh(app, a.refreshToken)).status).toBe(401);
      const db = await deps.getDb();
      expect(
        await db.collection('sessions').countDocuments({ revokedAt: null }),
      ).toBe(2);
      // The pair just handed out still works, and so does the other device.
      expect((await refresh(app, rot.body.refreshToken)).status).toBe(200);
      expect((await refresh(app, b.refreshToken)).status).toBe(200);
    });

    it('refuses a retry within 60s once the new token was used, keeping other sessions', async () => {
      const { app, a, b, rot } = await setup();
      const used = await refresh(app, rot.body.refreshToken);
      expect(used.status).toBe(200);
      t += 30_000;
      expect((await refresh(app, a.refreshToken)).status).toBe(401);
      expect((await refresh(app, b.refreshToken)).status).toBe(200);
      expect((await refresh(app, used.body.refreshToken)).status).toBe(200);
    });

    it('revokes every session when reuse happens after 60s', async () => {
      const { app, a, b, rot } = await setup();
      t += 61_000;
      expect((await refresh(app, a.refreshToken)).status).toBe(401);
      expect((await refresh(app, b.refreshToken)).status).toBe(401);
      expect((await refresh(app, rot.body.refreshToken)).status).toBe(401);
    });

    it('rejects refresh when the user no longer exists', async () => {
      const { app, deps, b } = await setup();
      const db = await deps.getDb();
      await db.collection('users').deleteMany({});
      expect((await refresh(app, b.refreshToken)).status).toBe(401);
      const doc = await db.collection('sessions').countDocuments({
        revokedAt: { $ne: null },
      });
      expect(doc).toBeGreaterThanOrEqual(2); // a (rotated) and b (revoked)
    });
  });

  it('rate limits auth routes after 20 requests', async () => {
    const { app } = build();
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await request(app).post('/v1/auth/google').send({})).status;
    }
    expect(last).toBe(429);
  });

  it('does not count refresh/logout against the sign-in limit', async () => {
    const { app } = build();
    for (let i = 0; i < 25; i++) {
      await request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'x'.repeat(20) });
    }
    const res = await request(app).post('/v1/auth/google').send({});
    expect(res.status).not.toBe(429);
  });

  it('rate limits refresh after 300 requests', async () => {
    const { app } = build();
    let last = 0;
    for (let i = 0; i < 301; i++) {
      last = (await request(app).post('/v1/auth/logout').send({})).status;
    }
    expect(last).toBe(429);
  });
});
