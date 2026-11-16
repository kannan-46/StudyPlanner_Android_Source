import {
  buildSpreadsheetBackup,
  excelSerialToLocalDate,
  mapSpreadsheet,
  parseSpreadsheetDate,
  splitExistingTopics,
  spreadsheetTopicKey,
  type SpreadsheetSheet,
} from '../spreadsheet';
import { addDays } from '../dates';
import { backupV1Schema } from '../../schemas/backup';
import { DEFAULT_SETTINGS } from '../../schemas/settings';

const INTERVALS = [4, 7, 15, 30, 60, 90];
const HEADER = [
  'Book',
  'Topic',
  'First-reading date',
  'Interval (days)',
  'Revision due date',
  'Day',
  'Status',
  'Completion date',
];

/** Excel serial for a LocalDate: 46342 is 2026-11-16. */
function serial(date: string): string {
  let n = 46342;
  let d = '2026-11-16';
  while (d < date) {
    d = addDays(d, 1);
    n++;
  }
  while (d > date) {
    d = addDays(d, -1);
    n--;
  }
  return String(n);
}

/** Six revision rows for a topic, all Pending unless `done` says otherwise. */
function revisionRows(
  book: string,
  topic: string,
  studied: string,
  done: Record<number, { status?: string; completion?: string }> = {},
): string[][] {
  return INTERVALS.map(iv => {
    const due = addDays(studied, iv);
    const d = done[iv];
    return [
      book,
      topic,
      serial(studied),
      String(iv),
      serial(due),
      'Mon',
      d?.status ?? 'Pending',
      d?.completion ? serial(d.completion) : '',
    ];
  });
}

/** A workbook shaped like a student's revision planner. */
function workbook(): SpreadsheetSheet[] {
  return [
    {
      name: 'Dashboard',
      rows: [['Study dashboard'], ['Topics done', '12']],
    },
    {
      name: 'Daily Plan',
      rows: [
        ['Date', 'Plan'],
        ['46342', 'Read SRB'],
      ],
    },
    {
      name: 'Spaced Revision',
      rows: [
        ['Spaced revision tracker'],
        [],
        HEADER,
        ...revisionRows('SRB', 'Thyroid', '2026-11-16'),
        ...revisionRows('SRB', 'Inguinal hernia', '2026-10-20', {
          4: { status: 'Done', completion: '2026-10-25' },
          7: { status: 'Completed' },
        }),
        ...revisionRows('Pearls', 'Breast  carcinoma', '2026-12-01'),
        ['', '', '', '', '', '', '', ''],
        ['SRB', '', serial('2026-11-01'), '4', '', '', 'Pending', ''],
        ['SRB', 'Burns', 'soon', '4', '', '', 'Pending', ''],
        ['SRB', 'Burns', serial('2026-11-01'), 'abc', '', '', 'Pending', ''],
      ],
    },
    {
      name: 'April Revision',
      rows: [['Week', 'Topics']],
    },
    {
      name: 'Topic Bank',
      rows: [
        [
          'Book',
          'No.',
          'Chapter / topic',
          'Source note',
          'First-reading date',
          'First reading status',
        ],
        ['SRB', '1', 'Thyroid', 'ch 49', serial('2026-11-16'), 'Done'],
      ],
    },
  ];
}

describe('excelSerialToLocalDate', () => {
  it('converts serials with whole-day arithmetic', () => {
    expect(excelSerialToLocalDate(46342)).toBe('2026-11-16');
    expect(excelSerialToLocalDate(45658)).toBe('2025-01-01');
    expect(excelSerialToLocalDate(1)).toBe('1900-01-01');
    expect(excelSerialToLocalDate(59)).toBe('1900-02-28');
    expect(excelSerialToLocalDate(61)).toBe('1900-03-01');
    expect(excelSerialToLocalDate(46342.75)).toBe('2026-11-16');
  });
  it('has no date for the fake 29 Feb 1900, zero or nonsense', () => {
    expect(excelSerialToLocalDate(60)).toBeNull();
    expect(excelSerialToLocalDate(0)).toBeNull();
    expect(excelSerialToLocalDate(-5)).toBeNull();
    expect(excelSerialToLocalDate(Number.NaN)).toBeNull();
  });
});

describe('parseSpreadsheetDate', () => {
  it.each([
    ['46342', '2026-11-16'],
    ['46342.5', '2026-11-16'],
    ['2026-11-16', '2026-11-16'],
    ['2026-11-16T00:00:00', '2026-11-16'],
    ['2026/11/16', '2026-11-16'],
    ['16/11/2026', '2026-11-16'],
    ['05/11/2026', '2026-11-05'],
    ['11/16/2026', '2026-11-16'],
    ['16-11-26', '2026-11-16'],
    ['16.11.2026', '2026-11-16'],
    ['16-Nov-2026', '2026-11-16'],
    ['16 November 2026', '2026-11-16'],
    ['16th Nov 2026', '2026-11-16'],
    ['Nov 16, 2026', '2026-11-16'],
    ['Sept 3, 2026', '2026-09-03'],
    ['Mon, 16 Nov 2026', '2026-11-16'],
    ['  16/11/2026 10:30 ', '2026-11-16'],
  ])('reads %s', (input, expected) => {
    expect(parseSpreadsheetDate(input)).toBe(expected);
  });
  it.each([
    '',
    'soon',
    '4',
    '31/02/2026',
    '2026-13-01',
    'Novx 3 2026',
    '1/1/1990',
  ])('rejects %p', input => {
    expect(parseSpreadsheetDate(input)).toBeNull();
  });
});

describe('mapSpreadsheet', () => {
  it('reads the per-revision sheet of a revision planner', () => {
    const m = mapSpreadsheet(workbook(), { today: '2026-11-16' });
    expect(m.sheetName).toBe('Spaced Revision');
    expect(m.layout).toBe('revisions');
    expect(m.topics.map(t => [t.subject, t.name])).toEqual([
      ['SRB', 'Thyroid'],
      ['SRB', 'Inguinal hernia'],
      ['Pearls', 'Breast carcinoma'],
    ]);
    const [thyroid, hernia, breast] = m.topics;
    expect(thyroid).toMatchObject({
      studiedOn: '2026-11-16',
      intervals: INTERVALS,
      doneOn: [null, null, null, null, null, null],
      row: 4,
    });
    // Done with a completion date, then done by status only (its due day).
    expect(hernia?.doneOn).toEqual([
      '2026-10-25',
      '2026-10-27',
      null,
      null,
      null,
      null,
    ]);
    // A future first-reading date is imported as it is.
    expect(breast?.studiedOn).toBe('2026-12-01');
    expect(m.skippedRows).toEqual([
      { row: 23, reason: 'No topic name' },
      { row: 24, reason: 'First-reading date "soon" isn\'t a date' },
      {
        row: 25,
        reason: 'Interval "abc" isn\'t a whole number of days',
      },
    ]);
    expect(m.notes).toEqual([]);
    expect(m.truncated).toBe(false);
    expect(m.stats).toEqual({
      topics: 3,
      doneRevisions: 2,
      skippedRows: 3,
      subjects: [
        { name: 'SRB', topics: 2 },
        { name: 'Pearls', topics: 1 },
      ],
    });
  });

  it('accepts inline text dates and other header spellings', () => {
    const m = mapSpreadsheet([
      {
        name: 'Sheet1',
        rows: [
          ['subject', 'Topic Name', 'Studied on', 'Gap', 'Done on'],
          ['Bailey', 'Shock', '01/11/2026', '4', '06/11/2026'],
          ['Bailey', 'Shock', '01/11/2026', '7', ''],
        ],
      },
    ]);
    expect(m.topics).toEqual([
      {
        subject: 'Bailey',
        name: 'Shock',
        studiedOn: '2026-11-01',
        intervals: [4, 7],
        doneOn: ['2026-11-06', null],
        notes: '',
        row: 2,
      },
    ]);
  });

  it('uses the sorted distinct intervals of each topic', () => {
    const rows = [HEADER];
    rows.push(['SRB', 'Shock', '46342', '15', '', '', '', '']);
    rows.push(['SRB', 'Shock', '46342', '4', '', '', '', '']);
    rows.push(['SRB', 'Shock', '46342', '4', '', '', '', '']);
    const m = mapSpreadsheet([{ name: 'S', rows }]);
    expect(m.topics[0]?.intervals).toEqual([4, 15]);
    expect(m.skippedRows).toEqual([
      { row: 4, reason: 'Same revision as row 3; the first one was kept' },
    ]);
  });

  it('marks yes, a tick and TRUE as done', () => {
    const rows = [HEADER];
    ['Yes', '✓', 'TRUE', 'no'].forEach((status, i) => {
      rows.push([
        'SRB',
        'Shock',
        '46342',
        String(INTERVALS[i]),
        '',
        '',
        status,
        '',
      ]);
    });
    const m = mapSpreadsheet([{ name: 'S', rows }]);
    expect(m.topics[0]?.doneOn).toEqual([
      '2026-11-20',
      '2026-11-23',
      '2026-12-01',
      null,
    ]);
  });

  it('never dates a done mark without a date after today', () => {
    const rows = [HEADER, ['SRB', 'Shock', '46342', '4', '', '', 'Done', '']];
    const m = mapSpreadsheet([{ name: 'S', rows }], { today: '2026-11-17' });
    expect(m.topics[0]?.doneOn).toEqual(['2026-11-17']);
  });

  it('drops done marks that are out of order and says so', () => {
    const gap = [
      HEADER,
      ['SRB', 'Shock', '46342', '4', '', '', 'Pending', ''],
      ['SRB', 'Shock', '46342', '7', '', '', 'Done', ''],
    ];
    const early = [
      HEADER,
      [
        'SRB',
        'Burns',
        serial('2026-11-16'),
        '4',
        '',
        '',
        '',
        serial('2026-11-10'),
      ],
    ];
    const m1 = mapSpreadsheet([{ name: 'S', rows: gap }]);
    expect(m1.topics[0]?.doneOn).toEqual([null, null]);
    expect(m1.notes).toEqual([
      {
        row: 2,
        reason:
          '"Shock": the revisions marked done are out of order, so they were imported as not done yet',
      },
    ]);
    const m2 = mapSpreadsheet([{ name: 'S', rows: early }]);
    expect(m2.topics[0]?.doneOn).toEqual([null]);
    expect(m2.notes).toHaveLength(1);
  });

  it('uses the usual gaps when a topic has more than 20 revisions', () => {
    const rows = [HEADER];
    for (let i = 1; i <= 21; i++) {
      rows.push(['SRB', 'Shock', '46342', String(i), '', '', 'Done', '']);
    }
    const m = mapSpreadsheet([{ name: 'S', rows }], { intervals: [3, 9] });
    expect(m.topics[0]).toMatchObject({
      intervals: [3, 9],
      doneOn: [null, null],
    });
    expect(m.notes[0]?.reason).toMatch(/more than 20 revisions/);
  });

  it('skips intervals outside 1-999 and long names', () => {
    const rows = [
      HEADER,
      ['SRB', 'Shock', '46342', '0', '', '', '', ''],
      ['SRB', 'Shock', '46342', '1000', '', '', '', ''],
      ['SRB', 'x'.repeat(201), '46342', '4', '', '', '', ''],
      ['b'.repeat(81), 'Shock', '46342', '4', '', '', '', ''],
      ['SRB', 'Shock', '', '4', '', '', '', ''],
    ];
    const m = mapSpreadsheet([{ name: 'S', rows }]);
    expect(m.topics).toEqual([]);
    expect(m.skippedRows.map(s => s.reason)).toEqual([
      'Interval must be between 1 and 999 days',
      'Interval must be between 1 and 999 days',
      'Topic name is longer than 200 characters',
      'Book name is longer than 80 characters',
      'No first-reading date',
    ]);
  });

  it('falls back to a per-topic sheet with the usual gaps', () => {
    const sheets = workbook().filter(s => s.name !== 'Spaced Revision');
    sheets[3]?.rows.push(
      ['', '2', 'Goitre', '', serial('2026-11-17'), ''],
      ['srb', '3', 'THYROID ', '', serial('2026-11-18'), ''],
    );
    const m = mapSpreadsheet(sheets, { intervals: [4, 7, 15] });
    expect(m.sheetName).toBe('Topic Bank');
    expect(m.layout).toBe('topics');
    expect(m.topics).toEqual([
      {
        subject: 'SRB',
        name: 'Thyroid',
        studiedOn: '2026-11-16',
        intervals: [4, 7, 15],
        doneOn: [null, null, null],
        notes: 'ch 49',
        row: 2,
      },
      {
        subject: 'General',
        name: 'Goitre',
        studiedOn: '2026-11-17',
        intervals: [4, 7, 15],
        doneOn: [null, null, null],
        notes: '',
        row: 3,
      },
    ]);
    expect(m.skippedRows).toEqual([
      { row: 4, reason: 'Same topic as row 2; the first one was kept' },
    ]);
  });

  it('uses the default intervals when the given ones are not valid', () => {
    const rows = [
      ['Topic', 'Studied'],
      ['Shock', '46342'],
    ];
    const m = mapSpreadsheet([{ name: 'S', rows }], { intervals: [7, 4] });
    expect(m.topics[0]?.intervals).toEqual(DEFAULT_SETTINGS.intervals);
  });

  it('reports no sheet when none has topic and date columns', () => {
    const m = mapSpreadsheet([{ name: 'Notes', rows: [['Hello'], ['World']] }]);
    expect(m).toMatchObject({ sheetName: null, layout: null, topics: [] });
  });

  it('passes on a sheet the phone cut short', () => {
    const rows = [
      ['Topic', 'Studied'],
      ['Shock', '46342'],
    ];
    const m = mapSpreadsheet([{ name: 'S', rows, truncated: true }]);
    expect(m.truncated).toBe(true);
  });

  it('stops at the topic limit', () => {
    const rows = [['Topic', 'Studied']];
    for (let i = 0; i < 5002; i++) rows.push([`Topic ${i}`, '46342']);
    const m = mapSpreadsheet([{ name: 'S', rows }]);
    expect(m.topics).toHaveLength(5000);
    expect(m.skippedRows).toHaveLength(2);
    expect(m.skippedRows[0]?.reason).toBe('Over the 5,000-topic limit');
  });
});

describe('spreadsheet import as a backup', () => {
  it('keys topics without case or extra spaces, within 128 characters', () => {
    expect(spreadsheetTopicKey(' SRB', 'Inguinal  Hernia')).toBe(
      'xlsx:srb|inguinal hernia',
    );
    const long = spreadsheetTopicKey('b'.repeat(80), 'x'.repeat(200));
    expect(long.length).toBeLessThanOrEqual(128);
    expect(long).toBe(spreadsheetTopicKey('b'.repeat(80), 'x'.repeat(200)));
    expect(long).not.toBe(
      spreadsheetTopicKey('b'.repeat(80), `${'x'.repeat(199)}y`),
    );
  });

  it('builds a valid v1 backup with subjects and an exam link', () => {
    const m = mapSpreadsheet(workbook(), { today: '2026-11-16' });
    const backup = buildSpreadsheetBackup(m.topics, {
      exam: { name: 'NEET SS', examDate: null },
    });
    const parsed = backupV1Schema.parse(backup);
    expect(parsed.subjects).toEqual([
      { id: 's1', name: 'SRB' },
      { id: 's2', name: 'Pearls' },
    ]);
    expect(parsed.exams).toEqual([
      { id: 'e1', name: 'NEET SS', examDate: null },
    ]);
    expect(parsed.topics[1]).toMatchObject({
      name: 'Inguinal hernia',
      subjectId: 's1',
      examIds: ['e1'],
      legacyId: 'xlsx:srb|inguinal hernia',
      revisions: [
        { step: 1, doneOn: '2026-10-25', dueOverride: null },
        { step: 2, doneOn: '2026-10-27', dueOverride: null },
        { step: 3, doneOn: null, dueOverride: null },
        { step: 4, doneOn: null, dueOverride: null },
        { step: 5, doneOn: null, dueOverride: null },
        { step: 6, doneOn: null, dueOverride: null },
      ],
    });
    expect(parsed.settings).toEqual(DEFAULT_SETTINGS);
    expect(parsed.mockTests).toEqual([]);
  });

  it('builds no exam link without an exam', () => {
    const m = mapSpreadsheet(workbook());
    const backup = buildSpreadsheetBackup(m.topics);
    expect(backup.exams).toEqual([]);
    expect(backup.topics.every(t => t.examIds.length === 0)).toBe(true);
  });

  it('splits off topics already in the app', () => {
    const m = mapSpreadsheet(workbook());
    const split = splitExistingTopics(m.topics, [
      { subject: 'srb', name: 'THYROID' },
      { subject: 'Bailey', name: 'Inguinal hernia' },
    ]);
    expect(split.existing.map(t => t.name)).toEqual(['Thyroid']);
    expect(split.fresh.map(t => t.name)).toEqual([
      'Inguinal hernia',
      'Breast carcinoma',
    ]);
  });
});
