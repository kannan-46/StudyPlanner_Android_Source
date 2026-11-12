import React, {useMemo, useState} from 'react';
import {Alert, View, StyleSheet} from 'react-native';
import {TopicEditorModal} from '../components/TopicEditorModal';
import type {Exam, PlannerDocument, Topic} from '../types/planner';
import type {Theme} from '../ui/theme';
import {Button, Card, Chip, Field, Heading, MutedText, Page, ProgressBar, BodyText} from '../ui/components';

const filters: Array<'All' | Exam> = ['All', 'MS General Surgery', 'NEET SS', 'Both'];

export function TopicsScreen({
  planner,
  theme,
  saving,
  onSaveTopic,
  onDeleteTopic,
}: {
  planner: PlannerDocument;
  theme: Theme;
  saving: boolean;
  onSaveTopic: (topic: Topic, oldId?: string) => Promise<void>;
  onDeleteTopic: (id: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<'All' | Exam>('All');
  const [search, setSearch] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editing, setEditing] = useState<Topic | null>(null);

  const visibleTopics = useMemo(() => {
    const query = search.trim().toLowerCase();
    return planner.topics.filter(topic =>
      (filter === 'All' || topic.exam === filter || topic.exam === 'Both') &&
      `${topic.name} ${topic.subject} ${topic.exam}`.toLowerCase().includes(query),
    );
  }, [planner.topics, filter, search]);

  const edit = (topic: Topic | null) => {
    setEditing(topic);
    setEditorVisible(true);
  };

  const deleteTopic = (topic: Topic) => {
    Alert.alert('Delete this topic?', `“${topic.name}” and its revision history will be removed.`, [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => void onDeleteTopic(topic.id)},
    ]);
  };

  return (
    <>
      <Page theme={theme}>
        <View style={styles.header}>
          <View>
            <Heading theme={theme}>My topics</Heading>
            <MutedText theme={theme}>{planner.topics.length} topic{planner.topics.length === 1 ? '' : 's'} in your planner</MutedText>
          </View>
          <Button theme={theme} label="＋ Add" compact disabled={saving} onPress={() => edit(null)} />
        </View>
        <Field theme={theme} label="Search topics or subjects" value={search} onChangeText={setSearch} placeholder="Search" />
        <View style={styles.chips}>
          {filters.map(value => <Chip key={value} theme={theme} label={value} selected={filter === value} onPress={() => setFilter(value)} />)}
        </View>
        {visibleTopics.length === 0 ? (
          <Card theme={theme}>
            <BodyText theme={theme}>{planner.topics.length ? 'No topics match that search.' : 'Start your planner by adding a topic.'}</BodyText>
          </Card>
        ) : visibleTopics.map(topic => {
          const doneCount = topic.revisions.filter(revision => revision.done).length;
          const nextRevision = topic.revisions.find(revision => !revision.done);
          return (
            <Card key={topic.id} theme={theme}>
              <View style={styles.topicHeader}>
                <View style={styles.topicText}>
                  <BodyText theme={theme} style={styles.topicName}>{topic.name}</BodyText>
                  <MutedText theme={theme}>{topic.subject || 'Uncategorised'} · {topic.exam} · Studied {topic.studyDate}</MutedText>
                </View>
                <MutedText theme={theme}>{doneCount}/{topic.revisions.length}</MutedText>
              </View>
              <ProgressBar theme={theme} percent={topic.revisions.length ? doneCount * 100 / topic.revisions.length : 0} />
              <MutedText theme={theme}>
                {nextRevision ? `Next: ${nextRevision.date} (Day ${nextRevision.day})` : 'All scheduled revisions completed'}
              </MutedText>
              <View style={styles.actions}>
                <Button theme={theme} kind="secondary" label="Edit" compact disabled={saving} onPress={() => edit(topic)} />
                <Button theme={theme} kind="danger" label="Delete" compact disabled={saving} onPress={() => deleteTopic(topic)} />
              </View>
            </Card>
          );
        })}
      </Page>
      <TopicEditorModal
        visible={editorVisible}
        existing={editing}
        defaultIntervals={planner.settings.intervals}
        theme={theme}
        onClose={() => setEditorVisible(false)}
        onSave={onSaveTopic}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  topicHeader: {flexDirection: 'row', justifyContent: 'space-between', gap: 8},
  topicText: {flex: 1, gap: 3},
  topicName: {fontWeight: '800', fontSize: 16},
  actions: {flexDirection: 'row', gap: 9, marginTop: 2},
});
