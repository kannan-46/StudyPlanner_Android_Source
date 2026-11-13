import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../../../app';
import { makeTestDeps, signIn, startTestDb } from '../../../test/harness';

describe('subjects', () => {
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

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  function build() {
    const deps = makeTestDeps({}, uri);
    return { app: createApp(deps), deps };
  }
  const post = (
    app: ReturnType<typeof build>['app'],
    t: string,
    name: string,
  ) => request(app).post('/v1/subjects').set(bearer(t)).send({ name });

  it('creates, lists with topicCount sorted, renames', async () => {
    const { app, deps } = build();
    const a = await signIn(app, 'su-crud');
    const z = await post(app, a.accessToken, 'Zoology');
    expect(z.status).toBe(201);
    expect(z.body).toEqual({
      id: expect.any(String),
      name: 'Zoology',
      topicCount: 0,
    });
    const al = await post(app, a.accessToken, 'Anatomy');
    const db = await deps.getDb();
    const userId = new ObjectId(a.user.id);
    const subjectId = new ObjectId(z.body.id);
    await db.collection('topics').insertMany([
      { userId, subjectId, examIds: [], name: 'a', legacyId: 1 },
      { userId, subjectId, examIds: [], name: 'b', legacyId: 2 },
    ]);
    const h = bearer(a.accessToken);
    const list = await request(app).get('/v1/subjects').set(h);
    expect(list.body).toEqual([
      { id: al.body.id, name: 'Anatomy', topicCount: 0 },
      { id: z.body.id, name: 'Zoology', topicCount: 2 },
    ]);
    const ren = await request(app)
      .patch(`/v1/subjects/${z.body.id}`)
      .set(h)
      .send({ name: 'Zoo' });
    expect(ren.status).toBe(200);
    expect(ren.body).toEqual({ id: z.body.id, name: 'Zoo', topicCount: 2 });
    expect((await request(app).get('/v1/subjects')).status).toBe(401);
  });

  it('rejects near-duplicates and duplicate renames', async () => {
    const { app } = build();
    const a = await signIn(app, 'su-dup');
    await post(app, a.accessToken, 'Surgery');
    const dup = await post(app, a.accessToken, ' surgery ');
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_NAME');
    const o = await post(app, a.accessToken, 'Med');
    const ren = await request(app)
      .patch(`/v1/subjects/${o.body.id}`)
      .set(bearer(a.accessToken))
      .send({ name: 'surgery' });
    expect(ren.status).toBe(409);
    expect(ren.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('same name across users; cross-user access is 404', async () => {
    const { app } = build();
    const a = await signIn(app, 'su-a');
    const b = await signIn(app, 'su-b');
    const mine = await post(app, a.accessToken, 'Surgery');
    expect((await post(app, b.accessToken, 'Surgery')).status).toBe(201);
    const hb = bearer(b.accessToken);
    const patch = await request(app)
      .patch(`/v1/subjects/${mine.body.id}`)
      .set(hb)
      .send({ name: 'X' });
    expect(patch.status).toBe(404);
    const del = await request(app)
      .delete(`/v1/subjects/${mine.body.id}`)
      .set(hb);
    expect(del.status).toBe(404);
  });

  it('delete is 409 SUBJECT_IN_USE until topics are gone', async () => {
    const { app, deps } = build();
    const a = await signIn(app, 'su-del');
    const h = bearer(a.accessToken);
    const s = await post(app, a.accessToken, 'Bio');
    const db = await deps.getDb();
    const { insertedId } = await db.collection('topics').insertOne({
      userId: new ObjectId(a.user.id),
      subjectId: new ObjectId(s.body.id),
      examIds: [],
      name: 'T',
    });
    const blocked = await request(app)
      .delete(`/v1/subjects/${s.body.id}`)
      .set(h);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SUBJECT_IN_USE');
    await db.collection('topics').deleteOne({ _id: insertedId });
    const ok = await request(app).delete(`/v1/subjects/${s.body.id}`).set(h);
    expect(ok.status).toBe(204);
    expect((await request(app).get('/v1/subjects').set(h)).body).toEqual([]);
  });
});
