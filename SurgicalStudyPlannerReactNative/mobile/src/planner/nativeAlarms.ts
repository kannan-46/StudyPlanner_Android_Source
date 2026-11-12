import {NativeModules} from 'react-native';
import type {PlannerDocument} from '../types/planner';
import {allRevisions, localDateString} from './revisions';

type PlannerNativeBridge = {
  cancelAllRevisionAlarms: () => Promise<void>;
  clearAllAlarms: () => Promise<void>;
  scheduleRevisionAlarm: (id: string, atMillis: number, title: string, body: string) => Promise<void>;
  scheduleDailyReminder: (hour: number, minute: number, pendingCount: number) => Promise<void>;
  requestExactAlarmAccess: () => Promise<void>;
  exportBackup: (json: string) => Promise<void>;
  importBackup: () => Promise<string>;
};

const plannerNative = NativeModules.PlannerNative as PlannerNativeBridge | undefined;

export function getPlannerNative(): PlannerNativeBridge {
  if (!plannerNative) {
    throw new Error('Android reminder and backup features are unavailable in this build.');
  }
  return plannerNative;
}

export async function syncNativeAlarms(planner: PlannerDocument): Promise<void> {
  const native = getPlannerNative();
  await native.cancelAllRevisionAlarms();
  const [hourValue, minuteValue] = planner.settings.time.split(':').map(Number);
  const hour = Number.isInteger(hourValue) ? hourValue : 8;
  const minute = Number.isInteger(minuteValue) ? minuteValue : 0;
  const today = localDateString();
  const now = Date.now();
  const pending = allRevisions(planner).filter(revision => !revision.done);

  await Promise.all(pending.map(revision => {
    const at = new Date(`${revision.date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`).getTime();
    const triggerAt = revision.date <= today || at <= now ? now + 45_000 : at;
    return native.scheduleRevisionAlarm(
      `rev_${revision.topicId}_${revision.revisionIndex}`,
      triggerAt,
      revision.topicName,
      `Day ${revision.day} revision is due`,
    );
  }));

  await native.scheduleDailyReminder(hour, minute, pending.length);
}
