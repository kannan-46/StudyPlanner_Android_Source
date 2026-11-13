import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../../../app';
import { makeTestDeps, signIn, startTestDb } from '../../../test/harness';
import { createTopicsService } from '../topics.service';

describe('topics', () => {
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
  async function setup(sub: string, ctx = build()) {
    const a = await signIn(ctx.app, sub);
    const h = bearer(a.accessToken);
    const subject = await request(ctx.app)
      .post('/v1/subjects')
      .set(h)
      .send({ name: 'Anatomy' });
    return { ...ctx, a, h, subjectId: subject.body.id as string };
  }

  it('creates with default intervals', async () => {
    const { app, h, subjectId } = await setup('tp-create');
    const res = await request(app)
      .post('/v1/topics')
      .set(h)
      .send({ name: 'Heart', subjectId, studiedOn: '2026-11-13' });
    expect(res.status).toBe(201);
    expect(res.body.revisions).toHaveLength(6);
    expect(res.body.intervals).toEqual([4, 7, 15, 30, 60, 90]);
    expect(res.body.nextDueOn).toBe('2026-11-17');
    expect(res.body.status).toBe('active');
    expect(res.body.revisions[0].doneOn).toBeNull();
    const got = await request(app).get(`/v1/topics/${res.body.id}`).set(h);
    expect(got.status).toBe(200);
    expect(got.body).toEqual(res.body);
  });

  it('creates with custom intervals', async () => {
    const { app, h, subjectId } = await setup('tp-custom');
    const res = await request(app)
      .post('/v1/topics')
      .set(h)
      .send({
        name: 'Lung',
        subjectId,
        studiedOn: '2026-01-01',
        intervals: [4, 7, 15, 30],
      });
    expect(res.status).toBe(201);
    expect(res.body.revisions.map((r: { dueOn: string }) => r.dueOn)).toEqual([
      '2026-01-05',
      '2026-01-08',
      '2026-01-16',
      '2026-01-31',
    ]);
  });

  it('allows many topics without legacyId for one user', async () => {
    const { app, h, subjectId } = await setup('tp-many');
    for (const name of ['One', 'Two', 'Three']) {
      const res = await request(app)
        .post('/v1/topics')
        .set(h)
        .send({ name, subjectId, studiedOn: '2026-11-13' });
      expect(res.status).toBe(201);
    }
  });

  it('rejects a foreign subject or exam', async () => {
    const first = await setup('tp-own-a');
    const { app, h } = first;
    const b = await setup('tp-own-b', first);
    const res = await request(app)
      .post('/v1/topics')
      .set(h)
      .send({ name: 'X', subjectId: b.subjectId, studiedOn: '2026-11-13' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0].path).toEqual(['subjectId']);
    const exam = await request(b.app)
      .post('/v1/exams')
      .set(b.h)
      .send({ name: 'E' });
    const mine = await request(app)
      .post('/v1/subjects')
      .set(h)
      .send({ name: 'Mine' });
    const res2 = await request(app)
      .post('/v1/topics')
      .set(h)
      .send({
        name: 'X',
        subjectId: mine.body.id,
        examIds: [exam.body.id],
        studiedOn: '2026-11-13',
      });
    expect(res2.status).toBe(400);
    expect(res2.body.error.details[0].path).toEqual(['examIds']);
  });

  it('filters by subject, exam, q and status', async () => {
    const { app, h, subjectId } = await setup('tp-filter');
    const s2 = await request(app)
      .post('/v1/subjects')
      .set(h)
      .send({ name: 'Physio' });
    const exam = await request(app)
      .post('/v1/exams')
      .set(h)
      .send({ name: 'Finals' });
    const mk = (body: object) =>
      request(app)
        .post('/v1/topics')
        .set(h)
        .send({ studiedOn: '2026-11-13', ...body });
    await mk({ name: 'beta (a', subjectId });
    await mk({ name: 'Alpha', subjectId: s2.body.id, examIds: [exam.body.id] });
    await mk({ name: 'Gamma', subjectId, intervals: [1] });
    const names = (r: { body: { name: string }[] }) => r.body.map(t => t.name);
    const all = await request(app).get('/v1/topics').set(h);
    expect(names(all)).toEqual(['Alpha', 'beta (a', 'Gamma']);
    expect(
      names(
        await request(app).get(`/v1/topics?subjectId=${s2.body.id}`).set(h),
      ),
    ).toEqual(['Alpha']);
    expect(
      names(await request(app).get(`/v1/topics?examId=${exam.body.id}`).set(h)),
    ).toEqual(['Alpha']);
    expect(names(await request(app).get('/v1/topics?q=ALPH').set(h))).toEqual([
      'Alpha',
    ]);
    expect(
      names(await request(app).get('/v1/topics').query({ q: '(a' }).set(h)),
    ).toEqual(['beta (a']);
    expect(
      names(await request(app).get('/v1/topics?status=completed').set(h)),
    ).toEqual([]);
    expect(
      names(await request(app).get('/v1/topics?status=active').set(h)),
    ).toHaveLength(3);
  });

  it('hides topics from other users', async () => {
    const first = await setup('tp-x-a');
    const { app, h, subjectId } = first;
    const b = await setup('tp-x-b', first);
    const t = await request(app)
      .post('/v1/topics')
      .set(h)
      .send({ name: 'Mine', subjectId, studiedOn: '2026-11-13' });
    const url = `/v1/topics/${t.body.id}`;
    expect((await request(app).get(url).set(b.h)).status).toBe(404);
    expect(
      (await request(app).patch(url).set(b.h).send({ notes: 'x' })).status,
    ).toBe(404);
    expect((await request(app).delete(url).set(b.h)).status).toBe(404);
    expect((await request(app).get('/v1/topics').set(b.h)).body).toEqual([]);
    expect((await request(app).get(url).set(h)).status).toBe(200);
  });

  it('returns 404 for malformed ids', async () => {
    const { app, h } = await setup('tp-badid');
    for (const id of ['abc', '123']) {
      const res = await request(app).get(`/v1/topics/${id}`).set(h);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('recomputes pending dates when studiedOn changes', async () => {
    const { app, h, subjectId } = await setup('tp-moved');
    const t = await request(app)
      .post('/v1/topics')
      .set(h)
      .send({ name: 'M', subjectId, studiedOn: '2026-11-13' });
    const res = await request(app)
      .patch(`/v1/topics/${t.body.id}`)
      .set(h)
      .send({ studiedOn: '2026-11-20', name: 'M2' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('M2');
    expect(res.body.nextDueOn).toBe('2026-11-24');
    expect(res.body.revisions).toHaveLength(6);
    expect(res.body.revisions[0].id).toBe(t.body.revisions[0].id);
  });

  async function seedDone(
    deps: ReturnType<typeof build>['deps'],
    id: string,
    dates: string[],
  ) {
    const db = await deps.getDb();
    const set: Record<string, string> = {};
    dates.forEach((d, i) => {
      set[`revisions.${i}.doneOn`] = d;
    });
    await db
      .collection('topics')
      .updateOne({ _id: new ObjectId(id) }, { $set: set });
  }

  it('rejects shrinking intervals below done revisions', async () => {
    const { app, deps, h, subjectId } = await setup('tp-shrink');
    const t = await request(app)
      .post('/v1/topics')
      .set(h)
      .send({ name: 'S', subjectId, studiedOn: '2026-11-13' });
    await seedDone(deps, t.body.id, ['2026-11-17', '2026-11-20', '2026-11-28']);
    const res = await request(app)
      .patch(`/v1/topics/${t.body.id}`)
      .set(h)
      .send({ intervals: [4, 7] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const ok = await request(app)
      .patch(`/v1/topics/${t.body.id}`)
      .set(h)
      .send({ intervals: [4, 7, 15, 20] });
    expect(ok.status).toBe(200);
    expect(ok.body.revisions).toHaveLength(4);
  });

  it('rejects studiedOn later than the earliest doneOn', async () => {
    const { app, deps, h, subjectId } = await setup('tp-mono');
    const t = await request(app)
      .post('/v1/topics')
      .set(h)
      .send({ name: 'S', subjectId, studiedOn: '2026-11-13' });
    await seedDone(deps, t.body.id, ['2026-11-17']);
    const res = await request(app)
      .patch(`/v1/topics/${t.body.id}`)
      .set(h)
      .send({ studiedOn: '2026-11-18' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0].path).toEqual(['studiedOn']);
    const ok = await request(app)
      .patch(`/v1/topics/${t.body.id}`)
      .set(h)
      .send({ studiedOn: '2026-11-17' });
    expect(ok.status).toBe(200);
  });

  it('keeps snoozes when studiedOn and intervals are unchanged', async () => {
    const { app, deps, h, subjectId } = await setup('tp-snooze');
    const t = await request(app)
      .post('/v1/topics')
      .set(h)
      .send({ name: 'Z', subjectId, studiedOn: '2026-11-13' });
    const db = await deps.getDb();
    await db.collection('topics').updateOne(
      { _id: new ObjectId(t.body.id) },
      {
        $set: {
          'revisions.0.dueOverride': '2026-11-25',
          'revisions.0.dueOn': '2026-11-25',
          nextDueOn: '2026-11-25',
        },
      },
    );
    const res = await request(app)
      .patch(`/v1/topics/${t.body.id}`)
      .set(h)
      .send({
        notes: 'n',
        studiedOn: '2026-11-13',
        intervals: [4, 7, 15, 30, 60, 90],
      });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe('n');
    expect(res.body.revisions[0].dueOverride).toBe('2026-11-25');
    expect(res.body.revisions[0].dueOn).toBe('2026-11-25');
  });

  it('deletes a topic', async () => {
    const { app, h, subjectId } = await setup('tp-del');
    const t = await request(app)
      .post('/v1/topics')
      .set(h)
      .send({ name: 'D', subjectId, studiedOn: '2026-11-13' });
    expect(
      (await request(app).delete(`/v1/topics/${t.body.id}`).set(h)).status,
    ).toBe(204);
    expect(
      (await request(app).get(`/v1/topics/${t.body.id}`).set(h)).status,
    ).toBe(404);
  });

  it('enforces the 5000 topic limit', async () => {
    const { app, deps, a, h, subjectId } = await setup('tp-limit');
    const db = await deps.getDb();
    const userId = new ObjectId(a.user.id);
    await db.collection('topics').insertMany(
      Array.from({ length: 5000 }, (_, i) => ({
        userId,
        name: `t${i}`,
        subjectId: new ObjectId(subjectId),
        examIds: [],
      })),
    );
    const res = await request(app)
      .post('/v1/topics')
      .set(h)
      .send({ name: 'One more', subjectId, studiedOn: '2026-11-13' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('LIMIT_EXCEEDED');
  });

  it('mutateWithRetry retries once then reports a conflict', async () => {
    const { app, deps, a, h, subjectId } = await setup('tp-retry');
    const t = await request(app)
      .post('/v1/topics')
      .set(h)
      .send({ name: 'R', subjectId, studiedOn: '2026-11-13' });
    const service = createTopicsService(deps);
    const userId = new ObjectId(a.user.id);
    const db = await deps.getDb();
    const bump = () =>
      db
        .collection('topics')
        .updateOne({ _id: new ObjectId(t.body.id) }, { $inc: { version: 1 } });

    let calls = 0;
    const doc = await service.mutateWithRetry(userId, t.body.id, async () => {
      calls += 1;
      if (calls === 1) await bump();
      return { notes: 'retried' };
    });
    expect(calls).toBe(2);
    expect(doc.notes).toBe('retried');

    let calls2 = 0;
    await expect(
      service.mutateWithRetry(userId, t.body.id, async () => {
        calls2 += 1;
        await bump();
        return { notes: 'never' };
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(calls2).toBe(2);
  });
});
