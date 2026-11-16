import { NativeModules } from 'react-native';
import {
  SPREADSHEET_ERROR,
  parseSpreadsheetJson,
  pickSpreadsheet,
} from '../spreadsheetFiles';

const original = NativeModules.BackupFiles;
afterEach(() => {
  NativeModules.BackupFiles = original;
  jest.clearAllMocks();
});

const json = JSON.stringify({
  fileName: 'plan.xlsx',
  sheets: [
    { name: 'Spaced Revision', truncated: false, rows: [['Topic'], []] },
    { name: 'Big', truncated: true, rows: [] },
  ],
});

it('resolves with the sheets the phone read', async () => {
  (NativeModules.BackupFiles.pickSpreadsheet as jest.Mock).mockResolvedValue(
    json,
  );
  await expect(pickSpreadsheet()).resolves.toEqual({
    fileName: 'plan.xlsx',
    sheets: [
      { name: 'Spaced Revision', truncated: false, rows: [['Topic'], []] },
      { name: 'Big', truncated: true, rows: [] },
    ],
  });
});

it('passes on the picker rejection codes', async () => {
  (NativeModules.BackupFiles.pickSpreadsheet as jest.Mock).mockRejectedValue({
    code: SPREADSHEET_ERROR.oldXls,
  });
  await expect(pickSpreadsheet()).rejects.toEqual({ code: 'E_OLD_XLS' });
});

it.each(['{nope', '{}', '{"sheets":[{"name":"S","rows":[[1]]}]}', 'null'])(
  'treats malformed native output %p as a read failure',
  input => {
    expect(() => parseSpreadsheetJson(input)).toThrow(
      expect.objectContaining({ code: SPREADSHEET_ERROR.readFailed }),
    );
  },
);

it('fails with a read error when the native module is missing', async () => {
  NativeModules.BackupFiles = {};
  await expect(pickSpreadsheet()).rejects.toMatchObject({
    code: 'E_FILE_READ',
  });
});
