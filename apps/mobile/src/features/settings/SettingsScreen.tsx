import React, { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import {
  DEFAULT_SETTINGS,
  createSchedule,
  intervalsSchema,
  localToday,
  type UpdateMeInput,
} from '@planner/shared';
import { userMessage } from '../../shared/api/errors';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { Dialog } from '../../shared/ui/Dialog';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { TextField } from '../../shared/ui/TextField';
import { useTheme, useThemeMode } from '../../shared/ui/ThemeProvider';
import { formatDate } from '../../shared/lib/format';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { configureReminders } from '../../native/reminders';
import { useAuth } from '../auth/AuthProvider';
import { useDeleteAccount, useMe, useUpdateMe } from '../me/hooks';
import { BackupSection } from './BackupSection';

const pad = (n: number) => String(n).padStart(2, '0');

function parseIntervals(text: string): { value?: number[]; error?: string } {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const nums = parts.map(Number);
  if (parts.length === 0 || nums.some(n => !Number.isInteger(n))) {
    return { error: 'Use whole numbers like 4, 7, 15' };
  }
  const r = intervalsSchema.safeParse(nums);
  return r.success
    ? { value: r.data }
    : { error: r.error.issues[0]?.message ?? 'Invalid intervals' };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: 18,
          fontWeight: '700',
          marginBottom: spacing.sm,
        }}
      >
        {title}
      </Text>
      <Card style={{ gap: spacing.sm }}>{children}</Card>
    </View>
  );
}

function LinkRow({ title, onPress }: { title: string; onPress: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        minHeight: 48,
        justifyContent: 'center',
        paddingVertical: spacing.xs,
      }}
    >
      <Text style={{ color: colors.accent, fontSize: 16 }}>{title}</Text>
    </Pressable>
  );
}

export function SettingsScreen() {
  const { colors, radius, spacing } = useTheme();
  const navigation = useNavigation();
  const snackbar = useSnackbar();
  const { signOut } = useAuth();
  const { mode: theme, setMode: setTheme } = useThemeMode();
  const meQ = useMe();
  const updateMe = useUpdateMe();
  const deleteAccount = useDeleteAccount();
  useRefetchOnFocus(meQ.refetch);

  // Optimistic overrides; cleared once the save settles (success shows the
  // server value, failure reverts to it).
  const [intervalsText, setIntervalsText] = useState<string | null>(null);
  const [enabledOv, setEnabledOv] = useState<boolean | null>(null);
  const [timeOv, setTimeOv] = useState<string | null>(null);
  // Counts reminder saves, so quick taps are settled by the latest one only.
  const reminderSaveId = useRef(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [savingIntervals, setSavingIntervals] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const settings = meQ.data?.settings ?? DEFAULT_SETTINGS;
  const intervalsSaved = settings.intervals.join(', ');
  const text = intervalsText ?? intervalsSaved;
  const parsed = parseIntervals(text);
  const intervalsDirty =
    !!parsed.value && parsed.value.join(', ') !== intervalsSaved;
  const enabled = enabledOv ?? settings.dailyReminder;
  const time = timeOv ?? settings.reminderTime;

  const preview = useMemo(() => {
    if (!parsed.value) return [];
    const today = localToday();
    return createSchedule(today, parsed.value, () => 'p').revisions.map(r => ({
      step: r.step,
      date: formatDate(r.dueOn, today),
    }));
  }, [parsed.value]);

  /** Saves a patch; returns true on success, snackbar + false on failure. */
  async function save(patch: UpdateMeInput): Promise<boolean> {
    try {
      await updateMe.mutateAsync(patch);
      return true;
    } catch (e) {
      snackbar.show({ message: userMessage(e) });
      return false;
    }
  }

  async function saveIntervals() {
    if (!parsed.value) return;
    setSavingIntervals(true);
    const ok = await save({ settings: { intervals: parsed.value } });
    setSavingIntervals(false);
    // On failure keep what the user typed, so Save can simply be tapped again.
    if (ok) setIntervalsText(null);
  }

  async function confirmSignOut() {
    setSignOutOpen(false);
    await signOut();
    snackbar.show({ message: "You're signed out" });
  }

  async function saveReminder(nextEnabled: boolean, nextTime: string) {
    const id = ++reminderSaveId.current;
    const ok = await save({
      settings: { dailyReminder: nextEnabled, reminderTime: nextTime },
    });
    // A newer tap is still saving: keep showing it, and let it finish the job.
    if (id !== reminderSaveId.current) return;
    if (ok) {
      try {
        await configureReminders(nextEnabled, nextTime);
      } catch {
        // Scheduling is re-applied on the next launch.
      }
    }
    setEnabledOv(null);
    setTimeOv(null);
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await deleteAccount.mutateAsync();
      setDeleteOpen(false);
      await signOut();
    } catch (e) {
      snackbar.show({ message: userMessage(e) });
    } finally {
      setDeleting(false);
    }
  }

  if (meQ.isLoading) {
    return (
      <Screen scroll>
        <Loading />
      </Screen>
    );
  }
  if (meQ.isError && !meQ.data) {
    return (
      <Screen scroll>
        <ErrorRetry error={meQ.error} onRetry={() => meQ.refetch()} />
      </Screen>
    );
  }

  const [hh, mm] = time.split(':').map(Number);
  return (
    <Screen scroll>
      <Section title="Study">
        <TextField
          label="Revision intervals (days)"
          value={text}
          onChangeText={setIntervalsText}
          error={parsed.error}
          keyboardType="numbers-and-punctuation"
        />
        {preview.length > 0 ? (
          <View testID="interval-preview">
            <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
              If you study a topic today, you will revise it on:
            </Text>
            {preview.map(p => (
              <Text
                key={p.step}
                style={{ color: colors.text, paddingVertical: spacing.xs }}
              >
                {`Revision ${p.step}: ${p.date}`}
              </Text>
            ))}
          </View>
        ) : null}
        <Button
          title="Save intervals"
          onPress={saveIntervals}
          loading={savingIntervals}
          disabled={!intervalsDirty || updateMe.isPending}
        />
        <LinkRow
          title="Manage exams & subjects"
          onPress={() => navigation.navigate('ManageExamsSubjects' as never)}
        />
      </Section>

      <Section title="Reminders">
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
          }}
        >
          <Text style={{ color: colors.text, flexShrink: 1 }}>
            Daily reminder
          </Text>
          <Switch
            accessibilityLabel="Daily reminder"
            value={enabled}
            onValueChange={v => {
              setEnabledOv(v);
              saveReminder(v, time);
            }}
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
                const next = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                setTimeOv(next);
                saveReminder(enabled, next);
              }
            }}
          />
        ) : null}
        <LinkRow
          title="Reminder health"
          onPress={() => navigation.navigate('ReminderHealth' as never)}
        />
      </Section>

      <Section title="Appearance">
        <ChipSelect
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={theme}
          // Applies at once and is kept on the phone; the server copy is
          // updated in the background.
          onChange={v => setTheme(v as 'system' | 'light' | 'dark')}
        />
      </Section>

      <Section title="Backup">
        <BackupSection />
      </Section>

      <Section title="Account">
        <Text style={{ color: colors.text }}>{meQ.data?.email ?? ''}</Text>
        <Button
          title="Sign out"
          variant="secondary"
          onPress={() => setSignOutOpen(true)}
        />
        <Button
          title="Delete account"
          variant="danger"
          onPress={() => {
            setConfirmText('');
            setDeleteOpen(true);
          }}
        />
      </Section>

      <Dialog
        visible={signOutOpen}
        title="Sign out?"
        onRequestClose={() => setSignOutOpen(false)}
        actions={
          <>
            <Button title="Sign out" onPress={confirmSignOut} />
            <Button
              title="Cancel"
              variant="text"
              onPress={() => setSignOutOpen(false)}
            />
          </>
        }
      >
        <Text style={{ color: colors.text }}>
          Your topics stay saved. You can sign in again with Google at any time.
        </Text>
      </Dialog>

      <Dialog
        visible={deleteOpen}
        title="Delete account?"
        onRequestClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        actions={
          <>
            <Button
              title="Delete forever"
              variant="danger"
              onPress={doDelete}
              disabled={confirmText !== 'DELETE'}
              loading={deleting}
            />
            <Button
              title="Cancel"
              variant="text"
              disabled={deleting}
              onPress={() => setDeleteOpen(false)}
            />
          </>
        }
      >
        <Text style={{ color: colors.text, marginBottom: spacing.md }}>
          This permanently deletes your account and all your topics. Type DELETE
          to confirm.
        </Text>
        <TextField
          label="Type DELETE"
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
        />
      </Dialog>
    </Screen>
  );
}
