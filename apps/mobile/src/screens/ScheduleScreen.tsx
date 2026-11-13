import React, {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {Exam, PlannerDocument} from '../types/planner';
import {allRevisions, localDateString} from '../planner/revisions';
import type {Theme} from '../ui/theme';
import {BodyText, Card, Chip, Heading, MutedText, Page} from '../ui/components';

const filters: Array<'All' | Exam> = ['All', 'MS General Surgery', 'NEET SS'];

export function ScheduleScreen({planner, theme}: {planner: PlannerDocument; theme: Theme}) {
  const [filter, setFilter] = useState<'All' | Exam>('All');
  const rows = useMemo(() => allRevisions(planner)
    .filter(row => !row.done && (filter === 'All' || row.exam === filter || row.exam === 'Both'))
    .sort((left, right) => left.date.localeCompare(right.date)), [planner, filter]);
  const grouped = rows.reduce<Record<string, typeof rows>>((result, row) => {
    (result[row.date] ??= []).push(row);
    return result;
  }, {});

  return (
    <Page theme={theme}>
      <View>
        <Heading theme={theme}>Revision schedule</Heading>
        <MutedText theme={theme}>Your unfinished revisions, sorted by date</MutedText>
      </View>
      <View style={styles.chips}>
        {filters.map(value => <Chip key={value} theme={theme} label={value} selected={filter === value} onPress={() => setFilter(value)} />)}
      </View>
      {Object.keys(grouped).length === 0 ? (
        <Card theme={theme}>
          <BodyText theme={theme}>{planner.topics.length ? 'No pending revisions for this exam.' : 'Add topics to see their revision dates here.'}</BodyText>
        </Card>
      ) : Object.entries(grouped).map(([date, scheduled]) => (
        <Card theme={theme} key={date}>
          <View style={styles.dateHeader}>
            <Heading theme={theme}>{date === localDateString() ? 'Today' : date}</Heading>
            <MutedText theme={theme}>{scheduled.length} revision{scheduled.length === 1 ? '' : 's'}</MutedText>
          </View>
          {scheduled.map(row => (
            <View key={`${row.topicId}-${row.revisionIndex}`} style={[styles.row, {borderColor: theme.line}]}>
              <View style={styles.rowText}>
                <BodyText theme={theme} style={{fontWeight: '700'}}>{row.topicName}</BodyText>
                <MutedText theme={theme}>{row.subject || 'Uncategorised'} · {row.exam}</MutedText>
              </View>
              <MutedText theme={theme}>Day {row.day}</MutedText>
            </View>
          ))}
        </Card>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  dateHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10},
  rowText: {flex: 1, gap: 3},
});
