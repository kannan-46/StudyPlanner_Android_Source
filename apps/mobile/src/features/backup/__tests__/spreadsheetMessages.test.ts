import { mapSpreadsheet } from '@planner/shared';
import { ApiError } from '../../../shared/api/errors';
import {
  LISTED_ROWS,
  SPREADSHEET_TEXT,
  detailLines,
  spreadsheetImportError,
  spreadsheetPickError,
  spreadsheetResultMessage,
  subjectLines,
} from '../spreadsheetMessages';

const result = (topics: number, skipped = 0) => ({
  imported: { exams: 0, subjects: 0, topics, mockTests: 0 },
  skipped: { topics: skipped, mockTests: 0 },
});

it('words the result', () => {
  expect(spreadsheetResultMessage(result(109), 'Spaced Revision', 0)).toBe(
    'Imported 109 topics from Spaced Revision.',
  );
  expect(spreadsheetResultMessage(result(1, 1), 'S', 2)).toBe(
    'Imported 1 topic from S. 3 topics were already in your planner.',
  );
  expect(spreadsheetResultMessage(result(0, 4), 'S', 0)).toBe(
    'Nothing new to add — every topic in S is already in your planner.',
  );
});

it('words picker errors, and says nothing on cancel', () => {
  expect(spreadsheetPickError({ code: 'E_CANCELLED' })).toBeNull();
  expect(spreadsheetPickError({ code: 'E_OLD_XLS' })).toBe(
    SPREADSHEET_TEXT.oldXls,
  );
  expect(SPREADSHEET_TEXT.oldXls).toMatch(/save it as \.xlsx and try again/);
  expect(spreadsheetPickError(new Error('x'))).toBe(
    SPREADSHEET_TEXT.readFailed,
  );
});

it('words import errors', () => {
  expect(spreadsheetImportError(new Error('x'))).toBe(
    SPREADSHEET_TEXT.importFailed,
  );
  expect(spreadsheetImportError(new ApiError('VALIDATION_FAILED', 413))).toBe(
    SPREADSHEET_TEXT.tooBigToSend,
  );
  const problem = {
    reason: 'INVALID_RECORD',
    path: ['topics', 0],
    message: 'x',
    description: 'Topic "Burns": its revision dates are not valid.',
  };
  expect(
    spreadsheetImportError(
      new ApiError('BACKUP_INVALID', 400, undefined, { details: [problem] }),
    ),
  ).toBe(problem.description);
});

it('lists subjects and the reasons rows were left out', () => {
  const rows = [['Book', 'Topic', 'Studied']];
  for (let i = 0; i < 60; i++) rows.push(['SRB', '', '46342']);
  rows.push(['SRB', 'Shock', '46342']);
  const m = mapSpreadsheet([{ name: 'S', rows }]);
  expect(subjectLines(m)).toEqual(['SRB: 1 topic']);
  const d = detailLines(m);
  expect(d.lines).toHaveLength(LISTED_ROWS);
  expect(d.lines[0]).toBe('Row 2: No topic name');
  expect(d.more).toBe(10);
});
