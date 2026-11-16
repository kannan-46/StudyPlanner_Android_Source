import request from 'supertest';
import { createApp } from '../../../app';
import { makeTestDeps, signIn, startTestDb } from '../../../test/harness';

describe('stats', () => {
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
    const a = await signIn(app, 'st-a');
    const b = await signIn(app, 'st-b');
    const h = bearer(a.accessToken);
    const hb = bearer(b.accessToken);
    const post = (hh: Record<string, string>, url: string, body: object) =>
      request(app).post(url).set(hh).send(body);
    const anat = (await post(h, '/v1/subjects', { name: 'Anatomy' })).body;
    const phys = (await post(h, '/v1/subjects', { name: 'Physio' })).body;
    await post(h, '/v1/subjects', { name: 'Empty' });
    const ex1 = (await post(h, '/v1/exams', { name: 'Final' })).body;
    await post(h, '/v1/exams', { name: 'Aaa' });
    const subjB = (await post(hb, '/v1/subjects', { name: 'Other' })).body;
    const mk = (
      hh: Record<string, string>,
      subjectId: string,
      name: string,
      studiedOn: string,
      extra: object = {},
    ) =>
      post(hh, '/v1/topics', {
        name,
        subjectId,
        studiedOn,
        intervals: [4],
        ...extra,
      });
    await mk(h, anat.id, 'Overdue', '2026-11-01', { intervals: [4, 7] });
    await mk(h, anat.id, 'Today', '2026-11-09', { examIds: [ex1.id] });
    await mk(h, phys.id, 'Upcoming', '2026-11-19');
    await mk(h, phys.id, 'Far', '2026-12-19');
    const done = (await mk(h, anat.id, 'Done', '2026-11-01')).body;
    await post(
      h,
      `/v1/topics/${done.id}/revisions/${done.revisions[0].id}/complete`,
      { doneOn: '2026-11-05' },
    );
    await mk(hb, subjB.id, 'B topic', '2026-11-01');
    return { app, h, anat, phys, ex1 };
  }

  it('returns exact counts, including zero-count subjects and exams', async () => {
    const { app, h, anat, phys, ex1 } = await seed();
    const res = await request(app).get('/v1/stats?today=2026-11-13').set(h);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      topics: 5,
      activeTopics: 4,
      completedTopics: 1,
      revisionsDone: 1,
      revisionsPending: 5,
      overdue: 1,
      dueToday: 1,
    });
    expect(res.body.bySubject).toEqual([
      {
        subjectId: anat.id,
        name: 'Anatomy',
        topicCount: 3,
        revisionsDone: 1,
        revisionsPending: 3,
      },
      expect.objectContaining({
        name: 'Empty',
        topicCount: 0,
        revisionsDone: 0,
        revisionsPending: 0,
      }),
      {
        subjectId: phys.id,
        name: 'Physio',
        topicCount: 2,
        revisionsDone: 0,
        revisionsPending: 2,
      },
    ]);
    expect(res.body.byExam).toEqual([
      expect.objectContaining({ name: 'Aaa', topicCount: 0 }),
      { examId: ex1.id, name: 'Final', topicCount: 1 },
    ]);
  });

  it('rejects a missing today', async () => {
    const { app, h } = await seed();
    const res = await request(app).get('/v1/stats').set(h);
    expect(res.status).toBe(400);
  });
});
