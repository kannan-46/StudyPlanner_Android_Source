import { NativeModules } from 'react-native';
import type { LocalDate } from '@planner/shared';

// Typed wrappers over the native "Reminders" module (ReminderModule.kt).
// Every call is a safe no-op when the module is absent (Jest, other platforms).

export interface ReminderSnapshotItem {
  topicName: string;
  dueOn: LocalDate;
}

export interface ReminderStatus {
  notificationsEnabled: boolean;
  exactAlarmsAllowed: boolean;
  ignoringBatteryOptimizations: boolean;
  nextFireAtMillis: number | null;
}

export type ReminderSettingsKind = 'notifications' | 'exactAlarm' | 'battery';

interface RemindersNative {
  syncSnapshot?: (itemsJson: string) => Promise<void>;
  configure?: (enabled: boolean, hour: number, minute: number) => Promise<void>;
  getStatus?: () => Promise<ReminderStatus>;
  requestNotificationPermission?: () => Promise<boolean>;
  openSettings?: (kind: ReminderSettingsKind) => Promise<void>;
  sendTestNotification?: () => Promise<void>;
  clearAll?: () => Promise<void>;
}

function native(): RemindersNative | undefined {
  return NativeModules.Reminders as RemindersNative | undefined;
}

export async function syncReminderSnapshot(
  items: ReminderSnapshotItem[],
): Promise<void> {
  const payload = items.map(i => ({ topicName: i.topicName, dueOn: i.dueOn }));
  await native()?.syncSnapshot?.(JSON.stringify(payload));
}

export async function configureReminders(
  enabled: boolean,
  time: string,
): Promise<void> {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`Invalid reminder time: ${time}`);
  await native()?.configure?.(enabled, Number(match[1]), Number(match[2]));
}

export async function getReminderStatus(): Promise<ReminderStatus | null> {
  return (await native()?.getStatus?.()) ?? null;
}

export async function requestNotificationPermission(): Promise<boolean> {
  return (await native()?.requestNotificationPermission?.()) ?? false;
}

export async function openReminderSettings(
  kind: ReminderSettingsKind,
): Promise<void> {
  await native()?.openSettings?.(kind);
}

/**
 * Shows a test notification. Rejects with code `E_NOTIFICATIONS_OFF` when
 * notifications are disabled for the app (no silent success).
 */
export async function sendTestNotification(): Promise<void> {
  await native()?.sendTestNotification?.();
}

export async function clearReminders(): Promise<void> {
  await native()?.clearAll?.();
}
