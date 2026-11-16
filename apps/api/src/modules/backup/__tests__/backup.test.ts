import { gzipSync } from 'node:zlib';
import request from 'supertest';
import type { Express } from 'express';
import { ObjectId } from 'mongodb';
import {
  BACKUP_MAX_BODY_BYTES,
  BACKUP_MAX_UPLOAD_BYTES,
  createSchedule,
  parseBackup,
} from '@planner/shared';
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
      skipped: { topics: 0, mockTests: 0 },
      shortened: { topics: 0, mockTests: 0 },
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
  });

  it('merge leaves the user settings untouched', async () => {
    const app = build();
    const a = await signIn(app, 'bk-merge-settings');
    const h = bearer(a.accessToken);
    const mine = {
      intervals: [3, 9, 27],
      reminderTime: '21:00',
      theme: 'light',
      dailyReminder: false,
    };
    const patched = await request(app)
      .patch('/v1/me')
      .set(h)
      .send({ settings: mine });
    expect(patched.status).toBe(200);
    const exp = await request(app).get('/v1/backup').set(h);
    // A legacy file and a v1 file that both carry different settings.
    const otherV1 = {
      ...exp.body,
      settings: {
        ...exp.body.settings,
        intervals: [4, 7, 15],
        reminderTime: '07:30',
        theme: 'dark',
        dailyReminder: true,
      },
    };
    expect((await importFile(app, a.accessToken, legacyFile)).status).toBe(200);
    expect((await importFile(app, a.accessToken, otherV1)).status).toBe(200);
    const me = (await request(app).get('/v1/me').set(h)).body;
    expect(me.settings).toMatchObject(mine);
  });

  it('replace restores reminder and interval settings but keeps the theme', async () => {
    const app = build();
    const a = await signIn(app, 'bk-replace-settings');
    const h = bearer(a.accessToken);
    await request(app)
      .patch('/v1/me')
      .set(h)
      .send({ settings: { theme: 'light', reminderTime: '21:00' } });
    const res = await importFile(app, a.accessToken, legacyFile, 'replace');
    expect(res.status).toBe(200);
    const me = (await request(app).get('/v1/me').set(h)).body;
    expect(me.settings).toMatchObject({
      intervals: [4, 7, 15, 30],
      reminderTime: '07:30',
      theme: 'light',
    });
  });

  it('re-importing the same file with merge skips existing topics and mock tests', async () => {
    const app = build();
    const a = await signIn(app, 'bk-merge');
    await importFile(app, a.accessToken, legacyFile);
    const res = await importFile(app, a.accessToken, legacyFile);
    expect(res.status).toBe(200);
    expect(res.body.skipped).toEqual({ topics: 1, mockTests: 1 });
    expect(res.body.imported.topics).toBe(0);
    expect(res.body.imported.mockTests).toBe(0);
    const h = bearer(a.accessToken);
    expect((await request(app).get('/v1/topics').set(h)).body).toHaveLength(1);
    expect((await request(app).get('/v1/mock-tests').set(h)).body).toHaveLength(
      1,
    );
  });

  it('keeps legacy mock tests that share an id, and still merges them once', async () => {
    const app = build();
    const a = await signIn(app, 'bk-mock-dupid');
    const file = {
      ...legacyFile,
      tests: [
        legacyFile.tests[0],
        { ...legacyFile.tests[0], date: '2026-11-03', score: 150 },
      ],
    };
    const first = await importFile(app, a.accessToken, file);
    expect(first.body.imported.mockTests).toBe(2);
    const again = await importFile(app, a.accessToken, file);
    expect(again.body.imported.mockTests).toBe(0);
    expect(again.body.skipped.mockTests).toBe(2);
    const h = bearer(a.accessToken);
    expect((await request(app).get('/v1/mock-tests').set(h)).body).toHaveLength(
      2,
    );
  });

  it('replace with an export, then merge of the same export, adds no mock tests', async () => {
    const app = build();
    const src = await signIn(app, 'bk-mock-src');
    const dst = await signIn(app, 'bk-mock-dst');
    const hs = bearer(src.accessToken);
    await request(app).post('/v1/mock-tests').set(hs).send({
      title: 'GT 1',
      takenOn: '2026-11-02',
      score: 1,
      maxScore: 2,
    });
    const exp = (await request(app).get('/v1/backup').set(hs)).body;
    const hd = bearer(dst.accessToken);
    await importFile(app, dst.accessToken, exp, 'replace');
    const merged = await importFile(app, dst.accessToken, exp, 'merge');
    expect(merged.body.imported.mockTests).toBe(0);
    expect(merged.body.skipped.mockTests).toBe(1);
    expect(
      (await request(app).get('/v1/mock-tests').set(hd)).body,
    ).toHaveLength(1);
    // The receiving account's own export keeps the source, so merging that
    // export, or the legacy file the test came from, adds nothing either.
    const own = (await request(app).get('/v1/backup').set(hd)).body;
    expect(own.mockTests[0].sourceId).toBe(exp.mockTests[0].id);
    const third = await importFile(app, dst.accessToken, own, 'merge');
    expect(third.body.imported.mockTests).toBe(0);
  });

  it('a v1 export after a legacy import still dedupes the legacy mock tests', async () => {
    const app = build();
    const a = await signIn(app, 'bk-mock-chain');
    const h = bearer(a.accessToken);
    await importFile(app, a.accessToken, legacyFile);
    const exp = (await request(app).get('/v1/backup').set(h)).body;
    expect(exp.mockTests[0].sourceId).toBe('legacy:mt1');
    await importFile(app, a.accessToken, exp, 'replace');
    const res = await importFile(app, a.accessToken, legacyFile, 'merge');
    expect(res.body.imported.mockTests).toBe(0);
    expect((await request(app).get('/v1/mock-tests').set(h)).body).toHaveLength(
      1,
    );
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
    expect(again.body.skipped).toEqual({ topics: 1, mockTests: 1 });
    expect((await request(app).get('/v1/topics').set(h)).body).toHaveLength(1);
    expect((await request(app).get('/v1/mock-tests').set(h)).body).toHaveLength(
      1,
    );
  });

  it('merging an export of native topics into the same account is a no-op', async () => {
    const app = build();
    const a = await signIn(app, 'bk-native');
    const h = bearer(a.accessToken);
    const subject = await request(app)
      .post('/v1/subjects')
      .set(h)
      .send({ name: 'Anatomy' });
    for (const name of ['Brachial plexus', 'Inguinal canal']) {
      const t = await request(app).post('/v1/topics').set(h).send({
        name,
        subjectId: subject.body.id,
        studiedOn: '2026-11-01',
      });
      expect(t.status).toBe(201);
    }
    await request(app).post('/v1/mock-tests').set(h).send({
      title: 'Mock 1',
      takenOn: '2026-11-02',
      score: 1,
      maxScore: 2,
    });
    const exp = (await request(app).get('/v1/backup').set(h)).body;
    const res = await importFile(app, a.accessToken, exp, 'merge');
    expect(res.status).toBe(200);
    expect(res.body.skipped.topics).toBe(2);
    expect(res.body.imported).toEqual({
      exams: 0,
      subjects: 0,
      topics: 0,
      mockTests: 0,
    });
    expect((await request(app).get('/v1/topics').set(h)).body).toHaveLength(2);
    expect((await request(app).get('/v1/mock-tests').set(h)).body).toHaveLength(
      1,
    );
  });

  it('rejects an invalid file with BACKUP_INVALID', async () => {
    const app = build();
    const a = await signIn(app, 'bk-invalid');
    const res = await importFile(app, a.accessToken, { topics: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BACKUP_INVALID');
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ reason: 'UNKNOWN_FORMAT' }),
    ]);
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

  it('accepts bodies above the global 1 MB limit, up to 8 MiB decoded', async () => {
    const app = build();
    const a = await signIn(app, 'bk-big');
    const padded = { ...legacyFile, padding: 'x'.repeat(4_300_000) };
    const ok = await importFile(app, a.accessToken, padded);
    expect(ok.status).toBe(200);
    const huge = { ...legacyFile, padding: 'x'.repeat(8_500_000) };
    const tooBig = await importFile(app, a.accessToken, huge);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe('VALIDATION_FAILED');
    expect(tooBig.body.error.details).toEqual([
      expect.objectContaining({
        reason: 'TOO_LARGE',
        limitBytes: BACKUP_MAX_BODY_BYTES,
        description:
          'This backup file is too large to import. Nothing was imported.',
      }),
    ]);
  });

  it('accepts a gzip body whose decoded size is above Vercel 4.5 MB cap', async () => {
    const app = build();
    const a = await signIn(app, 'bk-gzip');
    const padded = { ...legacyFile, padding: 'x'.repeat(6_000_000) };
    const zipped = gzipSync(JSON.stringify({ mode: 'merge', data: padded }));
    expect(zipped.length).toBeLessThan(BACKUP_MAX_UPLOAD_BYTES);
    const res = await request(app)
      .post('/v1/backup/import')
      .set(bearer(a.accessToken))
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .serialize(b => b)
      .send(zipped);
    expect(res.status).toBe(200);
    expect(res.body.imported.topics).toBe(1);
    // A damaged gzip body is the client's error, not a server error.
    const broken = await request(app)
      .post('/v1/backup/import')
      .set(bearer(a.accessToken))
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .serialize(b => b)
      .send(Buffer.from('not gzip at all'));
    expect(broken.status).toBe(400);
    expect(broken.body.error.code).toBe('VALIDATION_FAILED');
    expect(broken.body.error.details[0].reason).toBe('BAD_JSON');
  });

  it('exports 5,000 topics as compact JSON under the upload limit and imports them back', async () => {
    const deps = makeTestDeps({}, uri);
    const app = createApp(deps);
    const a = await signIn(app, 'bk-5000');
    const h = bearer(a.accessToken);
    const subject = await request(app)
      .post('/v1/subjects')
      .set(h)
      .send({ name: 'Anatomy' });
    const db = await deps.getDb();
    const userId = new ObjectId(a.user.id);
    const now = new Date('2026-11-13T10:00:00Z');
    let n = 0;
    const makeId = () => new ObjectId().toHexString();
    await db.collection('topics').insertMany(
      Array.from({ length: 5000 }, () => {
        const s = createSchedule('2026-11-01', [4, 7, 15, 30, 60, 90], makeId);
        n += 1;
        return {
          _id: new ObjectId(),
          userId,
          name: `Topic number ${n} of the big list`,
          subjectId: new ObjectId(subject.body.id),
          examIds: [],
          studiedOn: '2026-11-01',
          intervals: [4, 7, 15, 30, 60, 90],
          notes: '',
          revisions: s.revisions,
          nextDueOn: s.nextDueOn,
          status: s.status,
          version: 0,
          createdAt: now,
          updatedAt: now,
        };
      }),
    );
    const exp = await request(app).get('/v1/backup').set(h);
    expect(exp.status).toBe(200);
    expect(exp.body.topics).toHaveLength(5000);
    const body = JSON.stringify({ mode: 'replace', data: exp.body });
    expect(Buffer.byteLength(body)).toBeLessThan(BACKUP_MAX_UPLOAD_BYTES);
    const res = await importFile(app, a.accessToken, exp.body, 'replace');
    expect(res.status).toBe(200);
    expect(res.body.imported.topics).toBe(5000);
    expect(await db.collection('topics').countDocuments({ userId })).toBe(5000);
  }, 120_000);

  it('accepts the text of a file and explains bad JSON', async () => {
    const app = build();
    const a = await signIn(app, 'bk-text');
    const ok = await importFile(app, a.accessToken, JSON.stringify(legacyFile));
    expect(ok.status).toBe(200);
    expect(ok.body.imported.topics).toBe(1);
    const bad = await importFile(app, a.accessToken, '{"topics": [');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BACKUP_INVALID');
    expect(bad.body.error.details).toEqual([
      expect.objectContaining({ reason: 'BAD_JSON', path: [] }),
    ]);
  });

  it('says when a file is not a backup or is from a newer app', async () => {
    const app = build();
    const a = await signIn(app, 'bk-format');
    const other = await importFile(app, a.accessToken, { hello: 'world' });
    expect(other.status).toBe(400);
    expect(other.body.error.code).toBe('BACKUP_INVALID');
    expect(other.body.error.details[0]).toMatchObject({
      reason: 'UNKNOWN_FORMAT',
      description: 'This file is not a Study Planner backup.',
    });
    const newer = await importFile(app, a.accessToken, {
      format: 'studyplanner.backup.v2',
    });
    expect(newer.body.error.code).toBe('BACKUP_INVALID');
    expect(newer.body.error.details[0].reason).toBe('NEWER_VERSION');
  });

  it('names the bad record in BACKUP_INVALID details', async () => {
    const app = build();
    const a = await signIn(app, 'bk-record');
    const h = bearer(a.accessToken);
    await request(app).post('/v1/mock-tests').set(h).send({
      title: 'GT 3',
      takenOn: '2026-11-02',
      score: 1,
      maxScore: 2,
    });
    const exp = (await request(app).get('/v1/backup').set(h)).body;
    exp.mockTests[0].score = 5;
    const res = await importFile(app, a.accessToken, exp);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BACKUP_INVALID');
    expect(res.body.error.details[0]).toEqual({
      reason: 'INVALID_RECORD',
      path: ['mockTests', 0, 'score'],
      message: 'Score cannot exceed max score',
      description:
        'Mock test "GT 3": the score is higher than the max score. Nothing was imported.',
    });
  });

  it('explains the topic limit and imports nothing', async () => {
    const deps = makeTestDeps({}, uri);
    const app = createApp(deps);
    const a = await signIn(app, 'bk-limit');
    const db = await deps.getDb();
    const userId = new ObjectId(a.user.id);
    await db.collection('topics').insertMany(
      Array.from({ length: 5000 }, (_, i) => ({
        userId,
        name: `t${i}`,
        subjectId: new ObjectId(),
        examIds: [],
      })),
    );
    const res = await importFile(app, a.accessToken, legacyFile);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('LIMIT_EXCEEDED');
    expect(res.body.error.details).toEqual([
      {
        reason: 'TOPIC_LIMIT',
        path: ['topics'],
        message: 'Topic limit exceeded',
        description:
          'This backup would take you over the 5,000-topic limit. Nothing was imported.',
        limit: 5000,
        existing: 5000,
        incoming: 1,
      },
    ]);
    const h = bearer(a.accessToken);
    expect((await request(app).get('/v1/mock-tests').set(h)).body).toEqual([]);
    expect((await request(app).get('/v1/exams').set(h)).body).toEqual([]);
  });

  it('reports old-app text that was shortened, only for what was imported', async () => {
    const app = build();
    const a = await signIn(app, 'bk-short');
    const file = {
      ...legacyFile,
      topics: [
        { ...legacyFile.topics[0], notes: 'x'.repeat(10_000) },
        {
          ...legacyFile.topics[0],
          id: 'legacy-2',
          name: 'N'.repeat(240),
          subject: 'S'.repeat(200),
        },
        { ...legacyFile.topics[0], id: 'legacy-3', name: 'Short' },
      ],
      tests: [{ ...legacyFile.tests[0], note: 'z'.repeat(1500) }],
    };
    const res = await importFile(app, a.accessToken, file);
    expect(res.status).toBe(200);
    expect(res.body.imported.topics).toBe(3);
    expect(res.body.shortened).toEqual({ topics: 2, mockTests: 1 });
    const h = bearer(a.accessToken);
    const topics = (await request(app).get('/v1/topics').set(h)).body as {
      name: string;
      notes: string;
    }[];
    expect(topics.some(t => t.notes.length === 2000)).toBe(true);
    expect(topics.some(t => t.name === 'N'.repeat(200))).toBe(true);
    const mocks = (await request(app).get('/v1/mock-tests').set(h)).body;
    expect(mocks[0].notes).toHaveLength(1000);

    const again = await importFile(app, a.accessToken, file);
    expect(again.body.shortened).toEqual({ topics: 0, mockTests: 0 });
  });

  it('a v1 export never reports shortened text', async () => {
    const app = build();
    const a = await signIn(app, 'bk-short-v1');
    const h = bearer(a.accessToken);
    await importFile(app, a.accessToken, legacyFile);
    const exp = (await request(app).get('/v1/backup').set(h)).body;
    const res = await importFile(app, a.accessToken, exp, 'replace');
    expect(res.body.shortened).toEqual({ topics: 0, mockTests: 0 });
  });

  it('exports and re-imports after an exam linked to mock tests is deleted', async () => {
    const app = build();
    const a = await signIn(app, 'bk-exam-gone');
    const h = bearer(a.accessToken);
    await importFile(app, a.accessToken, legacyFile);
    const exams = (await request(app).get('/v1/exams').set(h)).body as {
      id: string;
      name: string;
    }[];
    const neet = exams.find(e => e.name === 'NEET SS');
    await request(app).delete(`/v1/exams/${neet?.id}`).set(h);
    const exp = (await request(app).get('/v1/backup').set(h)).body;
    expect(exp.mockTests[0].examId).toBeNull();
    expect(parseBackup(exp).kind).toBe('v1');
    const res = await importFile(app, a.accessToken, exp, 'replace');
    expect(res.status).toBe(200);
    expect(res.body.imported.mockTests).toBe(1);
  });

  it('heals stale exam links on export and imports older files that have them', async () => {
    const deps = makeTestDeps({}, uri);
    const app = createApp(deps);
    const a = await signIn(app, 'bk-exam-stale');
    const h = bearer(a.accessToken);
    await importFile(app, a.accessToken, legacyFile);
    // Older data: an exam deleted before the fix left its id behind.
    const gone = new ObjectId();
    const db = await deps.getDb();
    const userId = new ObjectId(a.user.id);
    await db
      .collection('mockTests')
      .updateMany({ userId }, { $set: { examId: gone } });
    await db
      .collection('topics')
      .updateMany({ userId }, { $push: { examIds: gone } } as never);
    const exp = (await request(app).get('/v1/backup').set(h)).body;
    expect(exp.mockTests[0].examId).toBeNull();
    expect(exp.topics[0].examIds).not.toContain(gone.toHexString());
    expect(exp.topics[0].examIds).toHaveLength(2);

    // A file exported before the fix still carries the deleted exam's id.
    const old = structuredClone(exp);
    old.mockTests[0].examId = gone.toHexString();
    old.topics[0].examIds.push(gone.toHexString());
    const res = await importFile(app, a.accessToken, old, 'replace');
    expect(res.status).toBe(200);
    const mocks = (await request(app).get('/v1/mock-tests').set(h)).body;
    expect(mocks[0].examId).toBeNull();
    const topics = (await request(app).get('/v1/topics').set(h)).body;
    expect(topics[0].examIds).toHaveLength(2);
  });

  it('requires auth', async () => {
    const app = build();
    expect((await request(app).get('/v1/backup')).status).toBe(401);
  });
});
