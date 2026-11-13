import { useEffect } from 'react';
import { useAgenda } from './hooks';
import { useMe } from '../me/hooks';
import {
  configureReminders,
  syncReminderSnapshot,
} from '../../native/reminders';

const SNAPSHOT_DAYS = 60;

/**
 * Keeps the native daily reminder in sync with the server: pushes the agenda
 * snapshot after each successful fetch and the reminder settings when they change.
 * Mount once (MainTabs).
 */
export function useReminderSnapshotSync(): void {
  const agenda = useAgenda(SNAPSHOT_DAYS);
  const me = useMe();

  const items = agenda.data;
  const updatedAt = agenda.dataUpdatedAt;
  useEffect(() => {
    if (!items) return;
    syncReminderSnapshot(
      items.map(i => ({ topicName: i.topicName, dueOn: i.dueOn })),
    ).catch(() => {});
  }, [items, updatedAt]);

  const enabled = me.data?.settings.dailyReminder;
  const time = me.data?.settings.reminderTime;
  useEffect(() => {
    if (enabled === undefined || time === undefined) return;
    configureReminders(enabled, time).catch(() => {});
  }, [enabled, time]);
}
