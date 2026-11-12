import React, {useEffect, useState} from 'react';
import {Alert, StyleSheet, Switch, View} from 'react-native';
import {getPlannerNative} from '../planner/nativeAlarms';
import {DEFAULT_SETTINGS, type PlannerDocument, type PlannerSettings} from '../types/planner';
import {PickerField} from '../ui/PickerField';
import type {Theme} from '../ui/theme';
import {BodyText, Button, Card, Field, Heading, MutedText, Notice, Page} from '../ui/components';

export function SettingsScreen({
  planner,
  theme,
  email,
  saving,
  canEdit,
  onSaveSettings,
  onResetPlanner,
  onSignOut,
}: {
  planner: PlannerDocument;
  theme: Theme;
  email: string;
  saving: boolean;
  canEdit: boolean;
  onSaveSettings: (settings: PlannerSettings) => Promise<void>;
  onResetPlanner: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [intervals, setIntervals] = useState(planner.settings.intervals.join(','));
  const [time, setTime] = useState(planner.settings.time);
  const [dark, setDark] = useState(planner.settings.dark);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIntervals(planner.settings.intervals.join(','));
    setTime(planner.settings.time);
    setDark(planner.settings.dark);
  }, [planner.version, planner.settings]);

  const save = async () => {
    setError(null);
    setNotice(null);
    const parsedIntervals = intervals.split(',').map(value => Number(value.trim()));
    if (!parsedIntervals.length || parsedIntervals.some(value => !Number.isInteger(value) || value < 1 || value > 999) || parsedIntervals.length > 20) {
      setError('Enter up to 20 whole-day intervals from 1 to 999, separated by commas.');
      return;
    }
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError('Enter the reminder time as HH:MM, for example 08:00.');
      return;
    }
    try {
      await onSaveSettings({intervals: parsedIntervals, time, dark});
      setNotice('Settings saved. New intervals apply to topics you add next.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save settings.');
    }
  };

  const requestExactAlarms = async () => {
    try {
      await getPlannerNative().requestExactAlarmAccess();
      setNotice('Return here after changing Android alarm access. Your schedule will refresh when the app reconnects.');
    } catch (alarmError) {
      Alert.alert('Could not open alarm settings', alarmError instanceof Error ? alarmError.message : 'Try again from the app.');
    }
  };

  const reset = () => {
    Alert.alert('Delete all planner data?', 'This clears topics, revision history, mock tests, and settings from your cloud account.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete all', style: 'destructive', onPress: () => void onResetPlanner()},
    ]);
  };

  const signOut = () => {
    Alert.alert('Sign out?', 'Your planner remains in your account and will be available after you sign in again.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Sign out', onPress: () => void onSignOut()},
    ]);
  };

  return (
    <Page theme={theme}>
      <View>
        <Heading theme={theme}>Settings</Heading>
        <MutedText theme={theme}>Account, reminders, and planner preferences</MutedText>
      </View>
      <Card theme={theme}>
        <Heading theme={theme}>Signed in</Heading>
        <BodyText theme={theme}>{email || 'Planner account'}</BodyText>
        <MutedText theme={theme}>Your planner syncs to the cloud and needs an internet connection to view or edit.</MutedText>
      </Card>
      <Card theme={theme}>
        <Heading theme={theme}>Revision intervals</Heading>
        <MutedText theme={theme}>These days after studying a topic are used for new topics. Existing schedules stay as set.</MutedText>
        <Field theme={theme} label="Intervals (comma-separated days)" value={intervals} onChangeText={setIntervals} placeholder="4,7,15,30,60,90" keyboardType="numbers-and-punctuation" />
        <PickerField theme={theme} label="Daily reminder time" value={time} mode="time" onChange={setTime} />
        <View style={styles.switchRow}>
          <View style={{flex: 1}}>
            <BodyText theme={theme} style={{fontWeight: '700'}}>Dark mode</BodyText>
            <MutedText theme={theme}>Use a darker planner theme</MutedText>
          </View>
          <Switch
            value={dark}
            onValueChange={setDark}
            trackColor={{false: theme.line, true: theme.accent}}
            thumbColor={theme.surface}
          />
        </View>
        {error ? <Notice theme={theme} danger>{error}</Notice> : null}
        {notice ? <Notice theme={theme}>{notice}</Notice> : null}
        <Button theme={theme} label="Save settings" disabled={saving || !canEdit} onPress={() => void save()} />
      </Card>
      <Card theme={theme}>
        <Heading theme={theme}>Android notifications</Heading>
        <MutedText theme={theme}>Revision alarms and the daily reminder are scheduled on this device. Exact alarm access helps Android deliver reminders at the selected time.</MutedText>
        <Button theme={theme} kind="secondary" label="Enable reliable alarms" onPress={() => void requestExactAlarms()} />
      </Card>
      <Card theme={theme}>
        <Heading theme={theme}>Account actions</Heading>
        <Button theme={theme} kind="secondary" label="Sign out" disabled={saving} onPress={signOut} />
        <Button theme={theme} kind="danger" label="Delete all planner data" disabled={saving || !canEdit} onPress={reset} />
      </Card>
      <MutedText theme={theme} style={styles.footer}>Surgical Study Planner · Version 3.0</MutedText>
    </Page>
  );
}

const styles = StyleSheet.create({
  switchRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4},
  footer: {textAlign: 'center', paddingVertical: 8},
});
