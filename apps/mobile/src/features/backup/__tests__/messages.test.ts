import { BACKUP_MAX_UPLOAD_BYTES } from '@planner/shared';
import { ApiError } from '../../../shared/api/errors';
import {
  IMPORT_FAILED_TEXT,
  TOO_LARGE_TEXT,
  count,
  importErrorMessage,
  importResultMessage,
  overflowText,
  pickErrorMessage,
  summaryText,
  tooLargeToUpload,
  utf8Length,
} from '../messages';

const result = (
  imported: Partial<
    Record<'exams' | 'subjects' | 'topics' | 'mockTests', number>
  >,
  skipped: { topics: number; mockTests?: number } = { topics: 0 },
  shortened?: { topics: number; mockTests: number },
) => ({
  imported: { exams: 0, subjects: 0, topics: 0, mockTests: 0, ...imported },
  skipped,
  ...(shortened ? { shortened } : {}),
});

describe('importResultMessage', () => {
  it('uses the singular for one', () => {
    expect(importResultMessage(result({ topics: 1 }), 'merge')).toBe(
      'Added 1 topic.',
    );
  });

  it('lists topics and mock tests, then exams and subjects', () => {
    expect(
      importResultMessage(
        result({ topics: 12, mockTests: 3, exams: 2, subjects: 1 }),
        'merge',
      ),
    ).toBe('Added 12 topics and 3 mock tests (plus 2 exams and 1 subject).');
  });

  it('explains skipped records as already in the planner', () => {
    expect(
      importResultMessage(
        result({ topics: 2 }, { topics: 300, mockTests: 1 }),
        'merge',
      ),
    ).toBe(
      'Added 2 topics. 300 topics and 1 mock test were already in your planner.',
    );
  });

  it('says when there is nothing new', () => {
    expect(importResultMessage(result({}, { topics: 312 }), 'merge')).toBe(
      'Nothing new to add — everything in this file is already in your planner.',
    );
  });

  it('after Replace, says settings came back too', () => {
    expect(
      importResultMessage(result({ topics: 50, mockTests: 4 }), 'replace'),
    ).toBe(
      'Your data was replaced with the backup: 50 topics and 4 mock tests. Your settings were restored from the backup too.',
    );
  });

  it('mentions shortened text, and works without the newer fields', () => {
    expect(
      importResultMessage(
        result({ topics: 3 }, { topics: 0 }, { topics: 1, mockTests: 2 }),
        'merge',
      ),
    ).toBe(
      'Added 3 topics. 1 topic and 2 mock tests had text shortened to fit this app. Keep your backup file to see the full text.',
    );
  });
});

describe('importErrorMessage', () => {
  it('uses the server description when there is one', () => {
    const e = new ApiError('BACKUP_INVALID', 400, undefined, {
      details: [{ reason: 'INVALID_RECORD', description: 'Topic "A": bad.' }],
    });
    expect(importErrorMessage(e)).toBe('Topic "A": bad.');
  });

  it('falls back for older servers without descriptions', () => {
    const e = new ApiError('BACKUP_INVALID', 400, undefined, {
      details: [{ path: ['topics'], message: 'x' }],
    });
    expect(importErrorMessage(e)).toBe(
      'This file is not a Study Planner backup',
    );
    expect(importErrorMessage(new ApiError('LIMIT_EXCEEDED', 400))).toMatch(
      /5,000 topics/,
    );
  });

  it('maps 413 and non-server failures', () => {
    expect(importErrorMessage(new ApiError('VALIDATION_FAILED', 413))).toBe(
      TOO_LARGE_TEXT,
    );
    expect(importErrorMessage(new Error('boom'))).toBe(IMPORT_FAILED_TEXT);
  });
});

it('pickErrorMessage: cancel is silent, too large is specific', () => {
  expect(pickErrorMessage({ code: 'E_CANCELLED' })).toBeNull();
  expect(pickErrorMessage({ code: 'E_TOO_LARGE' })).toBe(TOO_LARGE_TEXT);
  expect(pickErrorMessage({ code: 'E_FILE_READ' })).toBe(
    "Couldn't read the backup file",
  );
});

it('summaryText names the date or the old app', () => {
  expect(
    summaryText(
      { kind: 'v1', topics: 312, mockTests: 1, exportedOn: '2026-11-12' },
      '2026-11-16',
    ),
  ).toBe('Backup from 12 Nov: 312 topics, 1 mock test');
  expect(
    summaryText(
      { kind: 'legacy', topics: 1, mockTests: 0, exportedOn: null },
      '2026-11-16',
    ),
  ).toBe('Backup from the old app: 1 topic, 0 mock tests');
});

it('overflowText lists up to three names', () => {
  const topics = ['a', 'b', 'c', 'd'].map(n => ({
    id: n,
    name: n,
    fields: ['notes' as const],
  }));
  const o = overflowText({ topics, mockTests: [] })!;
  expect(o.names).toEqual(['a', 'b', 'c']);
  expect(o.more).toBe(1);
  expect(o.text).toMatch(/^4 topics have text longer/);
  expect(overflowText({ topics: [], mockTests: [] })).toBeNull();
});

it('measures UTF-8 bytes and the upload limit', () => {
  expect(utf8Length('abc')).toBe(3);
  expect(utf8Length('é')).toBe(2);
  expect(utf8Length('—')).toBe(3);
  expect(utf8Length('😀')).toBe(4);
  expect(tooLargeToUpload({ topics: [] })).toBe(false);
  expect(tooLargeToUpload({ notes: 'x'.repeat(BACKUP_MAX_UPLOAD_BYTES) })).toBe(
    true,
  );
  expect(count(5000, 'topic')).toBe('5,000 topics');
});
