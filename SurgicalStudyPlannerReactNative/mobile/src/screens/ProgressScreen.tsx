import React, {useMemo, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {MockTest, PlannerDocument} from '../types/planner';
import {allRevisions, localDateString} from '../planner/revisions';
import {PickerField} from '../ui/PickerField';
import type {Theme} from '../ui/theme';
import {BodyText, Button, Card, Chip, Field, Heading, MutedText, Page, ProgressBar} from '../ui/components';

export function ProgressScreen({
  planner,
  theme,
  saving,
  onAddMockTest,
  onDeleteMockTest,
}: {
  planner: PlannerDocument;
  theme: Theme;
  saving: boolean;
  onAddMockTest: (test: MockTest) => Promise<void>;
  onDeleteMockTest: (id: string) => Promise<void>;
}) {
  const [exam, setExam] = useState<MockTest['exam']>('NEET SS');
  const [date, setDate] = useState(localDateString());
  const [score, setScore] = useState('');
  const [maximum, setMaximum] = useState('100');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const revisions = allRevisions(planner);
  const completed = revisions.filter(revision => revision.done).length;
  const pending = revisions.length - completed;
  const mastered = planner.topics.filter(topic => topic.revisions.length > 0 && topic.revisions.every(revision => revision.done)).length;
  const completion = revisions.length ? completed * 100 / revisions.length : 0;

  const subjects = useMemo(() => {
    const counts = new Map<string, number>();
    planner.topics.forEach(topic => {
      const subject = topic.subject.trim() || 'Uncategorised';
      counts.set(subject, (counts.get(subject) ?? 0) + 1);
    });
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [planner.topics]);

  const addTest = async () => {
    setError(null);
    const scoreValue = Number(score);
    const maxValue = Number(maximum);
    if (!score.trim() || !maximum.trim() || !Number.isFinite(scoreValue) || !Number.isFinite(maxValue) || maxValue <= 0 || scoreValue < 0 || scoreValue > maxValue) {
      setError('Enter a score from 0 up to the maximum marks.');
      return;
    }
    if (!isValidDate(date)) {
      setError('Enter the test date as YYYY-MM-DD.');
      return;
    }
    const test: MockTest = {
      id: makeId(),
      exam,
      date,
      score: scoreValue,
      max: maxValue,
      note: note.trim(),
      percent: Math.round(scoreValue / maxValue * 1_000) / 10,
    };
    try {
      await onAddMockTest(test);
      setScore('');
      setNote('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the mock test.');
    }
  };

  const removeTest = (test: MockTest) => {
    Alert.alert('Delete mock test?', `${test.note || test.exam} will be removed from your results.`, [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => void onDeleteMockTest(test.id)},
    ]);
  };

  return (
    <Page theme={theme}>
      <View>
        <Heading theme={theme}>Progress</Heading>
        <MutedText theme={theme}>Your revision completion and practice results</MutedText>
      </View>
      <View style={styles.summary}>
        <SummaryStat theme={theme} value={String(planner.topics.length)} label="Total topics" />
        <SummaryStat theme={theme} value={String(revisions.length)} label="Total revisions" />
        <SummaryStat theme={theme} value={String(pending)} label="Pending" />
        <SummaryStat theme={theme} value={String(mastered)} label="Fully revised" />
      </View>
      <Card theme={theme}>
        <View style={styles.sectionHeader}>
          <Heading theme={theme}>Revision completion</Heading>
          <MutedText theme={theme}>{Math.round(completion)}%</MutedText>
        </View>
        <ProgressBar theme={theme} percent={completion} />
        <MutedText theme={theme}>{completed} of {revisions.length} revisions completed</MutedText>
      </Card>
      <Card theme={theme}>
        <Heading theme={theme}>Subject distribution</Heading>
        {subjects.length ? subjects.map(([subject, count]) => (
          <SubjectRow key={subject} theme={theme} subject={subject} count={count} total={planner.topics.length} />
        )) : <MutedText theme={theme}>Your subjects will appear here as you add topics.</MutedText>}
      </Card>
      <Card theme={theme}>
        <Heading theme={theme}>Mock test tracker</Heading>
        <MutedText theme={theme}>Record a test score and track your practice over time.</MutedText>
        {error ? <MutedText theme={theme} style={{color: theme.danger}}>{error}</MutedText> : null}
        <MutedText theme={theme}>Exam</MutedText>
        <View style={styles.chips}>
          {(['NEET SS', 'MS General Surgery'] as const).map(value => (
            <Chip key={value} theme={theme} label={value} selected={exam === value} onPress={() => setExam(value)} />
          ))}
        </View>
        <PickerField theme={theme} label="Test date" value={date} mode="date" onChange={setDate} />
        <View style={styles.scoreRow}>
          <View style={{flex: 1}}><Field theme={theme} label="Score" value={score} onChangeText={setScore} keyboardType="decimal-pad" placeholder="68" /></View>
          <View style={{flex: 1}}><Field theme={theme} label="Maximum marks" value={maximum} onChangeText={setMaximum} keyboardType="decimal-pad" placeholder="100" /></View>
        </View>
        <Field theme={theme} label="Test / platform / notes" value={note} onChangeText={setNote} placeholder="Grand test 01" maxLength={500} />
        <Button theme={theme} label="Save mock test" disabled={saving} onPress={() => void addTest()} />
        {planner.mockTests.length ? planner.mockTests.map(test => (
          <View key={test.id} style={[styles.testRow, {borderColor: theme.line}]}>
            <View style={{flex: 1, gap: 4}}>
              <BodyText theme={theme} style={{fontWeight: '800'}}>{test.note || test.exam}</BodyText>
              <MutedText theme={theme}>{test.exam} · {test.date} · {test.score}/{test.max}</MutedText>
            </View>
            <View style={styles.testRight}>
              <BodyText theme={theme} style={[styles.score, {color: theme.accent}]}>{test.percent}%</BodyText>
              <Button theme={theme} kind="text" label="Delete" compact disabled={saving} onPress={() => removeTest(test)} />
            </View>
          </View>
        )) : <MutedText theme={theme}>No mock tests recorded yet.</MutedText>}
      </Card>
    </Page>
  );
}

function SummaryStat({theme, value, label}: {theme: Theme; value: string; label: string}) {
  return (
    <Card theme={theme} style={styles.stat}>
      <BodyText theme={theme} style={[styles.statNumber, {color: theme.accent}]}>{value}</BodyText>
      <MutedText theme={theme} style={styles.statLabel}>{label}</MutedText>
    </Card>
  );
}

function SubjectRow({theme, subject, count, total}: {theme: Theme; subject: string; count: number; total: number}) {
  return (
    <View style={styles.subjectRow}>
      <View style={{flex: 1, gap: 5}}>
        <View style={styles.sectionHeader}>
          <BodyText theme={theme} style={{fontWeight: '700'}}>{subject}</BodyText>
          <MutedText theme={theme}>{count}</MutedText>
        </View>
        <ProgressBar theme={theme} percent={total ? count * 100 / total : 0} />
      </View>
    </View>
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
  summary: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  stat: {width: '47%', alignItems: 'center', padding: 12, minHeight: 72, justifyContent: 'center'},
  statNumber: {fontSize: 22, fontWeight: '900'},
  statLabel: {fontSize: 12, textAlign: 'center'},
  sectionHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  subjectRow: {paddingVertical: 5},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  scoreRow: {flexDirection: 'row', gap: 10},
  testRow: {flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12},
  testRight: {alignItems: 'flex-end'},
  score: {fontSize: 18, fontWeight: '900'},
});
