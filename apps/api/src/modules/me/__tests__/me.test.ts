import request from 'supertest';
import { ObjectId } from 'mongodb';
import { DEFAULT_SETTINGS, type UserView } from '@planner/shared';
import { createApp } from '../../../app';
import { makeTestDeps, signIn, startTestDb } from '../../../test/harness';

describe('me', () => {
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

  const clock = { t: new Date('2026-11-13T10:00:00Z') };
  function build() {
    const deps = makeTestDeps({ now: () => clock.t }, uri);
    return { app: createApp(deps), deps };
  }
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('GET /v1/me returns the user view and requires auth', async () => {
    const { app } = build();
    const auth = await signIn(app, 'getme');
    const res = await request(app).get('/v1/me').set(bearer(auth.accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(auth.user);
    expect((await request(app).get('/v1/me')).status).toBe(401);
  });

  it('PATCH merges settings field by field and updates name', async () => {
    const { app } = build();
    const auth = await signIn(app, 'patch');
    const res = await request(app)
      .patch('/v1/me')
      .set(bearer(auth.accessToken))
      .send({ name: 'Dr X', settings: { reminderTime: '21:30' } });
    expect(res.status).toBe(200);
    const user = res.body as UserView;
    expect(user.name).toBe('Dr X');
    expect(user.settings).toEqual({
      ...DEFAULT_SETTINGS,
      reminderTime: '21:30',
    });
  });

  it('rejects invalid intervals naming settings.intervals', async () => {
    const { app } = build();
    const auth = await signIn(app, 'badint');
    const res = await request(app)
      .patch('/v1/me')
      .set(bearer(auth.accessToken))
      .send({ settings: { intervals: [7, 4] } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(res.body.error.details)).toContain('intervals');
    expect(res.body.error.details[0].path).toEqual(['settings', 'intervals']);
  });

  it('sets onboardingCompletedAt once and never resets it', async () => {
    const { app } = build();
    const auth = await signIn(app, 'onb');
    const first = await request(app)
      .patch('/v1/me')
      .set(bearer(auth.accessToken))
      .send({ onboardingCompleted: true });
    expect(first.body.onboardingCompletedAt).toBe('2026-11-13T10:00:00.000Z');
    clock.t = new Date('2026-11-13T10:05:00Z');
    const second = await request(app)
      .patch('/v1/me')
      .set(bearer(auth.accessToken))
      .send({ onboardingCompleted: true, name: 'Again' });
    expect(second.status).toBe(200);
    expect(second.body.onboardingCompletedAt).toBe('2026-11-13T10:00:00.000Z');
  });

  it('DELETE removes own data only and invalidates the token', async () => {
    const { app, deps } = build();
    const a = await signIn(app, 'del-a');
    const b = await signIn(app, 'del-b');
    const db = await deps.getDb();
    const collections = ['topics', 'exams', 'subjects', 'mockTests'];
    for (const c of collections) {
      await db.collection(c).insertMany([
        { userId: new ObjectId(a.user.id), n: 1 },
        { userId: new ObjectId(b.user.id), n: 2 },
      ]);
    }
    const res = await request(app).delete('/v1/me').set(bearer(a.accessToken));
    expect(res.status).toBe(204);
    for (const c of collections) {
      expect(
        await db
          .collection(c)
          .countDocuments({ userId: new ObjectId(a.user.id) }),
      ).toBe(0);
      expect(
        await db
          .collection(c)
          .countDocuments({ userId: new ObjectId(b.user.id) }),
      ).toBe(1);
    }
    expect(
      await db
        .collection('sessions')
        .countDocuments({ userId: new ObjectId(a.user.id) }),
    ).toBe(0);
    expect(
      await db
        .collection('sessions')
        .countDocuments({ userId: new ObjectId(b.user.id) }),
    ).toBe(1);
    expect(await db.collection('users').countDocuments()).toBe(1);
    const after = await request(app).get('/v1/me').set(bearer(a.accessToken));
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('UNAUTHENTICATED');
    const stillB = await request(app).get('/v1/me').set(bearer(b.accessToken));
    expect(stillB.status).toBe(200);
  });

  it('concurrent first sign-ins with the same sub yield one user', async () => {
    const { app } = build();
    const [x, y] = await Promise.all([
      signIn(app, 'race'),
      signIn(app, 'race'),
    ]);
    expect(x.user.id).toBe(y.user.id);
  });

  it('concurrent PATCHes to different settings keep both', async () => {
    const { app } = build();
    const auth = await signIn(app, 'conc');
    const h = bearer(auth.accessToken);
    const rs = await Promise.all([
      request(app)
        .patch('/v1/me')
        .set(h)
        .send({ settings: { theme: 'dark' } }),
      request(app)
        .patch('/v1/me')
        .set(h)
        .send({ settings: { reminderTime: '21:30' } }),
    ]);
    expect(rs.map(r => r.status)).toEqual([200, 200]);
    const me = await request(app).get('/v1/me').set(h);
    expect(me.body.settings.theme).toBe('dark');
    expect(me.body.settings.reminderTime).toBe('21:30');
  });

  it('concurrent onboarding PATCHes keep a single timestamp', async () => {
    const { app } = build();
    clock.t = new Date('2026-11-13T10:00:00Z');
    const auth = await signIn(app, 'onbconc');
    const h = bearer(auth.accessToken);
    const rs = await Promise.all([
      request(app).patch('/v1/me').set(h).send({ onboardingCompleted: true }),
      request(app).patch('/v1/me').set(h).send({ onboardingCompleted: true }),
    ]);
    expect(rs.map(r => r.status)).toEqual([200, 200]);
    const ts = rs[0]?.body.onboardingCompletedAt;
    expect(ts).toBe('2026-11-13T10:00:00.000Z');
    expect(rs[1]?.body.onboardingCompletedAt).toBe(ts);
  });
});
