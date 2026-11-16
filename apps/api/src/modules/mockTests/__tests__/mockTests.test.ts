import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../../../app';
import { makeTestDeps, signIn, startTestDb } from '../../../test/harness';

describe('mock tests', () => {
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
  const body = {
    title: 'Full mock 1',
    takenOn: '2026-11-01',
    score: 145,
    maxScore: 200,
  };

  it('creates, lists by takenOn desc, updates and deletes', async () => {
    const { app } = build();
    const a = await signIn(app, 'mt-crud');
    const h = bearer(a.accessToken);
    const c = await request(app).post('/v1/mock-tests').set(h).send(body);
    expect(c.status).toBe(201);
    expect(c.body).toEqual({
      id: expect.any(String),
      title: 'Full mock 1',
      takenOn: '2026-11-01',
      score: 145,
      maxScore: 200,
      percent: 72.5,
      examId: null,
      notes: '',
    });
    await request(app)
      .post('/v1/mock-tests')
      .set(h)
      .send({ ...body, title: 'Later', takenOn: '2026-11-10' });
    const list = await request(app).get('/v1/mock-tests').set(h);
    expect(list.body.map((m: { title: string }) => m.title)).toEqual([
      'Later',
      'Full mock 1',
    ]);
    const u = await request(app)
      .patch(`/v1/mock-tests/${c.body.id}`)
      .set(h)
      .send({ score: 150, notes: 'better' });
    expect(u.status).toBe(200);
    expect(u.body.percent).toBe(75);
    expect(u.body.notes).toBe('better');
    expect(u.body.title).toBe('Full mock 1');
    const d = await request(app).delete(`/v1/mock-tests/${c.body.id}`).set(h);
    expect(d.status).toBe(204);
    expect((await request(app).get('/v1/mock-tests').set(h)).body).toHaveLength(
      1,
    );
    expect((await request(app).get('/v1/mock-tests')).status).toBe(401);
  });

  it('rejects a PATCH pushing score above stored maxScore', async () => {
    const { app } = build();
    const a = await signIn(app, 'mt-score');
    const h = bearer(a.accessToken);
    const c = await request(app).post('/v1/mock-tests').set(h).send(body);
    const res = await request(app)
      .patch(`/v1/mock-tests/${c.body.id}`)
      .set(h)
      .send({ score: 250 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0].path).toEqual(['score']);
  });

  it('validates examId ownership', async () => {
    const { app } = build();
    const a = await signIn(app, 'mt-exam-a');
    const b = await signIn(app, 'mt-exam-b');
    const ex = await request(app)
      .post('/v1/exams')
      .set(bearer(b.accessToken))
      .send({ name: 'Theirs' });
    const mine = await request(app)
      .post('/v1/exams')
      .set(bearer(a.accessToken))
      .send({ name: 'Mine' });
    const h = bearer(a.accessToken);
    const bad = await request(app)
      .post('/v1/mock-tests')
      .set(h)
      .send({ ...body, examId: ex.body.id });
    expect(bad.status).toBe(400);
    const ok = await request(app)
      .post('/v1/mock-tests')
      .set(h)
      .send({ ...body, examId: mine.body.id });
    expect(ok.status).toBe(201);
    expect(ok.body.examId).toBe(mine.body.id);
    const patchBad = await request(app)
      .patch(`/v1/mock-tests/${ok.body.id}`)
      .set(h)
      .send({ examId: ex.body.id });
    expect(patchBad.status).toBe(400);
    const clear = await request(app)
      .patch(`/v1/mock-tests/${ok.body.id}`)
      .set(h)
      .send({ examId: null });
    expect(clear.body.examId).toBeNull();
  });

  it('heals a link to a deleted exam on list and on save', async () => {
    const { app, deps } = build();
    const a = await signIn(app, 'mt-stale');
    const h = bearer(a.accessToken);
    const ok = await request(app).post('/v1/mock-tests').set(h).send(body);
    // Older data: the exam was deleted but the link stayed.
    const gone = new ObjectId();
    const db = await deps.getDb();
    await db
      .collection('mockTests')
      .updateOne({ _id: new ObjectId(ok.body.id) }, { $set: { examId: gone } });
    const list = await request(app).get('/v1/mock-tests').set(h);
    expect(list.body[0].examId).toBeNull();

    // A form that still sends the stale id saves and the link is dropped.
    const stale = await request(app)
      .patch(`/v1/mock-tests/${ok.body.id}`)
      .set(h)
      .send({ score: 150, examId: gone.toHexString() });
    expect(stale.status).toBe(200);
    expect(stale.body.examId).toBeNull();
    expect(stale.body.score).toBe(150);
    const doc = await db
      .collection('mockTests')
      .findOne({ _id: new ObjectId(ok.body.id) });
    expect(doc?.examId).toBeNull();

    // An unknown id that was never stored is still refused.
    const other = await request(app)
      .patch(`/v1/mock-tests/${ok.body.id}`)
      .set(h)
      .send({ examId: new ObjectId().toHexString() });
    expect(other.status).toBe(400);
    expect(other.body.error.details[0].path).toEqual(['examId']);
  });

  it('a save without examId drops a link to a deleted exam', async () => {
    const { app, deps } = build();
    const a = await signIn(app, 'mt-stale-2');
    const h = bearer(a.accessToken);
    const ok = await request(app).post('/v1/mock-tests').set(h).send(body);
    const db = await deps.getDb();
    await db
      .collection('mockTests')
      .updateOne(
        { _id: new ObjectId(ok.body.id) },
        { $set: { examId: new ObjectId() } },
      );
    const res = await request(app)
      .patch(`/v1/mock-tests/${ok.body.id}`)
      .set(h)
      .send({ notes: 'n' });
    expect(res.status).toBe(200);
    expect(res.body.examId).toBeNull();
  });

  it('returns 404 for other users and unknown ids', async () => {
    const { app } = build();
    const a = await signIn(app, 'mt-x-a');
    const b = await signIn(app, 'mt-x-b');
    const c = await request(app)
      .post('/v1/mock-tests')
      .set(bearer(a.accessToken))
      .send(body);
    const hb = bearer(b.accessToken);
    expect(
      (
        await request(app)
          .patch(`/v1/mock-tests/${c.body.id}`)
          .set(hb)
          .send({ notes: 'x' })
      ).status,
    ).toBe(404);
    expect(
      (await request(app).delete(`/v1/mock-tests/${c.body.id}`).set(hb)).status,
    ).toBe(404);
    expect((await request(app).get('/v1/mock-tests').set(hb)).body).toEqual([]);
    expect(
      (await request(app).delete('/v1/mock-tests/not-an-id').set(hb)).status,
    ).toBe(404);
  });

  it('enforces the 2000 mock test limit', async () => {
    const { app, deps } = build();
    const a = await signIn(app, 'mt-limit');
    const db = await deps.getDb();
    await db.collection('mockTests').insertMany(
      Array.from({ length: 2000 }, (_, i) => ({
        userId: new ObjectId(a.user.id),
        title: `m${i}`,
      })),
    );
    const res = await request(app)
      .post('/v1/mock-tests')
      .set(bearer(a.accessToken))
      .send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('LIMIT_EXCEEDED');
  });
});
