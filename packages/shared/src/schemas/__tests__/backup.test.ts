import { ZodError } from 'zod';
import { DEFAULT_SETTINGS } from '../settings';
import { parseBackup } from '../backup';

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
