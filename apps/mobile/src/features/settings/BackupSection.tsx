import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  checkBackup,
  badJsonProblem,
  findLegacyOverflows,
} from '@planner/shared';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { canRetry, isSessionEndedError } from '../../shared/api/errors';
import { pickBackupFile } from '../../native/backupFiles';
import { useExportToFile, useImportBackup } from '../backup/hooks';
import { ExcelImport } from './ExcelImport';
import {
  BACKUP_STATUS,
  TOO_LARGE_TEXT,
  backupSummary,
  importErrorMessage,
  importResultMessage,
  overflowText,
  pickErrorMessage,
  summaryText,
  tooLargeToUpload,
  type BackupSummary,
} from '../backup/messages';

type Step = 'none' | 'mode' | 'exportFirst';
type Running = null | 'export' | 'import';

/** A checked backup file waiting for the user to pick Merge or Replace. */
type Picked = {
  data: unknown;
  summary: BackupSummary;
  overflow: ReturnType<typeof overflowText>;
};

/** Long messages (results, errors with Retry) stay a little longer. */
const RESULT_MS = 8000;
const RETRY_MS = 10_000;

export function BackupSection() {
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
  const { exportToFile } = useExportToFile();
  const importer = useImportBackup();
  const [step, setStep] = useState<Step>('none');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [running, setRunning] = useState<Running>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);

  async function runExport() {
    setRunning('export');
    setStatus(BACKUP_STATUS.exporting);
    try {
      const out = await exportToFile();
      if (out.status === 'saved') snackbar.show({ message: 'Backup saved' });
      else if (out.status === 'failed') snackbar.show({ message: out.message });
    } finally {
      setRunning(null);
      setStatus(null);
    }
  }

  async function startImport() {
    setRunning('import');
    try {
      let text: string;
      try {
        text = await pickBackupFile();
      } catch (e) {
        const message = pickErrorMessage(e);
        if (message) snackbar.show({ message, durationMs: RESULT_MS });
        return;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        snackbar.show({
          message: badJsonProblem().description,
          durationMs: RESULT_MS,
        });
        return;
      }
      const check = checkBackup(raw);
      if (!check.ok) {
        snackbar.show({
          message: check.problems[0].description,
          durationMs: RESULT_MS,
        });
        return;
      }
      // The server cannot receive a request this large: say so now, before
      // the user chooses how to import it.
      if (tooLargeToUpload(raw)) {
        snackbar.show({ message: TOO_LARGE_TEXT, durationMs: RESULT_MS });
        return;
      }
      setPicked({
        data: raw,
        summary: backupSummary(check.backup),
        overflow: overflowText(findLegacyOverflows(raw)),
      });
      setStep('mode');
    } finally {
      setRunning(null);
    }
  }

  async function doImport(
    mode: 'merge' | 'replace',
    file: Picked,
    statusText?: string,
  ) {
    setStep('none');
    setRunning('import');
    setStatus(
      statusText ??
        (mode === 'merge' ? BACKUP_STATUS.merging : BACKUP_STATUS.replacing),
    );
    try {
      const r = await importer.mutateAsync({ mode, data: file.data });
      setPicked(null);
      snackbar.show({
        message: importResultMessage(r, mode),
        durationMs: RESULT_MS,
      });
    } catch (e) {
      if (isSessionEndedError(e)) return;
      // Keep the chosen file: Retry sends it again with the same choice,
      // without the picker or the prompts.
      if (canRetry(e)) {
        snackbar.show({
          message: importErrorMessage(e),
          actionLabel: 'Retry',
          onAction: () => {
            doImport(mode, file);
          },
          durationMs: RETRY_MS,
        });
      } else {
        setPicked(null);
        snackbar.show({
          message: importErrorMessage(e),
          durationMs: RESULT_MS,
        });
      }
    } finally {
      setRunning(null);
      setStatus(null);
    }
  }

  async function exportThenReplace(file: Picked) {
    setStep('none');
    setRunning('export');
    setStatus(BACKUP_STATUS.exporting);
    const out = await exportToFile();
    if (out.status === 'saved') {
      // One message at the end of the whole flow: the import result.
      await doImport('replace', file, BACKUP_STATUS.savedThenReplacing);
      return;
    }
    setRunning(null);
    setStatus(null);
    if (out.status === 'cancelled') {
      // Back to the question, so the user can choose again.
      setStep('exportFirst');
      return;
    }
    snackbar.show({
      message: `${out.message} — nothing was replaced`,
      actionLabel: 'Retry',
      onAction: () => {
        exportThenReplace(file);
      },
      durationMs: RETRY_MS,
    });
  }

  const cancel = () => {
    setStep('none');
    setPicked(null);
  };

  const summaryLine = picked ? summaryText(picked.summary) : null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.muted }}>
        Save all your topics to a file, or restore from one. You can also add
        topics from an Excel sheet.
      </Text>
      <Button
        title="Export backup"
        variant="secondary"
        onPress={runExport}
        loading={running === 'export'}
        disabled={running !== null || excelBusy}
      />
      <Button
        title="Import backup"
        variant="secondary"
        onPress={startImport}
        loading={running === 'import'}
        disabled={running !== null || excelBusy}
      />
      <ExcelImport disabled={running !== null} onBusyChange={setExcelBusy} />
      {status ? (
        <Text
          testID="backup-status"
          accessibilityLiveRegion="polite"
          style={{ color: colors.muted }}
        >
          {status}
        </Text>
      ) : null}
      <Dialog
        visible={step === 'mode' && picked !== null}
        title="Import backup"
        onRequestClose={cancel}
        actions={
          <>
            <Button
              title="Merge (recommended)"
              onPress={() => {
                if (picked) doImport('merge', picked);
              }}
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
        {summaryLine ? (
          <Text
            testID="backup-summary"
            style={{
              color: colors.text,
              fontWeight: '700',
              marginBottom: spacing.sm,
            }}
          >
            {summaryLine}
          </Text>
        ) : null}
        {picked?.overflow ? (
          <View
            testID="backup-overflow"
            style={{ marginBottom: spacing.sm, gap: spacing.xs }}
          >
            <Text style={{ color: colors.text }}>{picked.overflow.text}</Text>
            {picked.overflow.names.map((name, i) => (
              <Text key={`${i}-${name}`} style={{ color: colors.muted }}>
                {`• ${name}`}
              </Text>
            ))}
            {picked.overflow.more > 0 ? (
              <Text style={{ color: colors.muted }}>
                {`and ${picked.overflow.more} more`}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Text style={{ color: colors.text, marginBottom: spacing.sm }}>
          Merge adds the topics, exams, subjects and mock tests from the backup
          to what you have. Your settings stay as they are.
        </Text>
        <Text style={{ color: colors.text }}>
          Replace everything clears your current data first, then also restores
          the reminder time and revision intervals from the backup.
        </Text>
      </Dialog>
      <Dialog
        visible={step === 'exportFirst' && picked !== null}
        title="Export a backup first?"
        onRequestClose={cancel}
        actions={
          <>
            <Button
              title="Export first"
              onPress={() => {
                if (picked) exportThenReplace(picked);
              }}
            />
            <Button
              title="Continue without export"
              variant="danger"
              onPress={() => {
                if (picked) doImport('replace', picked);
              }}
            />
            <Button title="Cancel" variant="text" onPress={cancel} />
          </>
        }
      >
        {summaryLine ? (
          <Text
            style={{
              color: colors.text,
              fontWeight: '700',
              marginBottom: spacing.sm,
            }}
          >
            {summaryLine}
          </Text>
        ) : null}
        <Text style={{ color: colors.text }}>
          Replacing removes your current topics. A backup of them lets you undo
          this.
        </Text>
      </Dialog>
    </View>
  );
}
