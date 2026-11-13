import { NativeModules } from 'react-native';

// Wrappers over the native "BackupFiles" module (BackupFilesModule.kt).

interface BackupFilesNative {
  exportBackup?: (json: string) => Promise<void>;
  importBackup?: () => Promise<string>;
}

function native(): BackupFilesNative {
  const mod = NativeModules.BackupFiles as BackupFilesNative | undefined;
  if (!mod?.exportBackup || !mod.importBackup) {
    throw new Error('Backup files are not available on this device.');
  }
  return mod;
}

/** Opens the system save dialog and writes `json`. Rejects with code E_CANCELLED if dismissed. */
export async function saveBackupFile(json: string): Promise<void> {
  await native().exportBackup!(json);
}

/** Opens the system file picker and resolves with the file's text. Rejects with E_CANCELLED if dismissed. */
export async function pickBackupFile(): Promise<string> {
  return native().importBackup!();
}
