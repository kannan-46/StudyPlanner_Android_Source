import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { Banner } from '../../shared/ui/Banner';
import { Button } from '../../shared/ui/Button';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useAppForeground } from '../../shared/lib/useAppForeground';
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
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getReminderStatus());
    } catch {
      setStatus(null);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useAppForeground(refresh);

  const notifOk = status?.notificationsEnabled ?? false;
  const alarmOk = status?.exactAlarmsAllowed ?? false;
  const batteryOk = status?.ignoringBatteryOptimizations ?? false;
  const missing = !(notifOk && alarmOk && batteryOk);

  async function allowNotifications() {
    try {
      await requestNotificationPermission();
    } finally {
      await refresh();
    }
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reminder time"
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
        <Text style={{ color: colors.text, fontSize: 16 }}>{time}</Text>
      </Pressable>
      {pickerOpen ? (
        <DateTimePicker
          value={new Date(2000, 0, 1, hh, mm)}
          mode="time"
          is24Hour
          onChange={(e, d) => {
            setPickerOpen(Platform.OS === 'ios');
            if (e.type === 'set' && d) {
              setTimeEdit(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
            }
          }}
        />
      ) : null}

      <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
        For reminders to arrive on time
      </Text>
      <PermissionRow
        label="Notifications"
        ok={notifOk}
        action="Allow"
        onPress={allowNotifications}
      />
      <PermissionRow
        label="Exact alarms"
        ok={alarmOk}
        action="Allow"
        onPress={() => openReminderSettings('exactAlarm')}
      />
      <PermissionRow
        label="Battery"
        ok={batteryOk}
        action="Unrestrict"
        onPress={() => openReminderSettings('battery')}
      />
      {missing ? (
        <View style={{ marginVertical: spacing.md }}>
          <Banner
            tone="warning"
            text="Some permissions are missing, so reminders may not appear on time. You can fix this later in Settings."
          />
        </View>
      ) : null}
      {error ? <ErrorRetry error={error} onRetry={next} /> : null}
      <View style={{ marginTop: spacing.md }}>
        <Button title="Next" onPress={next} loading={saving} />
      </View>
    </StepShell>
  );
}
