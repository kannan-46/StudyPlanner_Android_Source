import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  buildSpreadsheetBackup,
  localToday,
  mapSpreadsheet,
  splitExistingTopics,
  type BackupV1Input,
  type ExamView,
  type SpreadsheetFile,
  type SpreadsheetMapping,
} from '@planner/shared';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { canRetry, isSessionEndedError } from '../../shared/api/errors';
import { pickSpreadsheet } from '../../native/spreadsheetFiles';
import { useImportBackup } from '../backup/hooks';
import { count, tooLargeToUpload } from '../backup/messages';
import {
  SPREADSHEET_TEXT,
  detailLines,
  importingText,
  spreadsheetImportError,
  spreadsheetPickError,
  spreadsheetResultMessage,
  subjectLines,
} from '../backup/spreadsheetMessages';

/** A read and checked spreadsheet waiting for Import or Cancel. */
type Preview = {
  fileName: string;
  mapping: SpreadsheetMapping & { sheetName: string };
  /** Topics not in the app yet: the ones that will be imported. */
  freshCount: number;
  /** Topics already in the app (same subject and name): skipped. */
  existingCount: number;
  /** Revisions already done, over the topics that will be imported. */
  doneCount: number;
  /** The user's only exam, which the topics will be linked to. */
  exam: ExamView | null;
  /** The user's usual gaps, used for a sheet with one row per topic. */
  intervals: number[];
  data: BackupV1Input;
};

type Busy = null | 'reading' | 'importing';

const RESULT_MS = 8000;
const RETRY_MS = 10_000;

/**
 * "Import from Excel" in Settings > Backup: reads an .xlsx or .csv file on
 * the phone, shows what it found, then merges the new topics (with the
 * revisions already done) like a backup. Settings are never changed.
 */
export function ExcelImport({
  disabled,
  onBusyChange,
}: {
  /** Another backup action is running. */
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
  const api = useApi();
  const qc = useQueryClient();
  const importer = useImportBackup();
  const [busy, setBusy] = useState<Busy>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    onBusyChange(busy !== null);
  }, [busy, onBusyChange]);

  /** Reads what is in the app now, then builds the preview for `file`. */
  async function analyse(file: SpreadsheetFile) {
    setBusy('reading');
    setStatus(SPREADSHEET_TEXT.reading);
    try {
      const [me, topics, subjects, exams] = await Promise.all([
        qc.fetchQuery({ queryKey: queryKeys.me, queryFn: () => api.me.get() }),
        qc.fetchQuery({
          queryKey: queryKeys.topics({}),
          queryFn: () => api.topics.list({}),
        }),
        qc.fetchQuery({
          queryKey: queryKeys.subjects,
          queryFn: () => api.subjects.list(),
        }),
        qc.fetchQuery({
          queryKey: queryKeys.exams,
          queryFn: () => api.exams.list(),
        }),
      ]);
      const intervals = me.settings.intervals;
      const mapping = mapSpreadsheet(file.sheets, {
        today: localToday(),
        intervals,
      });
      if (mapping.sheetName === null) {
        snackbar.show({
          message: SPREADSHEET_TEXT.noTopics,
          durationMs: RESULT_MS,
        });
        return;
      }
      const subjectName = new Map(subjects.map(s => [s.id, s.name]));
      const split = splitExistingTopics(
        mapping.topics,
        topics.map(t => ({
          subject: subjectName.get(t.subjectId) ?? '',
          name: t.name,
        })),
      );
      const exam = exams.length === 1 ? exams[0] ?? null : null;
      setShowDetails(false);
      setPreview({
        fileName: file.fileName,
        mapping: { ...mapping, sheetName: mapping.sheetName },
        freshCount: split.fresh.length,
        existingCount: split.existing.length,
        doneCount: split.fresh.reduce(
          (n, t) => n + t.doneOn.filter(d => d !== null).length,
          0,
        ),
        exam,
        intervals,
        data: buildSpreadsheetBackup(split.fresh, {
          exam: exam ? { name: exam.name, examDate: exam.examDate } : null,
        }),
      });
    } catch (e) {
      if (isSessionEndedError(e)) return;
      snackbar.show({
        message: SPREADSHEET_TEXT.loadFailed,
        actionLabel: 'Retry',
        onAction: () => {
          analyse(file);
        },
        durationMs: RETRY_MS,
      });
    } finally {
      setBusy(null);
      setStatus(null);
    }
  }

  async function start() {
    setBusy('reading');
    let file: SpreadsheetFile;
    try {
      file = await pickSpreadsheet();
    } catch (e) {
      setBusy(null);
      const message = spreadsheetPickError(e);
      if (message) snackbar.show({ message, durationMs: RESULT_MS });
      return;
    }
    await analyse(file);
  }

  async function doImport(p: Preview) {
    setPreview(null);
    if (tooLargeToUpload(p.data, 'merge')) {
      snackbar.show({
        message: SPREADSHEET_TEXT.tooBigToSend,
        durationMs: RESULT_MS,
      });
      return;
    }
    setBusy('importing');
    setStatus(importingText(p.freshCount));
    try {
      const r = await importer.mutateAsync({ mode: 'merge', data: p.data });
      snackbar.show({
        message: spreadsheetResultMessage(
          r,
          p.mapping.sheetName,
          p.existingCount,
        ),
        durationMs: RESULT_MS,
      });
    } catch (e) {
      if (isSessionEndedError(e)) return;
      snackbar.show(
        canRetry(e)
          ? {
              message: spreadsheetImportError(e),
              actionLabel: 'Retry',
              onAction: () => {
                doImport(p);
              },
              durationMs: RETRY_MS,
            }
          : { message: spreadsheetImportError(e), durationMs: RESULT_MS },
      );
    } finally {
      setBusy(null);
      setStatus(null);
    }
  }

  const cancel = () => setPreview(null);
  const m = preview?.mapping;
  const details = m ? detailLines(m) : { lines: [], more: 0 };
  const changed = m ? m.skippedRows.length + m.notes.length : 0;
  const defaultGaps =
    preview && m?.layout === 'topics'
      ? `This sheet has one row per topic, so your usual revision gaps (${preview.intervals.join(
          ', ',
        )} days) will be used.`
      : null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Button
        title="Import from Excel"
        variant="secondary"
        onPress={start}
        loading={busy !== null}
        disabled={disabled || busy !== null}
        accessibilityHint="Adds topics and revisions from an .xlsx or .csv file"
      />
      {status ? (
        <Text
          testID="excel-status"
          accessibilityLiveRegion="polite"
          style={{ color: colors.muted }}
        >
          {status}
        </Text>
      ) : null}
      <Dialog
        visible={preview !== null}
        title="Import from Excel"
        onRequestClose={cancel}
        actions={
          preview && preview.freshCount > 0 ? (
            <>
              <Button
                title={`Import ${count(preview.freshCount, 'topic')}`}
                onPress={() => {
                  doImport(preview);
                }}
              />
              <Button title="Cancel" variant="text" onPress={cancel} />
            </>
          ) : (
            <Button title="Close" variant="text" onPress={cancel} />
          )
        }
      >
        {preview && m ? (
          <View testID="excel-preview" style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.muted }}>
              {preview.fileName
                ? `From the "${m.sheetName}" sheet of ${preview.fileName}`
                : `From the "${m.sheetName}" sheet`}
            </Text>
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              {m.topics.length > 0
                ? `Found ${count(m.topics.length, 'topic')}`
                : 'No topics could be read from this sheet.'}
            </Text>
            {subjectLines(m).map(line => (
              <Text key={line} style={{ color: colors.text }}>
                {`• ${line}`}
              </Text>
            ))}
            {preview.existingCount > 0 ? (
              <Text style={{ color: colors.text }}>
                {`${count(preview.existingCount, 'topic')} ${
                  preview.existingCount === 1 ? 'looks' : 'look'
                } like ${
                  preview.existingCount === 1 ? 'it is' : 'they are'
                } already in your planner and will be skipped.`}
              </Text>
            ) : null}
            {preview.freshCount > 0 ? (
              <Text style={{ color: colors.text }}>
                {preview.doneCount > 0
                  ? `${count(
                      preview.doneCount,
                      'revision',
                    )} already done will be marked done.`
                  : 'No revisions are marked done yet.'}
              </Text>
            ) : null}
            {defaultGaps ? (
              <Text style={{ color: colors.text }}>{defaultGaps}</Text>
            ) : null}
            {preview.exam && preview.freshCount > 0 ? (
              <Text style={{ color: colors.text }}>
                {`Topics will be added to your exam ${preview.exam.name}.`}
              </Text>
            ) : null}
            {m.truncated ? (
              <Text style={{ color: colors.text }}>
                Only the first 40,000 rows of this sheet were read.
              </Text>
            ) : null}
            {changed > 0 ? (
              <View style={{ gap: spacing.xs }}>
                <Text style={{ color: colors.text }}>
                  {[
                    m.skippedRows.length > 0
                      ? `${count(m.skippedRows.length, 'row')} skipped`
                      : null,
                    m.notes.length > 0
                      ? `${count(
                          m.notes.length,
                          'topic',
                        )} imported with a change`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  .
                </Text>
                <Button
                  title={showDetails ? 'Hide details' : 'Show details'}
                  variant="text"
                  onPress={() => setShowDetails(v => !v)}
                />
                {showDetails ? (
                  <View testID="excel-details" style={{ gap: spacing.xs }}>
                    {details.lines.map(line => (
                      <Text key={line} style={{ color: colors.muted }}>
                        {line}
                      </Text>
                    ))}
                    {details.more > 0 ? (
                      <Text style={{ color: colors.muted }}>
                        {`and ${details.more} more`}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
            <Text style={{ color: colors.muted }}>
              Your settings and the topics you already have stay as they are.
            </Text>
          </View>
        ) : null}
      </Dialog>
    </View>
  );
}
