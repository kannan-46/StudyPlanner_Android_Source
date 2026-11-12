import React, {useEffect, useRef, useState} from 'react';
import {KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View} from 'react-native';
import type {Exam, Topic} from '../types/planner';
import {addDays, localDateString, reviseTopicSchedule} from '../planner/revisions';
import {PickerField} from '../ui/PickerField';
import type {Theme} from '../ui/theme';
import {Button, Card, Chip, Field, Heading, Notice, MutedText} from '../ui/components';

const examOptions: Exam[] = ['MS General Surgery', 'NEET SS', 'Both'];

export function TopicEditorModal({
  visible,
  existing,
  defaultIntervals,
  theme,
  onClose,
  onSave,
}: {
  visible: boolean;
  existing: Topic | null;
  defaultIntervals: number[];
  theme: Theme;
  onClose: () => void;
  onSave: (topic: Topic, oldId?: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [exam, setExam] = useState<Exam>('NEET SS');
  const [subject, setSubject] = useState('');
  const [studyDate, setStudyDate] = useState(localDateString());
  const [intervalsText, setIntervalsText] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const wasOpen = useRef(false);
  const openedTopicId = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) {
      wasOpen.current = false;
      return;
    }
    const topicId = existing?.id ?? null;
    if (wasOpen.current && openedTopicId.current === topicId) return;
    wasOpen.current = true;
    openedTopicId.current = topicId;
    setName(existing?.name ?? '');
    setExam(existing?.exam ?? 'NEET SS');
    setSubject(existing?.subject ?? '');
    setStudyDate(existing?.studyDate ?? localDateString());
    setIntervalsText((existing?.intervals ?? defaultIntervals).join(','));
    setNotes(existing?.notes ?? '');
    setError(null);
  }, [visible, existing, defaultIntervals]);

  const submit = async () => {
    setError(null);
    const intervals = intervalsText.split(',').map(value => Number(value.trim()));
    const validDate = isValidDate(studyDate);
    if (!name.trim()) {
      setError('Add a topic name.');
      return;
    }
    if (!validDate) {
      setError('Enter the study date as YYYY-MM-DD.');
      return;
    }
    if (!intervals.length || intervals.some(value => !Number.isInteger(value) || value < 1 || value > 999)) {
      setError('Enter revision intervals as whole days from 1 to 999, separated by commas.');
      return;
    }
    if (intervals.length > 20) {
      setError('Use no more than 20 revision intervals.');
      return;
    }

    const changedSchedule = !existing || existing.studyDate !== studyDate ||
      JSON.stringify(existing.intervals) !== JSON.stringify(intervals);
    const topic: Topic = {
      id: existing?.id ?? makeId(),
      name: name.trim(),
      exam,
      subject: subject.trim(),
      studyDate,
      intervals,
      notes: notes.trim(),
      revisions: existing && !changedSchedule
        ? existing.revisions
        : reviseTopicSchedule(existing ?? {
            id: '', name: '', exam, subject: '', studyDate, intervals: [], notes: '', revisions: [],
          }, studyDate, intervals).map(revision => ({
            ...revision,
            date: addDays(studyDate, revision.day),
          })),
    };

    setSaving(true);
    try {
      await onSave(topic, existing?.id);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this topic.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.root, {backgroundColor: theme.background}]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topRow}>
            <Heading theme={theme}>{existing ? 'Edit topic' : 'Add a topic'}</Heading>
            <Button theme={theme} kind="text" label="Close" onPress={onClose} />
          </View>
          <Card theme={theme}>
            {error ? <Notice theme={theme} danger>{error}</Notice> : null}
            <Field theme={theme} label="Topic name" value={name} onChangeText={setName} placeholder="e.g. Thyroid surgery" maxLength={240} />
            <View style={styles.fieldGroup}>
              <MutedText theme={theme}>Exam</MutedText>
              <View style={styles.chips}>
                {examOptions.map(option => (
                  <Chip key={option} theme={theme} label={option} selected={exam === option} onPress={() => setExam(option)} />
                ))}
              </View>
            </View>
            <Field theme={theme} label="Subject" value={subject} onChangeText={setSubject} placeholder="e.g. Endocrine surgery" maxLength={200} />
            <PickerField theme={theme} label="Study date" value={studyDate} mode="date" onChange={setStudyDate} />
            <Field theme={theme} label="Revision intervals (days)" value={intervalsText} onChangeText={setIntervalsText} placeholder="4,7,15,30,60,90" keyboardType="numbers-and-punctuation" />
            <MutedText theme={theme}>Changing the date or intervals updates the schedule and keeps completed revisions with matching day numbers.</MutedText>
            <Field theme={theme} label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional notes" multiline maxLength={10000} />
            <Button theme={theme} label={existing ? 'Save changes' : 'Save topic'} busy={saving} onPress={() => void submit()} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDateString(parsed) === value;
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {padding: 18, paddingBottom: 34, gap: 14},
  topRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  fieldGroup: {gap: 8},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
