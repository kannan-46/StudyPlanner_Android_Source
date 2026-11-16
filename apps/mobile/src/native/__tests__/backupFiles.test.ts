import { NativeModules } from 'react-native';
import {
  BACKUP_TOO_LARGE,
  MAX_BACKUP_FILE_BYTES,
  backupFileName,
  pickBackupFile,
  saveBackupFile,
} from '../backupFiles';

// Only the date helpers are needed; keeps this test apart from the rest of
// the shared package.
jest.mock('@planner/shared', () =>
  jest.requireActual('../../../../../packages/shared/src/domain/dates'),
);

const original = NativeModules.BackupFiles;
afterEach(() => {
  NativeModules.BackupFiles = original;
  jest.clearAllMocks();
  jest.useRealTimers();
});

it('names a backup after the date it was saved', () => {
  expect(backupFileName('2026-11-16')).toBe(
    'surgical-study-planner-backup-2026-11-16.json',
  );
});

it("uses the phone's local date by default", () => {
  // 23:30 local time: the file is named for today, not tomorrow in UTC.
  jest.useFakeTimers({ now: new Date(2026, 10, 16, 23, 30) });
  expect(backupFileName()).toBe(
    'surgical-study-planner-backup-2026-11-16.json',
  );
});

it("suggests today's dated name when saving", async () => {
  jest.useFakeTimers({ now: new Date(2026, 10, 16, 9, 0) });
  await saveBackupFile('{"a":1}');
  expect(NativeModules.BackupFiles.exportBackup).toHaveBeenCalledWith(
    '{"a":1}',
    'surgical-study-planner-backup-2026-11-16.json',
  );
});

it('passes a given file name through', async () => {
  await saveBackupFile('{}', 'mine.json');
  expect(NativeModules.BackupFiles.exportBackup).toHaveBeenCalledWith(
    '{}',
    'mine.json',
  );
});

it('passes the too-large rejection code through', async () => {
  NativeModules.BackupFiles.importBackup.mockRejectedValueOnce(
    Object.assign(new Error('Backup file is too large.'), {
      code: 'E_TOO_LARGE',
    }),
  );
  await expect(pickBackupFile()).rejects.toMatchObject({
    code: BACKUP_TOO_LARGE,
  });
  expect(MAX_BACKUP_FILE_BYTES).toBe(8 * 1024 * 1024);
});

it('throws a plain message when the module is missing', async () => {
  NativeModules.BackupFiles = undefined;
  await expect(saveBackupFile('{}')).rejects.toThrow(
    'Backup files are not available on this device.',
  );
});
