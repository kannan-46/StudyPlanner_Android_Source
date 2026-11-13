import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../app';
import { makeTestDeps, signIn, startTestDb } from '../../../test/harness';

describe('backup', () => {
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
  const build = () => createApp(makeTestDeps({}, uri));

  const legacyFile = {
    topics: [
      {
        id: 'legacy-1',
        name: 'Inguinal hernia',
        exam: 'Both',
        subject: '',
        studyDate: '2026-11-01',
        intervals: [4, 7, 15, 30],
        notes: 'old note',
        revisions: [
          {
            day: 4,
            date: '2026-11-05',
            done: true,
            completedAt: '2026-11-12',
          },
          { day: 7, date: '2026-11-08', done: false },
          { day: 15, date: '2026-11-16', done: false },
          { day: 30, date: '2026-12-01', done: false },
        ],
      },
    ],
    settings: { intervals: [4, 7, 15, 30], time: '07:30', dark: true },
    tests: [
      {
        id: 'mt1',
        exam: 'NEET SS',
        date: '2026-11-02',
        score: 145,
        max: 200,
        note: 'ok',
      },
    ],
  };

  async function importFile(
    app: Express,
    token: string,
    data: unknown,
    mode: 'merge' | 'replace' = 'merge',
  ) {
    return request(app)
      .post('/v1/backup/import')
      .set(bearer(token))
      .send({ mode, data });
  }

  it('imports a legacy file with recomputed schedule and mock tests', async () => {
    const app = build();
    const a = await signIn(app, 'bk-legacy');
    const res = await importFile(app, a.accessToken, legacyFile);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      imported: { exams: 2, subjects: 1, topics: 1, mockTests: 1 },
      skipped: { topics: 0 },
    });
    const h = bearer(a.accessToken);
    const exams = (await request(app).get('/v1/exams').set(h)).body as {
      id: string;
      name: string;
    }[];
    expect(exams.map(e => e.name).sort()).toEqual([
      'MS General Surgery',
      'NEET SS',
    ]);
    const subjects = (await request(app).get('/v1/subjects').set(h)).body;
    expect(subjects.map((s: { name: string }) => s.name)).toEqual(['General']);
    const topics = (await request(app).get('/v1/topics').set(h)).body;
    expect(topics).toHaveLength(1);
    const t = topics[0];
    expect([...t.examIds].sort()).toEqual(exams.map(e => e.id).sort());
    expect(t.subjectId).toBe(subjects[0].id);
    expect(t.studiedOn).toBe('2026-11-01');
    expect(t.notes).toBe('old note');
    expect(t.revisions[0].doneOn).toBe('2026-11-12');
    expect(t.revisions[1].doneOn).toBeNull();
    expect(t.revisions[1].dueOn).toBe('2026-11-15');
    expect(t.nextDueOn).toBe('2026-11-15');

    const mocks = (await request(app).get('/v1/mock-tests').set(h)).body;
    expect(mocks).toEqual([
      expect.objectContaining({
        title: 'NEET SS mock',
        takenOn: '2026-11-02',
        score: 145,
        maxScore: 200,
        percent: 72.5,
        notes: 'ok',
        examId: exams.find(e => e.name === 'NEET SS')?.id,
      }),
    ]);
    const me = (await request(app).get('/v1/me').set(h)).body;
    expect(me.settings).toMatchObject({
      intervals: [4, 7, 15, 30],
      reminderTime: '07:30',
      theme: 'dark',
    });
  });

  it('re-importing the same file with merge skips existing topics', async () => {
    const app = build();
    const a = await signIn(app, 'bk-merge');
    await importFile(app, a.accessToken, legacyFile);
    const res = await importFile(app, a.accessToken, legacyFile);
    expect(res.status).toBe(200);
    expect(res.body.skipped.topics).toBe(1);
    expect(res.body.imported.topics).toBe(0);
    const topics = await request(app)
      .get('/v1/topics')
      .set(bearer(a.accessToken));
    expect(topics.body).toHaveLength(1);
  });

  it('round-trips an exported v1 backup through replace', async () => {
    const app = build();
    const a = await signIn(app, 'bk-round');
    const h = bearer(a.accessToken);
    await importFile(app, a.accessToken, legacyFile);
    const exp = await request(app).get('/v1/backup').set(h);
    expect(exp.status).toBe(200);
    expect(exp.body.format).toBe('studyplanner.backup.v1');
    const before = (await request(app).get('/v1/topics').set(h)).body;
    const mocksBefore = (await request(app).get('/v1/mock-tests').set(h)).body;

    const res = await importFile(app, a.accessToken, exp.body, 'replace');
    expect(res.status).toBe(200);
    expect(res.body.imported).toEqual({
      exams: 2,
      subjects: 1,
      topics: 1,
      mockTests: 1,
    });
    const after = (await request(app).get('/v1/topics').set(h)).body;
    const mocksAfter = (await request(app).get('/v1/mock-tests').set(h)).body;
    const shape = (ts: typeof before) =>
      ts.map(
        (t: {
          name: string;
          studiedOn: string;
          intervals: number[];
          revisions: { doneOn: string | null; dueOn: string }[];
        }) => ({
          name: t.name,
          studiedOn: t.studiedOn,
          intervals: t.intervals,
          revisions: t.revisions.map(r => [r.doneOn, r.dueOn]),
        }),
      );
    expect(shape(after)).toEqual(shape(before));
    const strip = (ms: Record<string, unknown>[]) =>
      ms.map(m => {
        const rest = { ...m };
        delete rest.id;
        delete rest.examId;
        return rest;
      });
    expect(strip(mocksAfter)).toEqual(strip(mocksBefore));

    // A v1 file re-imported with merge is also idempotent.
    const again = await importFile(app, a.accessToken, exp.body, 'merge');
    expect(again.body.skipped.topics).toBe(1);
    expect((await request(app).get('/v1/topics').set(h)).body).toHaveLength(1);
  });

  it('rejects an invalid file with BACKUP_INVALID', async () => {
    const app = build();
    const a = await signIn(app, 'bk-invalid');
    const res = await importFile(app, a.accessToken, { topics: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BACKUP_INVALID');
    expect(res.body.error.details).toBeDefined();
  });

  it('rejects a v1 file referencing an id not in the file', async () => {
    const app = build();
    const a = await signIn(app, 'bk-xref');
    const h = bearer(a.accessToken);
    await importFile(app, a.accessToken, legacyFile);
    const exp = (await request(app).get('/v1/backup').set(h)).body;
    exp.topics[0].subjectId = '0123456789abcdef01234567';
    const res = await importFile(app, a.accessToken, exp);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BACKUP_INVALID');
  });

  it('never touches another user', async () => {
    const app = build();
    const a = await signIn(app, 'bk-iso-a');
    const b = await signIn(app, 'bk-iso-b');
    await importFile(app, b.accessToken, legacyFile);
    await importFile(app, a.accessToken, legacyFile, 'replace');
    await importFile(app, a.accessToken, legacyFile, 'replace');
    const hb = bearer(b.accessToken);
    expect((await request(app).get('/v1/topics').set(hb)).body).toHaveLength(1);
    expect(
      (await request(app).get('/v1/mock-tests').set(hb)).body,
    ).toHaveLength(1);
    const expB = (await request(app).get('/v1/backup').set(hb)).body;
    expect(expB.topics).toHaveLength(1);
    expect(expB.exams).toHaveLength(2);
  });

  it('accepts bodies above the global 1 MB limit, up to 4 MB', async () => {
    const app = build();
    const a = await signIn(app, 'bk-big');
    const padded = { ...legacyFile, padding: 'x'.repeat(1_500_000) };
    const ok = await importFile(app, a.accessToken, padded);
    expect(ok.status).toBe(200);
    const huge = { ...legacyFile, padding: 'x'.repeat(4_300_000) };
    const tooBig = await importFile(app, a.accessToken, huge);
    expect(tooBig.status).toBe(413);
  });

  it('requires auth', async () => {
    const app = build();
    expect((await request(app).get('/v1/backup')).status).toBe(401);
  });
});
