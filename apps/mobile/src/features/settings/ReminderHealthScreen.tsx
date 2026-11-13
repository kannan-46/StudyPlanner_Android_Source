import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useAppForeground } from '../../shared/lib/useAppForeground';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import {
  getReminderStatus,
  openReminderSettings,
  sendTestNotification,
  type ReminderSettingsKind,
  type ReminderStatus,
} from '../../native/reminders';
import { useMe } from '../me/hooks';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

function nextLabel(
  status: ReminderStatus | null,
  dailyReminder: boolean | undefined,
): string {
  if (dailyReminder === false) return 'Off';
  if (!status?.nextFireAtMillis) return 'Nothing due';
  const d = new Date(status.nextFireAtMillis);
  return `${DAYS[d.getDay()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Row({
  label,
  ok,
  kind,
}: {
  label: string;
  ok: boolean;
  kind: ReminderSettingsKind;
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
          accessibilityLabel={`${label} OK`}
          style={{ color: colors.success, fontWeight: '700' }}
        >
          ✓
        </Text>
      ) : (
        <Button
          title="Off — Fix"
          variant="secondary"
          onPress={() => {
            openReminderSettings(kind).catch(() => {});
          }}
        />
      )}
    </View>
  );
}

export function ReminderHealthScreen() {
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
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
            <Row
              label="Notifications"
              ok={status?.notificationsEnabled ?? false}
              kind="notifications"
            />
            <Row
              label="Exact alarms"
              ok={status?.exactAlarmsAllowed ?? false}
              kind="exactAlarm"
            />
            <Row
              label="Battery"
              ok={status?.ignoringBatteryOptimizations ?? false}
              kind="battery"
            />
          </>
        )}
      </Card>
      <Text
        style={{ color: colors.text, fontSize: 16, marginBottom: spacing.lg }}
      >
        {`Next reminder: ${nextLabel(
          status,
          meQ.data?.settings.dailyReminder,
        )}`}
      </Text>
      <Button title="Send test notification" onPress={test} />
    </Screen>
  );
}
