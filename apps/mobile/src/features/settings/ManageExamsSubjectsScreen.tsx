import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { localToday, type ExamView, type SubjectView } from '@planner/shared';
import { ApiError, userMessage } from '../../shared/api/errors';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { DateField } from '../../shared/ui/DateField';
import { Dialog } from '../../shared/ui/Dialog';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { Screen } from '../../shared/ui/Screen';
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
import {
  useCreateSubject,
  useDeleteSubject,
  useSubjects,
  useUpdateSubject,
} from '../subjects/hooks';

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

function saveErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.code === 'DUPLICATE_NAME') {
    return 'You already have one with that name.';
  }
  return userMessage(e);
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
  const snackbar = useSnackbar();
  const examsQ = useExams();
  const subjectsQ = useSubjects();
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

  useRefetchOnFocus(examsQ.refetch, subjectsQ.refetch);

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
      // Keep the dialog open with the draft.
      setError(saveErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm || deleting) return;
    const c = confirm;
    setDeleting(true);
    try {
      if (c.kind === 'exam') await deleteExam.mutateAsync(c.exam.id);
      else await deleteSubject.mutateAsync(c.subject.id);
      setConfirm(null);
    } catch (e) {
      setConfirm(null);
      // Already gone (for example deleted on another device): that is fine.
      if (e instanceof ApiError && e.code === 'NOT_FOUND') return;
      snackbar.show({
        message:
          e instanceof ApiError && e.code === 'SUBJECT_IN_USE'
            ? 'Move or delete its topics first'
            : userMessage(e),
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
  const heading = {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: spacing.sm,
  };
  const adding = edit?.kind === 'addExam' || edit?.kind === 'addSubject';

  return (
    <Screen scroll>
      <Text accessibilityRole="header" style={heading}>
        Exams
      </Text>
      <Card style={{ marginBottom: spacing.xl }}>
        {exams.length === 0 ? (
          <Text style={{ color: colors.muted }}>No exams yet.</Text>
        ) : null}
        {exams.map(exam => (
          <Row
            key={exam.id}
            title={exam.name}
            subtitle={
              exam.examDate ? formatDate(exam.examDate, today) : 'No date set'
            }
          >
            <Button
              title="Rename"
              variant="secondary"
              onPress={() =>
                openEdit({ kind: 'renameExam', exam, name: exam.name })
              }
            />
            <Button
              title="Edit date"
              variant="secondary"
              onPress={() =>
                openEdit({ kind: 'dateExam', exam, date: exam.examDate ?? '' })
              }
            />
            <Button
              title="Delete"
              variant="text"
              onPress={() => setConfirm({ kind: 'exam', exam })}
            />
          </Row>
        ))}
        <View style={{ marginTop: spacing.sm }}>
          <Button
            title="Add exam"
            variant="secondary"
            onPress={() => openEdit({ kind: 'addExam', name: '', date: '' })}
          />
        </View>
      </Card>

      <Text accessibilityRole="header" style={heading}>
        Subjects
      </Text>
      <Card>
        {subjects.length === 0 ? (
          <Text style={{ color: colors.muted }}>No subjects yet.</Text>
        ) : null}
        {subjects.map(subject => (
          <Row
            key={subject.id}
            title={subject.name}
            subtitle={`${subject.topicCount} ${
              subject.topicCount === 1 ? 'topic' : 'topics'
            }`}
          >
            <Button
              title="Rename"
              variant="secondary"
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
              variant="text"
              onPress={() => setConfirm({ kind: 'subject', subject })}
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

      <Dialog
        visible={confirm !== null}
        title={confirm?.kind === 'exam' ? 'Delete exam?' : 'Delete subject?'}
        onRequestClose={closeConfirm}
        actions={
          <>
            <Button
              title="Delete"
              variant="danger"
              onPress={remove}
              loading={deleting}
            />
            <Button
              title="Cancel"
              variant="text"
              onPress={closeConfirm}
              disabled={deleting}
            />
          </>
        }
      >
        <Text style={{ color: colors.text }}>
          {confirm?.kind === 'exam'
            ? 'Topics keep existing; the exam is removed from them'
            : 'A subject can only be deleted when it has no topics.'}
        </Text>
      </Dialog>
    </Screen>
  );
}
