import { NativeModules } from 'react-native';
import type { LocalDate } from '@planner/shared';

// Typed wrappers over the native "Reminders" module (ReminderModule.kt).
// Every call is a safe no-op when the module is absent (Jest, other platforms).

/** Id of the focus timer's end-of-session alarm (one-shot). */
export const FOCUS_ALARM_ID = 'focus_timer';

export interface ReminderSnapshotItem {
  topicName: string;
  dueOn: LocalDate;
}

/**
 * Why the next daily reminder will not show:
 * - `off`: the daily reminder is turned off;
 * - `notificationsOff`: notifications are blocked for the app;
 * - `nothingDue`: nothing is due in the synced 60-day snapshot.
 */
export type ReminderBlockedReason = 'off' | 'notificationsOff' | 'nothingDue';

export interface ReminderStatus {
  notificationsEnabled: boolean;
  exactAlarmsAllowed: boolean;
  ignoringBatteryOptimizations: boolean;
  /** Next time the daily alarm goes off, whether or not it will show anything. */
  nextFireAtMillis: number | null;
  /**
   * The fields below are always sent by the native module after 4.2.0. They are
   * optional here so older test fixtures still type-check; treat a missing
   * value as unknown.
   */
  /** The daily reminder switch as the phone has it. */
  dailyReminderEnabled?: boolean;
  /** Whether the daily reminder keeps exact time (false: may be a few minutes late). */
  exactTiming?: boolean;
  /**
   * When the next summary that will really show is due: skips days with
   * nothing due and a day whose summary already showed. Null when the
   * reminder is off or nothing is due in the next 60 days. It does not
   * account for blocked notifications (see `blockedReason`).
   */
  nextShowAtMillis?: number | null;
  /** Why the next reminder will not show, or null when it will. */
  blockedReason?: ReminderBlockedReason | null;
  /** Whether the focus timer's end alert can show (app and its channel allowed). */
  focusAlertsEnabled?: boolean;
}

/** What `scheduleOneShot` reports about the alarm it set. */
export interface OneShotResult {
  /** True: the alert comes on time. False: Android may deliver it late (no exact-alarm access). */
  exact: boolean;
  /** False: notifications are blocked, so no alert will show. */
  canNotify: boolean;
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
  scheduleOneShot?: (
    id: string,
    atMillis: number,
    title: string,
    body: string,
  ) => Promise<OneShotResult | null | undefined>;
  cancelOneShot?: (id: string) => Promise<void>;
  cancelOneShotAlarm?: (id: string) => Promise<void>;
}

function native(): RemindersNative | undefined {
  return NativeModules.Reminders as RemindersNative | undefined;
}

/**
 * Saves the upcoming revisions for the daily summary. A summary already in
 * the notification shade is removed once nothing is due, or quietly updated
 * when the counts change.
 */
export async function syncReminderSnapshot(
  items: ReminderSnapshotItem[],
): Promise<void> {
  const payload = items.map(i => ({ topicName: i.topicName, dueOn: i.dueOn }));
  await native()?.syncSnapshot?.(JSON.stringify(payload));
}

/** Turns the daily reminder on or off. Turning it off also removes a showing summary. */
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
 * Shows a test notification ("Notifications are showing."), separate from the
 * daily summary, so it never replaces it. Its text says when the daily
 * reminder is off. Rejects with code `E_NOTIFICATIONS_OFF` when notifications
 * are disabled for the app (no silent success).
 */
export async function sendTestNotification(): Promise<void> {
  await native()?.sendTestNotification?.();
}

/**
 * Sign-out: forgets the reminder settings and snapshot, cancels the daily
 * alarm and every one-shot alarm (the focus timer), and removes every
 * notification the app posted.
 */
export async function clearReminders(): Promise<void> {
  await native()?.clearAll?.();
}

/**
 * Shows a notification (with sound and vibration) at `atMillis`, even when
 * the app is in the background or closed. Scheduling the same id again
 * replaces the earlier one. `id`: letters, digits, _ or -.
 *
 * If the app is open in front of the user when the alarm goes off, no
 * notification is posted: the app gives the alert itself.
 *
 * Use `scheduleOneShotWithStatus` to learn whether the alert will be on time.
 */
export async function scheduleOneShot(
  id: string,
  atMillis: number,
  title: string,
  body: string,
): Promise<void> {
  await scheduleOneShotWithStatus(id, atMillis, title, body);
}

/**
 * Same as `scheduleOneShot`, but resolves with whether the alarm is exact
 * (on time) and whether it can show at all, or null when the native module is
 * missing.
 */
export async function scheduleOneShotWithStatus(
  id: string,
  atMillis: number,
  title: string,
  body: string,
): Promise<OneShotResult | null> {
  const result = await native()?.scheduleOneShot?.(id, atMillis, title, body);
  return result ?? null;
}

/**
 * Cancels a one-shot alarm. By default it also removes its notification if it
 * already showed; with `keepNotification` a notification that just showed
 * stays (use when the app ends the session itself).
 */
export async function cancelOneShot(
  id: string,
  options: { keepNotification?: boolean } = {},
): Promise<void> {
  const mod = native();
  if (options.keepNotification && mod?.cancelOneShotAlarm) {
    await mod.cancelOneShotAlarm(id);
    return;
  }
  await mod?.cancelOneShot?.(id);
}
