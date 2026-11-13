import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../../../app';
import { makeTestDeps, signIn, startTestDb } from '../../../test/harness';

describe('exams', () => {
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

  it('creates, lists sorted, updates and deletes', async () => {
    const { app } = build();
    const a = await signIn(app, 'ex-crud');
    const h = bearer(a.accessToken);
    const z = await request(app)
      .post('/v1/exams')
      .set(h)
      .send({ name: 'Zeta', examDate: '2027-01-02' });
    expect(z.status).toBe(201);
    expect(z.body).toEqual({
      id: expect.any(String),
      name: 'Zeta',
      examDate: '2027-01-02',
    });
    const al = await request(app)
      .post('/v1/exams')
      .set(h)
      .send({ name: 'Alpha' });
    expect(al.body.examDate).toBeNull();
    const list = await request(app).get('/v1/exams').set(h);
    expect(list.body.map((e: { name: string }) => e.name)).toEqual([
      'Alpha',
      'Zeta',
    ]);
    const upd = await request(app)
      .patch(`/v1/exams/${z.body.id}`)
      .set(h)
      .send({ examDate: null });
    expect(upd.status).toBe(200);
    expect(upd.body).toEqual({ id: z.body.id, name: 'Zeta', examDate: null });
    const del = await request(app).delete(`/v1/exams/${z.body.id}`).set(h);
    expect(del.status).toBe(204);
    expect((await request(app).get('/v1/exams').set(h)).body).toHaveLength(1);
    expect((await request(app).get('/v1/exams')).status).toBe(401);
  });

  it('rejects near-duplicate names and duplicate renames', async () => {
    const { app } = build();
    const a = await signIn(app, 'ex-dup');
    const h = bearer(a.accessToken);
    expect(
      (await request(app).post('/v1/exams').set(h).send({ name: 'Surgery' }))
        .status,
    ).toBe(201);
    const dup = await request(app)
      .post('/v1/exams')
      .set(h)
      .send({ name: ' surgery ' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_NAME');
    const other = await request(app)
      .post('/v1/exams')
      .set(h)
      .send({ name: 'Med' });
    const ren = await request(app)
      .patch(`/v1/exams/${other.body.id}`)
      .set(h)
      .send({ name: 'SURGERY' });
    expect(ren.status).toBe(409);
    expect(ren.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('allows same name across users and hides other users exams', async () => {
    const { app } = build();
    const a = await signIn(app, 'ex-a');
    const b = await signIn(app, 'ex-b');
    const mine = await request(app)
      .post('/v1/exams')
      .set(bearer(a.accessToken))
      .send({ name: 'Surgery' });
    const theirs = await request(app)
      .post('/v1/exams')
      .set(bearer(b.accessToken))
      .send({ name: 'Surgery' });
    expect(theirs.status).toBe(201);
    const hb = bearer(b.accessToken);
    const patch = await request(app)
      .patch(`/v1/exams/${mine.body.id}`)
      .set(hb)
      .send({ name: 'X' });
    expect(patch.status).toBe(404);
    const del = await request(app).delete(`/v1/exams/${mine.body.id}`).set(hb);
    expect(del.status).toBe(404);
    expect((await request(app).delete('/v1/exams/abc').set(hb)).status).toBe(
      404,
    );
  });

  it('delete pulls the exam id from topics', async () => {
    const { app, deps } = build();
    const a = await signIn(app, 'ex-pull');
    const h = bearer(a.accessToken);
    const e1 = await request(app).post('/v1/exams').set(h).send({ name: 'E1' });
    const e2 = await request(app).post('/v1/exams').set(h).send({ name: 'E2' });
    const db = await deps.getDb();
    const userId = new ObjectId(a.user.id);
    const id1 = new ObjectId(e1.body.id);
    const id2 = new ObjectId(e2.body.id);
    const { insertedId } = await db.collection('topics').insertOne({
      userId,
      subjectId: new ObjectId(),
      examIds: [id1, id2],
      name: 'T',
    });
    await request(app).delete(`/v1/exams/${e1.body.id}`).set(h);
    const topic = await db.collection('topics').findOne({ _id: insertedId });
    expect(topic?.examIds).toEqual([id2]);
  });
});
