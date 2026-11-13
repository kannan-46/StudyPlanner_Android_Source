import request from 'supertest';
import { createApp } from '../../../app';
import { makeTestDeps, signIn, startTestDb } from '../../../test/harness';

describe('agenda', () => {
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

  async function seed() {
    const app = createApp(makeTestDeps({}, uri));
    const a = await signIn(app, 'ag-a');
    const b = await signIn(app, 'ag-b');
    const h = bearer(a.accessToken);
    const hb = bearer(b.accessToken);
    const subj = await request(app)
      .post('/v1/subjects')
      .set(h)
      .send({ name: 'Anatomy' });
    const subjB = await request(app)
      .post('/v1/subjects')
      .set(hb)
      .send({ name: 'Other' });
    const mk = (
      hh: Record<string, string>,
      subjectId: string,
      name: string,
      studiedOn: string,
      intervals: number[] = [4],
    ) =>
      request(app)
        .post('/v1/topics')
        .set(hh)
        .send({ name, subjectId, studiedOn, intervals });
    const sid = subj.body.id as string;
    await mk(h, sid, 'Overdue', '2026-11-01', [4, 7]);
    await mk(h, sid, 'Today', '2026-11-09');
    await mk(h, sid, 'Upcoming', '2026-11-19');
    await mk(h, sid, 'Far', '2026-12-19');
    const done = await mk(h, sid, 'Done', '2026-11-01');
    await request(app)
      .post(
        `/v1/topics/${done.body.id as string}/revisions/${done.body.revisions[0].id as string}/complete`,
      )
      .set(h)
      .send({ doneOn: '2026-11-05' });
    await mk(hb, subjB.body.id as string, 'B topic', '2026-11-01');
    return { app, h };
  }

  it('returns bucketed items in date order within default 30 days', async () => {
    const { app, h } = await seed();
    const res = await request(app).get('/v1/agenda?today=2026-11-13').set(h);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(
      res.body.items.map((i: { topicName: string }) => i.topicName),
    ).toEqual(['Overdue', 'Today', 'Upcoming']);
    expect(res.body.items.map((i: { bucket: string }) => i.bucket)).toEqual([
      'overdue',
      'today',
      'upcoming',
    ]);
    expect(res.body.items[0]).toMatchObject({
      subjectName: 'Anatomy',
      step: 1,
      totalSteps: 2,
      dueOn: '2026-11-05',
    });
    expect(res.body.items[0].revisionId).toEqual(expect.any(String));
  });

  it('includes the 40-day topic with days=60', async () => {
    const { app, h } = await seed();
    const res = await request(app)
      .get('/v1/agenda?today=2026-11-13&days=60')
      .set(h);
    expect(res.status).toBe(200);
    expect(
      res.body.items.map((i: { topicName: string }) => i.topicName),
    ).toEqual(['Overdue', 'Today', 'Upcoming', 'Far']);
  });

  it('rejects a missing today', async () => {
    const { app, h } = await seed();
    const res = await request(app).get('/v1/agenda').set(h);
    expect(res.status).toBe(400);
  });

  it('requires auth', async () => {
    const { app } = await seed();
    const res = await request(app).get('/v1/agenda?today=2026-11-13');
    expect(res.status).toBe(401);
  });
});
