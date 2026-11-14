import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { Banner } from '../../shared/ui/Banner';
import { Button } from '../../shared/ui/Button';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { formatClockTime } from '../../shared/lib/format';
import { useAppForeground } from '../../shared/lib/useAppForeground';
import { uses24HourClock } from '../../native/config';
import {
  configureReminders,
  getReminderStatus,
  openReminderSettings,
  requestNotificationPermission,
  type ReminderStatus,
} from '../../native/reminders';
import { useMe, useUpdateMe } from '../me/hooks';
import { StepShell } from './StepShell';

const pad = (n: number) => String(n).padStart(2, '0');

function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function PermissionRow({
  label,
  ok,
  action,
  onPress,
}: {
  label: string;
  ok: boolean;
  action: string;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        paddingVertical: spacing.xs,
      }}
    >
      <Text style={{ color: colors.text, flexShrink: 1 }}>{label}</Text>
      {ok ? (
        <Text
          accessibilityLabel={`${label} allowed`}
          style={{ color: colors.success, fontWeight: '700' }}
        >
          ✓
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
          <Button title={action} variant="secondary" onPress={onPress} />
        </View>
      )}
    </View>
  );
}

/**
 * A request that comes back this fast was refused without a dialog: Android
 * stops asking after the user said "Don't allow" (twice on Android 13+).
 */
const NO_DIALOG_MS = 600;

export function RemindersStep() {
  const { colors, radius, spacing } = useTheme();
  const navigation = useNavigation();
  const updateMe = useUpdateMe();
  const meQ = useMe();
  const [timeEdit, setTimeEdit] = useState<string | null>(null);
  const [enabledEdit, setEnabledEdit] = useState<boolean | null>(null);
  const time = timeEdit ?? meQ.data?.settings?.reminderTime ?? '08:00';
  const enabled = enabledEdit ?? meQ.data?.settings?.dailyReminder ?? true;
  const [pickerOpen, setPickerOpen] = useState(false);
  // null until the first check finishes: no "Not allowed" before we know.
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  // After one refusal, Allow goes straight to the app's notification settings.
  const [notifDenied, setNotifDenied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async (): Promise<ReminderStatus | null> => {
    try {
      const s = await getReminderStatus();
      if (s) setStatus(s);
      return s;
    } catch {
      // Keep the last known status rather than showing a false alarm.
      return null;
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useAppForeground(refresh);

  const notifOk = status?.notificationsEnabled ?? false;
  const alarmOk = status?.exactAlarmsAllowed ?? false;
  const missing = enabled && status !== null && !(notifOk && alarmOk);

  async function allowNotifications() {
    if (notifDenied) {
      await openReminderSettings('notifications');
      return;
    }
    const started = Date.now();
    let granted = false;
    try {
      granted = await requestNotificationPermission();
    } catch {
      granted = false;
    }
    const now = await refresh();
    if (granted && now?.notificationsEnabled !== false) return;
    if (Date.now() - started < NO_DIALOG_MS || granted) {
      // No dialog was shown (or the app's notifications are switched off):
      // only Settings can turn them on now.
      await openReminderSettings('notifications');
    }
    setNotifDenied(true);
  }

  async function next() {
    setError(null);
    setSaving(true);
    try {
      await updateMe.mutateAsync({
        settings: {
          reminderTime: time,
          dailyReminder: enabled,
          timezone: timezone(),
        },
      });
      try {
        await configureReminders(enabled, time);
      } catch {
        // Scheduling is re-applied later; never block setup on it.
      }
      navigation.navigate('Topics' as never);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  const [hh, mm] = time.split(':').map(Number);
  const shownTime = formatClockTime(time, uses24HourClock());
  return (
    <StepShell step={3} title="Daily reminder">
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        <Text style={{ color: colors.text, flexShrink: 1 }}>
          Daily reminder
        </Text>
        <Switch
          accessibilityLabel="Daily reminder"
          value={enabled}
          onValueChange={setEnabledEdit}
        />
      </View>
      <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
        Remind me at
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remind me at ${shownTime}`}
        accessibilityHint="Opens a clock to change the time"
        onPress={() => setPickerOpen(true)}
        style={{
          minHeight: 48,
          justifyContent: 'center',
          paddingHorizontal: spacing.md,
          backgroundColor: colors.input,
          borderColor: colors.line,
          borderWidth: 1,
          borderRadius: radius.md,
          marginBottom: spacing.lg,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 16 }}>{shownTime}</Text>
      </Pressable>
      {pickerOpen ? (
        <DateTimePicker
          // No is24Hour: the clock follows the phone's 12/24-hour setting.
          value={new Date(2000, 0, 1, hh, mm)}
          mode="time"
          onChange={(e, d) => {
            setPickerOpen(Platform.OS === 'ios');
            if (e.type === 'set' && d) {
              setTimeEdit(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
            }
          }}
        />
      ) : null}

      {enabled && status !== null ? (
        <>
          <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
            So we can remind you to revise on time, please allow:
          </Text>
          <PermissionRow
            label="Notifications"
            ok={notifOk}
            action={notifDenied ? 'Open settings' : 'Allow'}
            onPress={allowNotifications}
          />
          <PermissionRow
            label="Alarms & reminders"
            ok={alarmOk}
            action="Allow"
            onPress={() => openReminderSettings('exactAlarm')}
          />
        </>
      ) : null}
      {missing ? (
        <View style={{ marginVertical: spacing.md }}>
          <Banner
            tone="warning"
            text="Without these, reminders may not appear on time. You can change this later in Settings."
          />
        </View>
      ) : null}
      {error ? <ErrorRetry error={error} onRetry={next} /> : null}
      <View style={{ marginTop: spacing.md }}>
        <Button
          title="Next"
          onPress={next}
          loading={saving}
          // Wait for the saved time, so it is never replaced by the default.
          disabled={meQ.isPending}
        />
      </View>
    </StepShell>
  );
}
