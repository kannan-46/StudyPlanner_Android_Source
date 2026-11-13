import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { localToday, type ExamView, type SubjectView } from '@planner/shared';
import { ApiError, userMessage } from '../../shared/api/errors';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { DateField } from '../../shared/ui/DateField';
import { Dialog } from '../../shared/ui/Dialog';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { TextField } from '../../shared/ui/TextField';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { formatDate } from '../../shared/lib/format';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { useDeleteExam, useExams, useUpdateExam } from '../exams/hooks';
import {
  useDeleteSubject,
  useSubjects,
  useUpdateSubject,
} from '../subjects/hooks';

type Edit =
  | { kind: 'renameExam'; exam: ExamView; name: string }
  | { kind: 'dateExam'; exam: ExamView; date: string }
  | { kind: 'renameSubject'; subject: SubjectView; name: string }
  | null;

type Confirm =
  | { kind: 'exam'; exam: ExamView }
  | { kind: 'subject'; subject: SubjectView }
  | null;

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
  const updateExam = useUpdateExam();
  const deleteExam = useDeleteExam();
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();
  const [edit, setEdit] = useState<Edit>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState<string | null>(null);

  useRefetchOnFocus(examsQ.refetch, subjectsQ.refetch);

  async function save() {
    if (!edit) return;
    setError(null);
    try {
      if (edit.kind === 'dateExam') {
        await updateExam.mutateAsync({
          id: edit.exam.id,
          patch: { examDate: edit.date || null },
        });
      } else {
        const name = edit.name.trim();
        if (!name) {
          setError('Enter a name');
          return;
        }
        if (edit.kind === 'renameExam') {
          await updateExam.mutateAsync({ id: edit.exam.id, patch: { name } });
        } else {
          await updateSubject.mutateAsync({
            id: edit.subject.id,
            patch: { name },
          });
        }
      }
      setEdit(null);
    } catch (e) {
      // Keep the dialog open with the draft.
      setError(userMessage(e));
    }
  }

  async function remove() {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    try {
      if (c.kind === 'exam') await deleteExam.mutateAsync(c.exam.id);
      else await deleteSubject.mutateAsync(c.subject.id);
    } catch (e) {
      snackbar.show({
        message:
          e instanceof ApiError && e.code === 'SUBJECT_IN_USE'
            ? 'Move or delete its topics first'
            : userMessage(e),
      });
    }
  }

  if (examsQ.isLoading || subjectsQ.isLoading) {
    return (
      <Screen scroll>
        <ActivityIndicator />
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
              onPress={() => {
                setError(null);
                setEdit({ kind: 'renameExam', exam, name: exam.name });
              }}
            />
            <Button
              title="Edit date"
              variant="secondary"
              onPress={() => {
                setError(null);
                setEdit({
                  kind: 'dateExam',
                  exam,
                  date: exam.examDate ?? today,
                });
              }}
            />
            <Button
              title="Delete"
              variant="text"
              onPress={() => setConfirm({ kind: 'exam', exam })}
            />
          </Row>
        ))}
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
              onPress={() => {
                setError(null);
                setEdit({
                  kind: 'renameSubject',
                  subject,
                  name: subject.name,
                });
              }}
            />
            <Button
              title="Delete"
              variant="text"
              onPress={() => setConfirm({ kind: 'subject', subject })}
            />
          </Row>
        ))}
      </Card>

      <Dialog
        visible={edit !== null}
        title={edit?.kind === 'dateExam' ? 'Exam date' : 'Rename'}
        onRequestClose={() => setEdit(null)}
        actions={
          <>
            <Button title="Save" onPress={save} />
            <Button
              title="Cancel"
              variant="text"
              onPress={() => setEdit(null)}
            />
          </>
        }
      >
        {edit && edit.kind !== 'dateExam' ? (
          <TextField
            label="Name"
            value={edit.name}
            onChangeText={name => setEdit({ ...edit, name })}
          />
        ) : null}
        {edit && edit.kind === 'dateExam' ? (
          <>
            <DateField
              label="Exam date"
              value={edit.date || today}
              onChange={date => setEdit({ ...edit, date })}
            />
            <Button
              title="Clear date"
              variant="text"
              onPress={() => setEdit({ ...edit, date: '' })}
            />
          </>
        ) : null}
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      </Dialog>

      <Dialog
        visible={confirm !== null}
        title={confirm?.kind === 'exam' ? 'Delete exam?' : 'Delete subject?'}
        onRequestClose={() => setConfirm(null)}
        actions={
          <>
            <Button title="Delete" variant="danger" onPress={remove} />
            <Button
              title="Cancel"
              variant="text"
              onPress={() => setConfirm(null)}
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
