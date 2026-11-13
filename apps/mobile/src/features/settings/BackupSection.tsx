import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { userMessage } from '../../shared/api/errors';
import { pickBackupFile, saveBackupFile } from '../../native/backupFiles';
import { useExportBackup, useImportBackup } from '../backup/hooks';

type Step = 'none' | 'mode' | 'exportFirst';

const isCancel = (e: unknown) =>
  (e as { code?: string } | null)?.code === 'E_CANCELLED';

export function BackupSection() {
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
  const exporter = useExportBackup();
  const importer = useImportBackup();
  const [step, setStep] = useState<Step>('none');
  const [data, setData] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  /** Returns true when a file was written. */
  async function exportFlow(): Promise<boolean> {
    try {
      const backup = await exporter.mutateAsync();
      await saveBackupFile(JSON.stringify(backup, null, 2));
      snackbar.show({ message: 'Backup saved' });
      return true;
    } catch (e) {
      if (!isCancel(e)) {
        snackbar.show({
          message:
            e instanceof Error && !('code' in e) ? e.message : userMessage(e),
        });
      }
      return false;
    }
  }

  async function runExport() {
    setBusy(true);
    try {
      await exportFlow();
    } finally {
      setBusy(false);
    }
  }

  async function startImport() {
    setBusy(true);
    try {
      let text: string;
      try {
        text = await pickBackupFile();
      } catch (e) {
        if (!isCancel(e)) {
          snackbar.show({ message: "Couldn't open that file" });
        }
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      if (parsed === null || typeof parsed !== 'object') {
        snackbar.show({ message: 'This file is not a Study Planner backup' });
        return;
      }
      setData(parsed);
      setStep('mode');
    } finally {
      setBusy(false);
    }
  }

  async function doImport(mode: 'merge' | 'replace', payload: unknown) {
    setStep('none');
    setBusy(true);
    try {
      const r = await importer.mutateAsync({ mode, data: payload });
      snackbar.show({
        message: `Imported ${r.imported.topics} topics (${r.skipped.topics} skipped)`,
      });
    } catch (e) {
      snackbar.show({ message: userMessage(e) });
    } finally {
      setBusy(false);
      setData(null);
    }
  }

  async function exportThenReplace() {
    setStep('none');
    setBusy(true);
    let ok = false;
    try {
      ok = await exportFlow();
    } finally {
      setBusy(false);
    }
    if (ok) await doImport('replace', data);
    else setData(null);
  }

  const cancel = () => {
    setStep('none');
    setData(null);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.muted }}>
        Save all your topics to a file, or restore from one.
      </Text>
      <Button
        title="Export backup"
        variant="secondary"
        onPress={runExport}
        disabled={busy}
      />
      <Button
        title="Import backup"
        variant="secondary"
        onPress={startImport}
        disabled={busy}
      />
      <Dialog
        visible={step === 'mode'}
        title="Import backup"
        onRequestClose={cancel}
        actions={
          <>
            <Button
              title="Merge (recommended)"
              onPress={() => doImport('merge', data)}
            />
            <Button
              title="Replace everything"
              variant="danger"
              onPress={() => setStep('exportFirst')}
            />
            <Button title="Cancel" variant="text" onPress={cancel} />
          </>
        }
      >
        <Text style={{ color: colors.text }}>
          Merge adds the backup to what you have. Replace everything clears your
          current data first.
        </Text>
      </Dialog>
      <Dialog
        visible={step === 'exportFirst'}
        title="Export a backup first?"
        onRequestClose={cancel}
        actions={
          <>
            <Button title="Export first" onPress={exportThenReplace} />
            <Button
              title="Continue without export"
              variant="danger"
              onPress={() => doImport('replace', data)}
            />
            <Button title="Cancel" variant="text" onPress={cancel} />
          </>
        }
      >
        <Text style={{ color: colors.text }}>
          Replacing removes your current topics. A backup of them lets you undo
          this.
        </Text>
      </Dialog>
    </View>
  );
}
