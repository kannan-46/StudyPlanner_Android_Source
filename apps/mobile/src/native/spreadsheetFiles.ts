import { NativeModules } from 'react-native';
import type { SpreadsheetFile, SpreadsheetSheet } from '@planner/shared';

// Wrapper over pickSpreadsheet() of the native "BackupFiles" module
// (BackupFilesModule.kt, parsing in SpreadsheetReader.kt).

/** Rejection codes of pickSpreadsheet, so the app can say what went wrong. */
export const SPREADSHEET_ERROR = {
  cancelled: 'E_CANCELLED',
  /** Over 8 MiB, or more than the phone can unpack. */
  tooLarge: 'E_TOO_LARGE',
  /** An old binary .xls workbook (or a password-protected file). */
  oldXls: 'E_OLD_XLS',
  /** Not an .xlsx or .csv file, or a damaged one. */
  notSpreadsheet: 'E_NOT_SPREADSHEET',
  /** Any other read failure. */
  readFailed: 'E_FILE_READ',
} as const;

interface SpreadsheetNative {
  pickSpreadsheet?: () => Promise<string>;
}

function readFailed(message: string): Error {
  return Object.assign(new Error(message), {
    code: SPREADSHEET_ERROR.readFailed,
  });
}

const isText = (v: unknown): v is string => typeof v === 'string';

function toSheet(value: unknown): SpreadsheetSheet | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  if (!isText(s.name) || !Array.isArray(s.rows)) return null;
  const rows = s.rows as unknown[];
  if (!rows.every(r => Array.isArray(r) && r.every(isText))) return null;
  return {
    name: s.name,
    rows: rows as string[][],
    truncated: s.truncated === true,
  };
}

/** The native JSON as a SpreadsheetFile; throws E_FILE_READ when malformed. */
export function parseSpreadsheetJson(json: string): SpreadsheetFile {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw readFailed('The spreadsheet could not be read.');
  }
  const v = (value ?? {}) as Record<string, unknown>;
  const sheets = Array.isArray(v.sheets) ? v.sheets.map(toSheet) : null;
  if (!sheets || sheets.some(s => s === null)) {
    throw readFailed('The spreadsheet could not be read.');
  }
  return {
    fileName: isText(v.fileName) ? v.fileName : '',
    sheets: sheets as SpreadsheetSheet[],
  };
}

/**
 * Opens the system picker for an .xlsx or .csv file and resolves with every
 * sheet's cells as text (numbers as stored, so dates stay Excel serials).
 * Rejects with one of SPREADSHEET_ERROR's codes.
 */
export async function pickSpreadsheet(): Promise<SpreadsheetFile> {
  const mod = NativeModules.BackupFiles as SpreadsheetNative | undefined;
  if (!mod?.pickSpreadsheet) {
    throw readFailed('Spreadsheet import is not available on this device.');
  }
  return parseSpreadsheetJson(await mod.pickSpreadsheet());
}
