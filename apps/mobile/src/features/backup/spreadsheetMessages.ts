import type { BackupImportResult, SpreadsheetMapping } from '@planner/shared';
import { ApiError, userMessage } from '../../shared/api/errors';
import { SPREADSHEET_ERROR } from '../../native/spreadsheetFiles';
import { count, importErrorMessage } from './messages';

// Plain-English wording for "Import from Excel".

export const SPREADSHEET_TEXT = {
  reading: 'Reading your spreadsheet…',
  tooLarge:
    'This spreadsheet is too large to import (the limit is 8 MB). Delete sheets you do not need, then try again.',
  oldXls:
    'This is an old Excel file (.xls). Open it in Excel or Google Sheets, save it as .xlsx and try again.',
  notSpreadsheet:
    "This file isn't a spreadsheet. Choose an Excel file (.xlsx) or a .csv file.",
  readFailed: "Couldn't read this spreadsheet. Try again, or save a new copy.",
  noTopics:
    "Couldn't find your topics in this file. Add a Topic column and a First-reading date column to one sheet, then try again.",
  loadFailed:
    "Couldn't check your current topics. Check your connection and try again.",
  tooBigToSend:
    'This spreadsheet has too many topics to send at once. Split it into smaller files and import them one by one.',
  importFailed:
    "Couldn't finish the import — check your topics, then try again.",
} as const;

/** The message for a picker failure (null: cancelled, say nothing). */
export function spreadsheetPickError(e: unknown): string | null {
  const code = (e as { code?: string } | null)?.code;
  switch (code) {
    case SPREADSHEET_ERROR.cancelled:
      return null;
    case SPREADSHEET_ERROR.tooLarge:
      return SPREADSHEET_TEXT.tooLarge;
    case SPREADSHEET_ERROR.oldXls:
      return SPREADSHEET_TEXT.oldXls;
    case SPREADSHEET_ERROR.notSpreadsheet:
      return SPREADSHEET_TEXT.notSpreadsheet;
    default:
      return SPREADSHEET_TEXT.readFailed;
  }
}

/** "Importing 109 topics…" */
export function importingText(n: number): string {
  return `Importing ${count(n, 'topic')}…`;
}

/** "SRB: 60 topics" lines for the preview. */
export function subjectLines(m: SpreadsheetMapping): string[] {
  return m.stats.subjects.map(s => `${s.name}: ${count(s.topics, 'topic')}`);
}

/** How many skipped-row reasons are listed before "and N more". */
export const LISTED_ROWS = 50;

/** "Row 23: No topic name" lines, skipped rows first, then changed topics. */
export function detailLines(m: SpreadsheetMapping): {
  lines: string[];
  more: number;
} {
  const all = [...m.skippedRows, ...m.notes]
    .sort((a, b) => a.row - b.row)
    .map(r => `Row ${r.row}: ${r.reason}`);
  return {
    lines: all.slice(0, LISTED_ROWS),
    more: Math.max(0, all.length - LISTED_ROWS),
  };
}

/** The message after the import, e.g. "Imported 109 topics from Spaced Revision." */
export function spreadsheetResultMessage(
  r: BackupImportResult,
  sheetName: string,
  alreadyInApp: number,
): string {
  const skipped = alreadyInApp + r.skipped.topics;
  const tail =
    skipped > 0
      ? ` ${count(skipped, 'topic')} ${
          skipped === 1 ? 'was' : 'were'
        } already in your planner.`
      : '';
  if (r.imported.topics === 0) {
    return `Nothing new to add — every topic in ${sheetName} is already in your planner.`;
  }
  return `Imported ${count(
    r.imported.topics,
    'topic',
  )} from ${sheetName}.${tail}`;
}

/** The message for a failed import request. */
export function spreadsheetImportError(e: unknown): string {
  if (!(e instanceof ApiError)) return SPREADSHEET_TEXT.importFailed;
  if (e.code === 'LIMIT_EXCEEDED') {
    return 'This would take you over the 5,000-topic limit. Nothing was imported.';
  }
  if (e.status === 413) return SPREADSHEET_TEXT.tooBigToSend;
  if (e.code === 'BACKUP_INVALID') {
    return importErrorMessage(e);
  }
  return userMessage(e, 'backup');
}
