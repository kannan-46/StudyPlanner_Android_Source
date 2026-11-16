import { NativeModules } from 'react-native';
import { localToday, type LocalDate } from '@planner/shared';

// Wrappers over the native "BackupFiles" module (BackupFilesModule.kt).

/** Rejection code when the picked backup file is larger than the app reads. */
export const BACKUP_TOO_LARGE = 'E_TOO_LARGE';

/** Largest backup file the app reads, in bytes (8 MiB). */
export const MAX_BACKUP_FILE_BYTES = 8 * 1024 * 1024;

interface BackupFilesNative {
  exportBackup?: (json: string, fileName: string) => Promise<void>;
  importBackup?: () => Promise<string>;
}

function native(): BackupFilesNative {
  const mod = NativeModules.BackupFiles as BackupFilesNative | undefined;
  if (!mod?.exportBackup || !mod.importBackup) {
    throw new Error('Backup files are not available on this device.');
  }
  return mod;
}

/** The suggested name for a backup saved on `date`, e.g. surgical-study-planner-backup-2026-11-16.json. */
export function backupFileName(date: LocalDate = localToday()): string {
  return `surgical-study-planner-backup-${date}.json`;
}

/**
 * Opens the system save dialog, suggesting `fileName` (default: today's dated
 * name), and writes `json`. Rejects with code E_CANCELLED if dismissed. Shows
 * no message of its own: the caller confirms.
 */
export async function saveBackupFile(
  json: string,
  fileName: string = backupFileName(),
): Promise<void> {
  await native().exportBackup!(json, fileName);
}

/**
 * Opens the system file picker and resolves with the file's text. Rejects with
 * E_CANCELLED if dismissed, with BACKUP_TOO_LARGE (`E_TOO_LARGE`) when the file
 * is over MAX_BACKUP_FILE_BYTES, and E_FILE_READ for other read errors.
 */
export async function pickBackupFile(): Promise<string> {
  return native().importBackup!();
}
