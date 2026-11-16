import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { localToday } from '@planner/shared';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { formatClockTime, formatDate } from '../../shared/lib/format';
import { useAppForeground } from '../../shared/lib/useAppForeground';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { uses24HourClock } from '../../native/config';
import {
  getReminderStatus,
  openReminderSettings,
  sendTestNotification,
  type ReminderBlockedReason,
  type ReminderSettingsKind,
  type ReminderStatus,
} from '../../native/reminders';
import { useMe } from '../me/hooks';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

export const NEXT_REMINDER_TEXT = {
  checking: 'Checking…',
  unavailable: 'Unavailable',
  off: 'Off',
  notificationsOff: "Won't appear: notifications are off",
  nothingDue: 'No revisions due in the next 60 days',
} as const;

export const ONE_A_DAY_TEXT =
  'One reminder a day, only on days with revisions due.';
export const MAY_BE_LATE_TEXT = 'It may come a few minutes late.';

/** "Today, 8:00 AM", "Tomorrow, 20:30" or "Fri, 20 Nov, 8:00 AM". */
export function reminderWhen(ms: number, now: Date = new Date()): string {
  const d = new Date(ms);
  const day = localToday(d);
  const today = localToday(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const label =
    day === today
      ? 'Today'
      : day === localToday(tomorrowDate)
      ? 'Tomorrow'
      : `${DAYS[d.getDay()]}, ${formatDate(day, today)}`;
  const time = formatClockTime(
    `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    uses24HourClock(),
  );
  return `${label}, ${time}`;
}

/** Why the next reminder will not show, from the phone (or our own view). */
function blockedReasonOf(
  status: ReminderStatus,
  dailyReminder: boolean | undefined,
): ReminderBlockedReason | null {
  if (status.blockedReason !== undefined) return status.blockedReason;
  // Older native status: work it out from what it does send.
  if (status.dailyReminderEnabled === false || dailyReminder === false) {
    return 'off';
  }
  if (!status.notificationsEnabled) return 'notificationsOff';
  return null;
}

/** The "Next reminder" line: only promises a reminder that will show. */
export function nextReminderLabel(
  loaded: boolean,
  status: ReminderStatus | null,
  dailyReminder: boolean | undefined,
  now: Date = new Date(),
): string {
  if (!loaded) return NEXT_REMINDER_TEXT.checking;
  if (!status) return NEXT_REMINDER_TEXT.unavailable;
  const reason = blockedReasonOf(status, dailyReminder);
  if (reason) return NEXT_REMINDER_TEXT[reason];
  const ms =
    status.nextShowAtMillis !== undefined
      ? status.nextShowAtMillis
      : status.nextFireAtMillis;
  if (!ms) return NEXT_REMINDER_TEXT.nothingDue;
  return reminderWhen(ms, now);
}

function PermissionRow({
  label,
  description,
  ok,
  kind,
}: {
  label: string;
  description: string;
  ok: boolean;
  kind: ReminderSettingsKind;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ paddingVertical: spacing.xs, gap: spacing.xs }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <Text style={{ color: colors.text, fontWeight: '600', flexShrink: 1 }}>
          {label}
        </Text>
        {ok ? (
          <Text
            accessibilityLabel={`${label} allowed`}
            style={{ color: colors.success, fontWeight: '700' }}
          >
            ✓ Allowed
          </Text>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <Text style={{ color: colors.danger }}>Not allowed</Text>
            <Button
              title="Allow"
              variant="secondary"
              accessibilityLabel={`Allow ${label}`}
              onPress={() => {
                openReminderSettings(kind).catch(() => {});
              }}
            />
          </View>
        )}
      </View>
      <Text style={{ color: colors.muted }}>{description}</Text>
    </View>
  );
}

export function ReminderHealthScreen() {
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
  const navigation = useNavigation();
  const meQ = useMe();
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getReminderStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useAppForeground(refresh);
  useRefetchOnFocus(refresh);

  async function test() {
    try {
      await sendTestNotification();
      snackbar.show({ message: 'Test notification sent' });
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      snackbar.show({
        message:
          code === 'E_NOTIFICATIONS_OFF'
            ? 'Notifications are off — turn them on first'
            : "Couldn't send a test notification",
      });
    }
  }

  const dailyReminder = meQ.data?.settings?.dailyReminder;
  const next = nextReminderLabel(loaded, status, dailyReminder);
  const isOff = next === NEXT_REMINDER_TEXT.off;
  const willShow =
    status !== null &&
    loaded &&
    !Object.values(NEXT_REMINDER_TEXT).includes(next as never);

  return (
    <Screen scroll>
      <Card style={{ marginBottom: spacing.lg }}>
        {!loaded ? (
          <Text style={{ color: colors.muted }}>Checking reminder status…</Text>
        ) : !status ? (
          <Text style={{ color: colors.muted }}>
            Reminder status isn't available on this device.
          </Text>
        ) : (
          <>
            <PermissionRow
              label="Notifications"
              description="Shows your daily revision reminder and the focus timer's end alert."
              ok={status.notificationsEnabled}
              kind="notifications"
            />
            <PermissionRow
              label="Alarms & reminders"
              description="Lets the reminder come at the exact time you chose, and the focus timer's alert right when it ends. Without it, they may come a few minutes late."
              ok={status.exactAlarmsAllowed}
              kind="exactAlarm"
            />
            <View
              testID="battery-tip"
              style={{ paddingTop: spacing.sm, gap: spacing.xs }}
            >
              <Text style={{ color: colors.text, fontWeight: '600' }}>
                Optional: background usage
              </Text>
              <Text style={{ color: colors.muted }}>
                If reminders arrive late on your phone, allow this app to run in
                the background in your phone's battery settings.
              </Text>
              {status.ignoringBatteryOptimizations ? (
                <Text
                  accessibilityLabel="Background usage allowed"
                  style={{ color: colors.success, fontWeight: '700' }}
                >
                  ✓ Allowed
                </Text>
              ) : (
                <View style={{ alignItems: 'flex-start' }}>
                  <Button
                    title="Open battery settings"
                    variant="secondary"
                    onPress={() => {
                      openReminderSettings('battery').catch(() => {});
                    }}
                  />
                </View>
              )}
            </View>
          </>
        )}
      </Card>
      <View style={{ marginBottom: spacing.lg, gap: spacing.xs }}>
        <Text
          testID="next-reminder"
          style={{ color: colors.text, fontSize: 16 }}
        >
          {`Next reminder: ${next}`}
        </Text>
        {willShow && status?.exactTiming === false ? (
          <Text style={{ color: colors.muted }}>{MAY_BE_LATE_TEXT}</Text>
        ) : null}
        <Text style={{ color: colors.muted }}>{ONE_A_DAY_TEXT}</Text>
        {isOff ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate('MainTabs', { screen: 'Settings' })
            }
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.accent, fontSize: 16 }}>
              Turn it on in Settings
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Button title="Send test notification" onPress={test} />
    </Screen>
  );
}
