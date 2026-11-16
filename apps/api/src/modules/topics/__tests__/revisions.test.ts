import request from 'supertest';
import { createApp } from '../../../app';
import { makeTestDeps, signIn, startTestDb } from '../../../test/harness';

interface Rev {
  id: string;
  dueOn: string;
  doneOn: string | null;
}

describe('revisions', () => {
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
    const topic = await request(ctx.app)
      .post('/v1/topics')
      .set(h)
      .send({
        name: 'Heart',
        subjectId: subject.body.id,
        studiedOn: '2026-11-01',
        intervals: [4, 7, 15, 30],
      });
    const revs = topic.body.revisions as Rev[];
    const base = `/v1/topics/${topic.body.id as string}`;
    return { ...ctx, h, revs, base, topicId: topic.body.id as string };
  }
  const post = (
    app: ReturnType<typeof createApp>,
    h: Record<string, string>,
    url: string,
    body: object = {},
  ) => request(app).post(url).set(h).send(body);

  it('completes late and reschedules the rest', async () => {
    const { app, h, revs, base } = await setup('rv-late');
    const res = await post(
      app,
      h,
      `${base}/revisions/${revs[0]!.id}/complete`,
      { doneOn: '2026-11-12' },
    );
    expect(res.status).toBe(200);
    expect(res.body.revisions.map((r: Rev) => r.dueOn)).toEqual([
      '2026-11-05',
      '2026-11-15',
      '2026-11-23',
      '2026-12-08',
    ]);
    expect(res.body.revisions[0].doneOn).toBe('2026-11-12');
    expect(res.body.nextDueOn).toBe('2026-11-15');
  });

  it('rejects out-of-order completion', async () => {
    const { app, h, revs, base } = await setup('rv-order');
    const res = await post(
      app,
      h,
      `${base}/revisions/${revs[1]!.id}/complete`,
      { doneOn: '2026-11-12' },
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REVISION_OUT_OF_ORDER');
  });

  it('undoes the latest completion and restores dates', async () => {
    const { app, h, revs, base } = await setup('rv-undo');
    await post(app, h, `${base}/revisions/${revs[0]!.id}/complete`, {
      doneOn: '2026-11-12',
    });
    const res = await post(app, h, `${base}/revisions/${revs[0]!.id}/undo`);
    expect(res.status).toBe(200);
    expect(res.body.revisions.map((r: Rev) => r.dueOn)).toEqual(
      revs.map(r => r.dueOn),
    );
    expect(res.body.revisions[0].doneOn).toBeNull();
  });

  it('redoes an undone revision with its original past date', async () => {
    const { app, h, revs, base } = await setup('rv-redo');
    const done = await post(
      app,
      h,
      `${base}/revisions/${revs[0]!.id}/complete`,
      { doneOn: '2026-11-03' },
    );
    expect(done.status).toBe(200);
    await post(app, h, `${base}/revisions/${revs[1]!.id}/complete`, {
      doneOn: '2026-11-06',
    });
    const afterR2 = (await request(app).get(base).set(h)).body
      .revisions as Rev[];
    // Undo R2 by mistake, then put it back with the date it was done on
    // (in the past, but not before R1's done date).
    await post(app, h, `${base}/revisions/${revs[1]!.id}/undo`);
    const redo = await post(
      app,
      h,
      `${base}/revisions/${revs[1]!.id}/complete`,
      { doneOn: '2026-11-06' },
    );
    expect(redo.status).toBe(200);
    expect(redo.body.revisions).toEqual(afterR2);
    // Still never before the previous revision's done date.
    await post(app, h, `${base}/revisions/${revs[1]!.id}/undo`);
    const tooEarly = await post(
      app,
      h,
      `${base}/revisions/${revs[1]!.id}/complete`,
      { doneOn: '2026-11-02' },
    );
    expect(tooEarly.status).toBe(400);
    expect(tooEarly.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects undo of a non-latest completion', async () => {
    const { app, h, revs, base } = await setup('rv-undo-order');
    await post(app, h, `${base}/revisions/${revs[0]!.id}/complete`, {
      doneOn: '2026-11-05',
    });
    await post(app, h, `${base}/revisions/${revs[1]!.id}/complete`, {
      doneOn: '2026-11-08',
    });
    const res = await post(app, h, `${base}/revisions/${revs[0]!.id}/undo`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REVISION_OUT_OF_ORDER');
  });

  it('snoozes from today and validates days', async () => {
    const { app, h, revs, base } = await setup('rv-snooze');
    const res = await post(app, h, `${base}/revisions/${revs[0]!.id}/snooze`, {
      today: '2026-11-20',
    });
    expect(res.status).toBe(200);
    expect(res.body.revisions[0].dueOn).toBe('2026-11-21');
    const bad = await post(app, h, `${base}/revisions/${revs[0]!.id}/snooze`, {
      today: '2026-11-20',
      days: 31,
    });
    expect(bad.status).toBe(400);
  });

  it('never snoozes a revision that is not due yet to an earlier date', async () => {
    const { app, h, revs, base } = await setup('rv-snooze-early');
    // R1 is due 2026-11-05; snoozing it on 2026-11-02 moves it to 11-06.
    const res = await post(app, h, `${base}/revisions/${revs[0]!.id}/snooze`, {
      today: '2026-11-02',
      days: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.revisions[0].dueOn).toBe('2026-11-06');
  });

  it('completes the topic when every revision is done', async () => {
    const { app, h, revs, base } = await setup('rv-all');
    let last;
    for (const [i, r] of revs.entries()) {
      last = await post(app, h, `${base}/revisions/${r.id}/complete`, {
        doneOn: `2026-12-0${i + 1}`,
      });
      expect(last.status).toBe(200);
    }
    expect(last!.body.status).toBe('completed');
    expect(last!.body.nextDueOn).toBeNull();
  });

  it('returns 404 for an unknown revision id', async () => {
    const { app, h, base } = await setup('rv-unknown');
    const res = await post(app, h, `${base}/revisions/deadbeef/complete`, {
      doneOn: '2026-11-12',
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('completes exactly once under concurrent identical requests', async () => {
    const { app, h, revs, base } = await setup('rv-race');
    const url = `${base}/revisions/${revs[0]!.id}/complete`;
    const results = await Promise.all([
      post(app, h, url, { doneOn: '2026-11-05' }),
      post(app, h, url, { doneOn: '2026-11-05' }),
    ]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const got = await request(app).get(base).set(h);
    expect(got.body.revisions[0].doneOn).toBe('2026-11-05');
    expect(got.body.revisions[1].doneOn).toBeNull();
  });

  it("hides another user's topic revisions", async () => {
    const ctx = build();
    const a = await setup('rv-owner', ctx);
    const b = await signIn(ctx.app, 'rv-other');
    const res = await post(
      ctx.app,
      bearer(b.accessToken),
      `${a.base}/revisions/${a.revs[0]!.id}/complete`,
      { doneOn: '2026-11-12' },
    );
    expect(res.status).toBe(404);
    const got = await request(ctx.app).get(a.base).set(a.h);
    expect(got.body.revisions[0].doneOn).toBeNull();
  });
});
