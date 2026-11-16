import { ZodError } from 'zod';
import { DEFAULT_SETTINGS } from '../settings';
import {
  checkBackup,
  checkBackupText,
  describeBackupIssue,
  findLegacyOverflows,
  parseBackup,
  tooLargeProblem,
  topicLimitProblem,
} from '../backup';

const legacyTopic = {
  id: 't1',
  name: 'Hernia',
  exam: 'Both',
  subject: 'Surgery',
  studyDate: '2026-11-01',
  intervals: [4, 7],
  notes: '',
  revisions: [{ day: 4, date: '2026-11-05', done: false }],
};
const legacyMock = {
  id: 'm1',
  exam: 'NEET SS',
  date: '2026-11-02',
  score: 50,
  max: 100,
  note: '',
};
const legacy = { topics: [legacyTopic], settings: { intervals: [4, 7] } };

const v1 = {
  format: 'studyplanner.backup.v1',
  exportedAt: '2026-11-13T10:00:00.000Z',
  settings: DEFAULT_SETTINGS,
  exams: [{ id: 'e1', name: 'NEET SS', examDate: null }],
  subjects: [{ id: 's1', name: 'Surgery' }],
  topics: [
    {
      id: 't1',
      name: 'Hernia',
      subjectId: 's1',
      examIds: ['e1'],
      studiedOn: '2026-11-01',
      intervals: [4, 7],
      notes: '',
      revisions: [
        { step: 1, doneOn: '2026-11-05', dueOverride: null },
        { step: 2, doneOn: null, dueOverride: null },
      ],
    },
  ],
  mockTests: [
    {
      id: 'm1',
      title: 'Mock',
      takenOn: '2026-11-02',
      score: 1,
      maxScore: 2,
      examId: 'e1',
      notes: '',
    },
  ],
};

describe('parseBackup', () => {
  it('accepts a minimal v1 file', () => {
    expect(parseBackup(v1).kind).toBe('v1');
  });
  it('accepts a legacy file with tests', () => {
    const r = parseBackup({ ...legacy, tests: [legacyMock] });
    expect(r.kind).toBe('legacy');
  });
  it('accepts a legacy file with mockTests and lenient missing fields', () => {
    const bare: Record<string, unknown> = { ...legacyTopic };
    delete bare.subject;
    delete bare.notes;
    const r = parseBackup({
      topics: [bare],
      settings: { intervals: [4] },
      mockTests: [{ ...legacyMock, note: undefined }],
    });
    expect(r.kind).toBe('legacy');
  });
  it('rejects a legacy file with both tests and mockTests', () => {
    expect(() => parseBackup({ ...legacy, tests: [], mockTests: [] })).toThrow(
      ZodError,
    );
  });
  it('rejects an unknown legacy exam', () => {
    expect(() =>
      parseBackup({ ...legacy, topics: [{ ...legacyTopic, exam: 'USMLE' }] }),
    ).toThrow(ZodError);
  });
  it('rejects a v1 file with a dangling subjectId', () => {
    const topics = [{ ...v1.topics[0], subjectId: 'nope' }];
    expect(() => parseBackup({ ...v1, topics })).toThrow(ZodError);
  });
});

describe('v1 links to exams that are not in the file', () => {
  it('treats an unknown mock-test examId as no exam', () => {
    const mockTests = [{ ...v1.mockTests[0], examId: 'deleted-exam' }];
    const r = parseBackup({ ...v1, mockTests });
    if (r.kind !== 'v1') throw new Error('expected v1');
    expect(r.data.mockTests[0]!.examId).toBeNull();
  });
  it('drops unknown exam ids from topics and keeps the known ones', () => {
    const topics = [{ ...v1.topics[0], examIds: ['e1', 'deleted-exam'] }];
    const r = parseBackup({ ...v1, topics });
    if (r.kind !== 'v1') throw new Error('expected v1');
    expect(r.data.topics[0]!.examIds).toEqual(['e1']);
  });
  it('keeps an optional mock-test sourceId', () => {
    const mockTests = [{ ...v1.mockTests[0], sourceId: 'legacy:m1' }];
    const r = parseBackup({ ...v1, mockTests });
    if (r.kind !== 'v1') throw new Error('expected v1');
    expect(r.data.mockTests[0]!.sourceId).toBe('legacy:m1');
  });
});

describe('legacy subjects', () => {
  it('collapses spaces before cutting a long subject', () => {
    const subject = `  ${'Surgery   '.repeat(20)}`;
    const r = parseBackup({ ...legacy, topics: [{ ...legacyTopic, subject }] });
    if (r.kind !== 'legacy') throw new Error('expected legacy');
    const s = r.data.topics[0]!.subject;
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s).not.toMatch(/\s{2}/);
    expect(s.startsWith('Surgery Surgery')).toBe(true);
  });
});

describe('checkBackup', () => {
  it('accepts a v1 and a legacy file', () => {
    expect(checkBackup(v1)).toMatchObject({ ok: true, backup: { kind: 'v1' } });
    expect(checkBackup(legacy)).toMatchObject({
      ok: true,
      backup: { kind: 'legacy' },
    });
  });
  it('reports bad JSON', () => {
    expect(checkBackupText('{ not json')).toEqual({
      ok: false,
      problems: [expect.objectContaining({ reason: 'BAD_JSON' })],
    });
    expect(checkBackupText(JSON.stringify(v1)).ok).toBe(true);
  });
  it('reports a value that is not a backup at all', () => {
    for (const value of [null, 3, [], { topics: 'nope' }, { hello: 1 }]) {
      expect(checkBackup(value)).toEqual({
        ok: false,
        problems: [
          expect.objectContaining({
            reason: 'UNKNOWN_FORMAT',
            description: 'This file is not a Study Planner backup.',
          }),
        ],
      });
    }
  });
  it('reports a backup from a newer app version', () => {
    expect(checkBackup({ ...v1, format: 'studyplanner.backup.v2' })).toEqual({
      ok: false,
      problems: [expect.objectContaining({ reason: 'NEWER_VERSION' })],
    });
  });
  it('names the record and the problem for a bad v1 mock test', () => {
    const mockTests = [{ ...v1.mockTests[0], title: 'GT 3', score: 5 }];
    const r = checkBackup({ ...v1, mockTests });
    if (r.ok) throw new Error('expected a problem');
    expect(r.problems[0]).toEqual({
      reason: 'INVALID_RECORD',
      path: ['mockTests', 0, 'score'],
      message: 'Score cannot exceed max score',
      description:
        'Mock test "GT 3": the score is higher than the max score. Nothing was imported.',
    });
  });
  it('describes legacy records and field problems', () => {
    const r = checkBackup({
      ...legacy,
      topics: [{ ...legacyTopic, studyDate: 'someday' }],
      tests: [{ ...legacyMock, score: 500 }],
    });
    if (r.ok) throw new Error('expected a problem');
    expect(r.problems.map(p => p.description)).toEqual([
      'Topic "Hernia": the studied date is not valid. Nothing was imported.',
      'Mock test 1: the score is higher than the max score. Nothing was imported.',
    ]);
  });
  it('describes a missing or too long field and a missing subject', () => {
    const missing = checkBackup({
      ...v1,
      topics: [{ ...v1.topics[0], name: '   ' }],
    });
    if (missing.ok) throw new Error('expected a problem');
    expect(missing.problems[0]!.description).toBe(
      'Topic 1: the name is missing. Nothing was imported.',
    );
    const long = checkBackup({
      ...v1,
      topics: [{ ...v1.topics[0], notes: 'x'.repeat(2001) }],
    });
    if (long.ok) throw new Error('expected a problem');
    expect(long.problems[0]!.description).toBe(
      'Topic "Hernia": the notes is too long. Nothing was imported.',
    );
    const subject = checkBackup({
      ...v1,
      topics: [{ ...v1.topics[0], subjectId: 'nope' }],
    });
    if (subject.ok) throw new Error('expected a problem');
    expect(subject.problems[0]!.description).toBe(
      'Topic "Hernia": its subject is missing from the file. Nothing was imported.',
    );
  });
  it('builds the limit and size problems', () => {
    expect(topicLimitProblem(4990, 20)).toEqual({
      reason: 'TOPIC_LIMIT',
      path: ['topics'],
      message: 'Topic limit exceeded',
      description:
        'This backup would take you over the 5,000-topic limit. Nothing was imported.',
      limit: 5000,
      existing: 4990,
      incoming: 20,
    });
    expect(tooLargeProblem(100)).toMatchObject({
      reason: 'TOO_LARGE',
      limitBytes: 100,
    });
  });
});

describe('describeBackupIssue', () => {
  it('falls back to the file when the path has no record', () => {
    expect(describeBackupIssue({}, { path: [], message: 'x' })).toBe(
      'This backup: something in it is not valid. Nothing was imported.',
    );
  });
  it('maps an unknown exam message from an older server', () => {
    expect(
      describeBackupIssue(v1, {
        path: ['mockTests', 0, 'examId'],
        message: 'Unknown examId',
      }),
    ).toBe(
      'Mock test "Mock": its exam no longer exists. Nothing was imported.',
    );
  });
});

describe('findLegacyOverflows', () => {
  it('finds long names, subjects, notes and mock notes', () => {
    const raw = {
      ...legacy,
      topics: [
        legacyTopic,
        {
          ...legacyTopic,
          id: 7,
          name: 'N'.repeat(240),
          subject: 'S'.repeat(200),
          notes: 'x'.repeat(10_000),
        },
        { ...legacyTopic, id: 't3', notes: 'y'.repeat(2001) },
        // Spaces collapse first, so this name fits.
        { ...legacyTopic, id: 't4', name: `A${' '.repeat(300)}B` },
      ],
      tests: [legacyMock, { ...legacyMock, id: 'm2', note: 'z'.repeat(1001) }],
    };
    expect(findLegacyOverflows(raw)).toEqual({
      topics: [
        {
          id: '7',
          name: 'N'.repeat(200),
          fields: ['name', 'subject', 'notes'],
        },
        { id: 't3', name: 'Hernia', fields: ['notes'] },
      ],
      mockTests: [{ id: 'm2', index: 1 }],
    });
  });
  it('finds nothing in a v1 file or a value that is not a backup', () => {
    const empty = { topics: [], mockTests: [] };
    expect(findLegacyOverflows(v1)).toEqual(empty);
    expect(findLegacyOverflows('nope')).toEqual(empty);
  });
});
