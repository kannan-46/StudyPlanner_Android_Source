import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { localToday, type ExamView, type SubjectView } from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import {
  ApiError,
  isSessionEndedError,
  userMessage,
} from '../../shared/api/errors';
import { useAnnounce } from '../../shared/ui/announce';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { DateField } from '../../shared/ui/DateField';
import { Dialog } from '../../shared/ui/Dialog';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { Screen } from '../../shared/ui/Screen';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { TextField } from '../../shared/ui/TextField';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { formatDate } from '../../shared/lib/format';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import {
  useCreateExam,
  useDeleteExam,
  useExams,
  useUpdateExam,
} from '../exams/hooks';
import { useMockTests, useStats } from '../progress/hooks';
import {
  useCreateSubject,
  useDeleteSubject,
  useSubjects,
  useUpdateSubject,
} from '../subjects/hooks';
import { topicsForSubject } from '../subjects/showTopics';

type Edit =
  | { kind: 'addExam'; name: string; date: string }
  | { kind: 'addSubject'; name: string }
  | { kind: 'renameExam'; exam: ExamView; name: string }
  | { kind: 'dateExam'; exam: ExamView; date: string }
  | { kind: 'renameSubject'; subject: SubjectView; name: string }
  | null;

type Confirm =
  | { kind: 'exam'; exam: ExamView }
  | { kind: 'subject'; subject: SubjectView }
  | null;

const EDIT_TITLES: Record<NonNullable<Edit>['kind'], string> = {
  addExam: 'Add exam',
  addSubject: 'Add subject',
  renameExam: 'Rename exam',
  dateExam: 'Exam date',
  renameSubject: 'Rename subject',
};

const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ');

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const joinAnd = (parts: string[]) =>
  parts.length <= 1
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/**
 * What deleting an exam does, with counts when they are known: the topics
 * and mock tests stay, they just lose the link to the exam.
 */
export function examDeleteMessage(
  name: string,
  topicCount?: number,
  mockTestCount?: number,
): string {
  if (topicCount === undefined || mockTestCount === undefined) {
    return `Your topics and mock tests will stay, but won't be linked to ${name} any more.`;
  }
  const parts: string[] = [];
  if (topicCount > 0) parts.push(plural(topicCount, 'topic'));
  if (mockTestCount > 0) parts.push(plural(mockTestCount, 'mock test'));
  if (parts.length === 0) {
    return `No topics or mock tests are linked to ${name}, so nothing else changes.`;
  }
  return `Your ${joinAnd(
    parts,
  )} will stay, but won't be linked to ${name} any more.`;
}

/** Why a subject that still has topics can't be deleted yet. */
export function subjectInUseMessage(name: string, topicCount: number): string {
  const them = topicCount === 1 ? 'it' : 'them';
  return `${name} still has ${plural(
    topicCount,
    'topic',
  )} (completed ones count too). Move ${them} to another subject or delete ${them} first.`;
}

function Row({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        paddingVertical: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: colors.muted }}>{subtitle}</Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginTop: spacing.xs,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function ManageExamsSubjectsScreen() {
  const { colors, spacing } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const snackbar = useSnackbar();
  const examsQ = useExams();
  const subjectsQ = useSubjects();
  // Only for the counts on exam rows and in the delete dialog; the screen
  // works without them.
  const statsQ = useStats();
  const testsQ = useMockTests();
  const createExam = useCreateExam();
  const updateExam = useUpdateExam();
  const deleteExam = useDeleteExam();
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();
  const [edit, setEdit] = useState<Edit>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useAnnounce(edit ? error : null);

  useRefetchOnFocus(examsQ.refetch, subjectsQ.refetch);

  const examTopicCounts = useMemo(() => {
    const byExam = (statsQ.data as { byExam?: unknown } | undefined)?.byExam;
    if (!Array.isArray(byExam)) return null;
    return new Map(
      (byExam as { examId: string; topicCount: number }[]).map(e => [
        e.examId,
        e.topicCount,
      ]),
    );
  }, [statsQ.data]);
  const examMockCounts = useMemo(() => {
    if (!Array.isArray(testsQ.data)) return null;
    const m = new Map<string, number>();
    for (const t of testsQ.data) {
      if (t.examId) m.set(t.examId, (m.get(t.examId) ?? 0) + 1);
    }
    return m;
  }, [testsQ.data]);
  const topicCountOf = (exam: ExamView) =>
    examTopicCounts ? examTopicCounts.get(exam.id) ?? 0 : undefined;
  const mockCountOf = (exam: ExamView) =>
    examMockCounts ? examMockCounts.get(exam.id) ?? 0 : undefined;

  const openEdit = (next: NonNullable<Edit>) => {
    setError(null);
    setEdit(next);
  };
  // While a request runs the dialog stays put, so it cannot be sent twice.
  const closeEdit = () => {
    if (!saving) setEdit(null);
  };
  const closeConfirm = () => {
    if (!deleting) setConfirm(null);
  };
  const askDelete = (next: NonNullable<Confirm>) => {
    // The counts decide what the dialog offers, so make sure they are fresh.
    if (next.kind === 'subject') subjectsQ.refetch();
    else {
      statsQ.refetch();
      testsQ.refetch();
    }
    setConfirm(next);
  };
  const showTopics = (subjectId: string) =>
    navigation.navigate('MainTabs', topicsForSubject(subjectId));

  async function save() {
    if (!edit || saving) return;
    setError(null);
    let name = '';
    if (edit.kind !== 'dateExam') {
      name = cleanName(edit.name);
      if (!name) {
        setError('Enter a name');
        return;
      }
    }
    setSaving(true);
    try {
      if (edit.kind === 'dateExam') {
        await updateExam.mutateAsync({
          id: edit.exam.id,
          patch: { examDate: edit.date || null },
        });
      } else if (edit.kind === 'addExam') {
        await createExam.mutateAsync(
          edit.date ? { name, examDate: edit.date } : { name },
        );
      } else if (edit.kind === 'addSubject') {
        await createSubject.mutateAsync({ name });
      } else if (edit.kind === 'renameExam') {
        await updateExam.mutateAsync({ id: edit.exam.id, patch: { name } });
      } else {
        await updateSubject.mutateAsync({
          id: edit.subject.id,
          patch: { name },
        });
      }
      if (edit.kind === 'addExam' || edit.kind === 'addSubject') {
        snackbar.show({ message: `${name} added` });
      }
      setEdit(null);
    } catch (e) {
      if (isSessionEndedError(e)) {
        setEdit(null);
        return;
      }
      // Keep the dialog open with the draft.
      const isExam =
        edit.kind === 'addExam' ||
        edit.kind === 'renameExam' ||
        edit.kind === 'dateExam';
      setError(userMessage(e, isExam ? 'exam' : 'subject'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm || deleting) return;
    const c = confirm;
    const name = c.kind === 'exam' ? c.exam.name : c.subject.name;
    setDeleting(true);
    try {
      if (c.kind === 'exam') await deleteExam.mutateAsync(c.exam.id);
      else await deleteSubject.mutateAsync(c.subject.id);
      setConfirm(null);
      snackbar.show({ message: `${name} deleted` });
    } catch (e) {
      setConfirm(null);
      // Already gone (for example deleted on another device): that is fine.
      if (e instanceof ApiError && e.code === 'NOT_FOUND') return;
      if (isSessionEndedError(e)) return;
      if (
        c.kind === 'subject' &&
        e instanceof ApiError &&
        e.code === 'SUBJECT_IN_USE'
      ) {
        const subjectId = c.subject.id;
        snackbar.show({
          message: userMessage(e, 'subject'),
          actionLabel: 'Show topics',
          onAction: () => showTopics(subjectId),
        });
        return;
      }
      snackbar.show({
        message: userMessage(e, c.kind === 'exam' ? 'exam' : 'subject'),
      });
    } finally {
      setDeleting(false);
    }
  }

  if (examsQ.isLoading || subjectsQ.isLoading) {
    return (
      <Screen scroll>
        <Loading />
      </Screen>
    );
  }
  if (
    (examsQ.isError && !examsQ.data) ||
    (subjectsQ.isError && !subjectsQ.data)
  ) {
    return (
      <Screen scroll>
        <ErrorRetry
          error={examsQ.error ?? subjectsQ.error}
          onRetry={() => {
            examsQ.refetch();
            subjectsQ.refetch();
          }}
        />
      </Screen>
    );
  }

  const exams = examsQ.data ?? [];
  const subjects = subjectsQ.data ?? [];
  const today = localToday();
  const adding = edit?.kind === 'addExam' || edit?.kind === 'addSubject';
  const renaming =
    edit?.kind === 'renameExam' || edit?.kind === 'renameSubject';

  // The latest copy of the subject being deleted (its count may have changed
  // since the dialog opened).
  const confirmSubject =
    confirm?.kind === 'subject'
      ? subjects.find(s => s.id === confirm.subject.id) ?? confirm.subject
      : null;
  const subjectInUse = !!confirmSubject && confirmSubject.topicCount > 0;
  const confirmExam = confirm?.kind === 'exam' ? confirm.exam : null;

  let confirmTitle = '';
  let confirmMessage = '';
  if (confirmExam) {
    confirmTitle = `Delete ${confirmExam.name}?`;
    confirmMessage = examDeleteMessage(
      confirmExam.name,
      topicCountOf(confirmExam),
      mockCountOf(confirmExam),
    );
  } else if (confirmSubject) {
    confirmTitle = `Delete ${confirmSubject.name}?`;
    confirmMessage = subjectInUse
      ? subjectInUseMessage(confirmSubject.name, confirmSubject.topicCount)
      : `${confirmSubject.name} has no topics, so nothing else changes.`;
  }

  return (
    <Screen scroll>
      <SectionHeading style={{ marginBottom: spacing.sm }}>
        Exams
      </SectionHeading>
      <Card style={{ marginBottom: spacing.xl }}>
        {exams.length === 0 ? (
          <Text style={{ color: colors.muted }}>No exams yet</Text>
        ) : null}
        {exams.map(exam => {
          const date = exam.examDate
            ? formatDate(exam.examDate, today)
            : 'No date set';
          const topics = topicCountOf(exam);
          return (
            <Row
              key={exam.id}
              title={exam.name}
              subtitle={
                topics === undefined
                  ? date
                  : `${date} · ${plural(topics, 'topic')}`
              }
            >
              <Button
                title="Rename"
                variant="secondary"
                accessibilityLabel={`Rename ${exam.name}`}
                onPress={() =>
                  openEdit({ kind: 'renameExam', exam, name: exam.name })
                }
              />
              <Button
                title="Edit date"
                variant="secondary"
                accessibilityLabel={`Edit date of ${exam.name}`}
                onPress={() =>
                  openEdit({
                    kind: 'dateExam',
                    exam,
                    date: exam.examDate ?? '',
                  })
                }
              />
              <Button
                title="Delete"
                variant="dangerText"
                accessibilityLabel={`Delete ${exam.name}`}
                onPress={() => askDelete({ kind: 'exam', exam })}
              />
            </Row>
          );
        })}
        <View style={{ marginTop: spacing.sm }}>
          <Button
            title="Add exam"
            variant="secondary"
            onPress={() => openEdit({ kind: 'addExam', name: '', date: '' })}
          />
        </View>
      </Card>

      <SectionHeading style={{ marginBottom: spacing.sm }}>
        Subjects
      </SectionHeading>
      <Card>
        {subjects.length === 0 ? (
          <Text style={{ color: colors.muted }}>No subjects yet</Text>
        ) : null}
        {subjects.map(subject => (
          <Row
            key={subject.id}
            title={subject.name}
            subtitle={plural(subject.topicCount, 'topic')}
          >
            <Button
              title="Rename"
              variant="secondary"
              accessibilityLabel={`Rename ${subject.name}`}
              onPress={() =>
                openEdit({
                  kind: 'renameSubject',
                  subject,
                  name: subject.name,
                })
              }
            />
            <Button
              title="Delete"
              variant="dangerText"
              accessibilityLabel={`Delete ${subject.name}`}
              onPress={() => askDelete({ kind: 'subject', subject })}
            />
          </Row>
        ))}
        <View style={{ marginTop: spacing.sm }}>
          <Button
            title="Add subject"
            variant="secondary"
            onPress={() => openEdit({ kind: 'addSubject', name: '' })}
          />
        </View>
      </Card>

      <Dialog
        visible={edit !== null}
        title={edit ? EDIT_TITLES[edit.kind] : ''}
        onRequestClose={closeEdit}
        actions={
          <>
            <Button
              title={adding ? 'Add' : 'Save'}
              onPress={save}
              loading={saving}
            />
            <Button
              title="Cancel"
              variant="text"
              onPress={closeEdit}
              disabled={saving}
            />
          </>
        }
      >
        {edit && edit.kind !== 'dateExam' ? (
          <TextField
            label={
              edit.kind === 'addExam' || edit.kind === 'renameExam'
                ? 'Exam name'
                : 'Subject name'
            }
            value={edit.name}
            maxLength={80}
            // Ready to type at once; a rename selects the old name to replace.
            autoFocus
            selectTextOnFocus={renaming}
            returnKeyType="done"
            // Adding an exam has a date after the name, so Done only closes
            // the keyboard there.
            onSubmitEditing={edit.kind === 'addExam' ? undefined : save}
            onChangeText={name => {
              setError(null);
              setEdit({ ...edit, name });
            }}
          />
        ) : null}
        {edit && (edit.kind === 'dateExam' || edit.kind === 'addExam') ? (
          <>
            <DateField
              label={
                edit.kind === 'addExam' ? 'Exam date (optional)' : 'Exam date'
              }
              value={edit.date || null}
              minimumDate={today}
              onChange={date => setEdit({ ...edit, date })}
            />
            {edit.date ? (
              <Button
                title="Clear date"
                variant="text"
                onPress={() => setEdit({ ...edit, date: '' })}
              />
            ) : null}
          </>
        ) : null}
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      </Dialog>

      <ConfirmDialog
        visible={confirm !== null}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={subjectInUse ? 'Show topics' : 'Delete'}
        cancelLabel={subjectInUse ? 'Close' : 'Cancel'}
        destructive={!subjectInUse}
        busy={deleting}
        onConfirm={() => {
          if (subjectInUse && confirmSubject) {
            setConfirm(null);
            showTopics(confirmSubject.id);
          } else {
            remove();
          }
        }}
        onCancel={closeConfirm}
      />
    </Screen>
  );
}
