import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  DEFAULT_SETTINGS,
  createSchedule,
  localToday,
  type UpdateMeInput,
} from '@planner/shared';
import { isSessionEndedError, userMessage } from '../../shared/api/errors';
import { useAnnounce } from '../../shared/ui/announce';
import { Banner } from '../../shared/ui/Banner';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { Dialog } from '../../shared/ui/Dialog';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { Screen } from '../../shared/ui/Screen';
import { ScreenTitle } from '../../shared/ui/ScreenTitle';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { TextField } from '../../shared/ui/TextField';
import { useTheme, useThemeMode } from '../../shared/ui/ThemeProvider';
import { formatClockTime, formatDate } from '../../shared/lib/format';
import { useAppForeground } from '../../shared/lib/useAppForeground';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { uses24HourClock } from '../../native/config';
import {
  configureReminders,
  getReminderStatus,
  openReminderSettings,
  requestNotificationPermission,
  type ReminderStatus,
} from '../../native/reminders';
import { TAB_TITLES } from '../../app/tabTitles';
import { useAuth } from '../auth/AuthProvider';
import { useDeleteAccount, useMe, useUpdateMe } from '../me/hooks';
import {
  DOWNLOAD_FAILED_TEXT,
  UPDATE_INSTALL_HINT,
  updateAvailableText,
} from '../appUpdate/UpdateDialog';
import { useUpdateCheck } from '../appUpdate/useUpdateCheck';
import { useExportToFile } from '../backup/hooks';
import {
  INTERVALS_HINT,
  INTERVALS_LABEL,
  parseIntervalsText,
} from '../onboarding/intervalsText';
import { BackupSection } from './BackupSection';

const pad = (n: number) => String(n).padStart(2, '0');

export const EMPTY_INTERVALS_MESSAGE =
  'Enter at least one interval, like 4, 7, 15';
export const INTERVALS_SAVED_TEXT =
  'Intervals saved — new topics will use them';
export const INTERVALS_SCOPE_TEXT =
  'Used for topics you add from now on. Existing topics keep their own schedule. To change one, open it, tap Edit and look under Advanced.';
export const NOTIFICATIONS_BLOCKED_TEXT =
  "Notifications are blocked, so reminders won't appear";
export const EXACT_ALARMS_OFF_TEXT = 'Reminders may come a few minutes late';
export const CHECK_FAILED_TEXT = "Couldn't check for updates — try again";
export const UP_TO_DATE_TEXT = 'You have the latest version';
export const ACCOUNT_DELETED_TEXT =
  'Your account and all its data were deleted';
export const DELETE_ACCOUNT_TEXT =
  'This permanently deletes your account and everything in it: topics, exams, subjects, mock tests and settings. Type DELETE to confirm.';

/** A Settings visit re-checks for updates when the last answer is this old. */
export const UPDATE_RECHECK_AFTER_MS = 15 * 60 * 1000;

function parseIntervals(text: string): { value?: number[]; error?: string } {
  if (text.trim() === '') return { error: EMPTY_INTERVALS_MESSAGE };
  return parseIntervalsText(text);
}

/**
 * A request that comes back this fast was refused without a dialog: Android
 * stops asking after the user said "Don't allow" (twice on Android 13+).
 */
const NO_DIALOG_MS = 600;

/**
 * The phone's reminder permissions, refreshed on focus and on return to the
 * app, plus `allowNotifications`: asks Android for notification permission,
 * or opens the app's notification settings when Android will not ask.
 */
export function useNotificationPermission(): {
  status: ReminderStatus | null;
  refresh: () => Promise<ReminderStatus | null>;
  allowNotifications: () => Promise<void>;
} {
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const denied = useRef(false);
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

  const allowNotifications = useCallback(async () => {
    try {
      if (denied.current) {
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
      denied.current = true;
    } catch {
      // Nothing more the app can do; the warning stays until it is fixed.
    }
  }, [refresh]);

  return { status, refresh, allowNotifications };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <SectionHeading style={{ marginBottom: spacing.sm }}>
        {title}
      </SectionHeading>
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

/** Installed version, and the latest release when the server has a newer one. */
function AppVersionRow() {
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
  const check = useUpdateCheck();
  const { installed, latest, updateAvailable, recheck, checkedAt } = check;
  const current = installed.name || 'unknown';

  // An answer from hours ago may miss a new release: ask again on a visit.
  useFocusEffect(
    useCallback(() => {
      if (checkedAt > 0 && Date.now() - checkedAt > UPDATE_RECHECK_AFTER_MS) {
        recheck().catch(() => undefined);
      }
    }, [checkedAt, recheck]),
  );

  async function onDownload() {
    const ok = await check.download();
    if (!ok) snackbar.show({ message: DOWNLOAD_FAILED_TEXT });
  }
  async function onCheck() {
    const outcome = await recheck();
    if (outcome === 'failed') snackbar.show({ message: CHECK_FAILED_TEXT });
    else if (outcome === 'latest') {
      snackbar.show({ message: `Checked — ${UP_TO_DATE_TEXT.toLowerCase()}` });
    }
  }
  return (
    <View testID="app-version-row" style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.text, fontSize: 16 }}>
        {updateAvailable
          ? `App version ${current} · Update available`
          : `App version ${current}`}
      </Text>
      {updateAvailable && latest ? (
        <>
          <Text style={{ color: colors.text }}>
            {updateAvailableText(latest.latestVersionName)}
          </Text>
          <Text style={{ color: colors.muted }}>{UPDATE_INSTALL_HINT}</Text>
          {latest.notes ? (
            <Text style={{ color: colors.muted }}>{latest.notes}</Text>
          ) : null}
          <Button title="Download update" onPress={onDownload} />
        </>
      ) : (
        <>
          {/* Only after a check that worked: a failed one proves nothing. */}
          {latest && !check.checkFailed ? (
            <Text style={{ color: colors.muted }}>{UP_TO_DATE_TEXT}</Text>
          ) : null}
          <Button
            title="Check for updates"
            variant="secondary"
            onPress={onCheck}
            loading={check.checking}
          />
        </>
      )}
    </View>
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
  const permission = useNotificationPermission();
  const { exportToFile } = useExportToFile();
  useRefetchOnFocus(meQ.refetch, permission.refresh);

  // Optimistic overrides; cleared once the save settles (success shows the
  // server value, failure reverts to it).
  const [intervalsText, setIntervalsText] = useState<string | null>(null);
  // Errors wait until the user leaves the field or taps Save, never mid-typing.
  const [intervalsTouched, setIntervalsTouched] = useState(false);
  const [enabledOv, setEnabledOv] = useState<boolean | null>(null);
  const [timeOv, setTimeOv] = useState<string | null>(null);
  // Counts reminder saves, so quick taps are settled by the latest one only.
  const reminderSaveId = useRef(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteNote, setDeleteNote] = useState<string | null>(null);
  const [savingIntervals, setSavingIntervals] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  useAnnounce(deleteOpen ? deleteError : null);

  const settings = meQ.data?.settings ?? DEFAULT_SETTINGS;
  const intervalsSaved = settings.intervals.join(', ');
  const text = intervalsText ?? intervalsSaved;
  const parsed = parseIntervals(text);
  const intervalsDirty =
    !!parsed.value && parsed.value.join(', ') !== intervalsSaved;
  const enabled = enabledOv ?? settings.dailyReminder;
  const time = timeOv ?? settings.reminderTime;

  // While typing, keep showing the last valid preview instead of blanking it.
  const lastValid = useRef<number[] | undefined>(undefined);
  if (parsed.value) lastValid.current = parsed.value;
  const shown =
    parsed.value ?? (intervalsTouched ? undefined : lastValid.current);
  const preview = useMemo(() => {
    if (!shown) return [];
    const today = localToday();
    return createSchedule(today, shown, () => 'p').revisions.map(r => ({
      step: r.step,
      date: formatDate(r.dueOn, today),
    }));
  }, [shown]);

  /** Saves a patch; returns true on success, snackbar + false on failure. */
  async function save(patch: UpdateMeInput): Promise<boolean> {
    try {
      await updateMe.mutateAsync(patch);
      return true;
    } catch (e) {
      if (!isSessionEndedError(e)) snackbar.show({ message: userMessage(e) });
      return false;
    }
  }

  async function saveIntervals() {
    if (!parsed.value) {
      setIntervalsTouched(true);
      return;
    }
    setSavingIntervals(true);
    const ok = await save({ settings: { intervals: parsed.value } });
    setSavingIntervals(false);
    // On failure keep what the user typed, so Save can simply be tapped again.
    if (ok) {
      setIntervalsText(null);
      setIntervalsTouched(false);
      snackbar.show({ message: INTERVALS_SAVED_TEXT });
    }
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
      permission.refresh();
    }
    setEnabledOv(null);
    setTimeOv(null);
  }

  function onReminderSwitch(v: boolean) {
    setEnabledOv(v);
    saveReminder(v, time);
    // The permission belongs to the phone: ask at once, not after the save.
    if (v && permission.status?.notificationsEnabled === false) {
      permission.allowNotifications();
    }
  }

  function openDelete() {
    setConfirmText('');
    setDeleteError(null);
    setDeleteNote(null);
    setDeleteOpen(true);
  }

  async function exportBeforeDelete() {
    // A snackbar would be drawn behind the dialog, so the dialog closes while
    // the save screen is open and comes back with the outcome inside it.
    setDeleteOpen(false);
    setDeleteError(null);
    setDeleteNote(null);
    const out = await exportToFile();
    if (out.status === 'saved') setDeleteNote('Backup saved');
    else if (out.status === 'failed') setDeleteError(out.message);
    setDeleteOpen(true);
  }

  async function doDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount.mutateAsync();
      // Keep the spinner until sign-out has finished; the screen goes away.
      await signOut();
      snackbar.show({ message: ACCOUNT_DELETED_TEXT });
    } catch (e) {
      if (isSessionEndedError(e)) return;
      // Shown inside the dialog: a snackbar would sit behind it. The delete
      // may have partly run, so only invite another try.
      setDeleteError(`Couldn't delete your account. ${userMessage(e)}`);
    } finally {
      setDeleting(false);
    }
  }

  if (meQ.isLoading) {
    return (
      <Screen scroll scrollToTopOnTabPress>
        <ScreenTitle>{TAB_TITLES.Settings}</ScreenTitle>
        <Loading />
      </Screen>
    );
  }
  if (meQ.isError && !meQ.data) {
    return (
      <Screen scroll scrollToTopOnTabPress>
        <ScreenTitle>{TAB_TITLES.Settings}</ScreenTitle>
        <ErrorRetry error={meQ.error} onRetry={() => meQ.refetch()} />
      </Screen>
    );
  }

  const [hh, mm] = time.split(':').map(Number);
  const shownTime = formatClockTime(time, uses24HourClock());
  const reminderStatus = permission.status;
  const notificationsBlocked =
    enabled && reminderStatus !== null && !reminderStatus.notificationsEnabled;
  const alarmsLate =
    enabled &&
    reminderStatus !== null &&
    !notificationsBlocked &&
    !reminderStatus.exactAlarmsAllowed;
  const deleteReady = confirmText.trim().toUpperCase() === 'DELETE';
  return (
    <Screen scroll scrollToTopOnTabPress>
      <ScreenTitle>{TAB_TITLES.Settings}</ScreenTitle>
      <Section title="Study">
        <TextField
          label={INTERVALS_LABEL}
          value={text}
          onChangeText={t => {
            setIntervalsText(t);
            setIntervalsTouched(false);
          }}
          onBlur={() => setIntervalsTouched(true)}
          error={intervalsTouched ? parsed.error : undefined}
          // A number keyboard; dots, dashes and spaces work as separators too.
          keyboardType={
            Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'
          }
        />
        <Text style={{ color: colors.muted }}>{INTERVALS_HINT}</Text>
        <Text testID="intervals-scope" style={{ color: colors.muted }}>
          {INTERVALS_SCOPE_TEXT}
        </Text>
        {preview.length > 0 ? (
          <View testID="interval-preview">
            <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
              A topic you add today would be revised on:
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
            onValueChange={onReminderSwitch}
          />
        </View>
        {notificationsBlocked ? (
          <Banner
            tone="warning"
            text={NOTIFICATIONS_BLOCKED_TEXT}
            actionLabel="Fix"
            onAction={() => {
              permission.allowNotifications();
            }}
          />
        ) : null}
        {alarmsLate ? (
          <Banner
            tone="info"
            text={EXACT_ALARMS_OFF_TEXT}
            actionLabel="Allow"
            onAction={() => {
              openReminderSettings('exactAlarm').catch(() => {});
            }}
          />
        ) : null}
        <Text style={{ color: colors.muted }}>Remind me at</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remind me at"
          accessibilityValue={{ text: shownTime }}
          accessibilityHint="Opens a clock to change the time"
          onPress={() => setPickerOpen(true)}
          style={{
            minHeight: 48,
            justifyContent: 'center',
            paddingHorizontal: spacing.md,
            backgroundColor: colors.input,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.md,
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
          groupLabel="Theme"
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

      <Section title="App">
        <AppVersionRow />
      </Section>

      <Section title="Account">
        {meQ.data?.email ? (
          <Text style={{ color: colors.text }}>
            {`Signed in as ${meQ.data.email}`}
          </Text>
        ) : null}
        <Button
          title="Sign out"
          variant="secondary"
          onPress={() => setSignOutOpen(true)}
        />
        <Button
          title="Delete account"
          variant="dangerText"
          onPress={openDelete}
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
              disabled={!deleteReady}
              disabledHint="Type DELETE above to turn this on"
              loading={deleting}
            />
            <Button
              title="Export a backup first"
              variant="secondary"
              disabled={deleting}
              onPress={exportBeforeDelete}
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
          {DELETE_ACCOUNT_TEXT}
        </Text>
        <TextField
          label="Type DELETE"
          value={confirmText}
          onChangeText={t => {
            setDeleteError(null);
            setConfirmText(t);
          }}
          autoCapitalize="characters"
          // No suggestion strip, so a picked word never adds a hidden space.
          autoCorrect={false}
          autoComplete="off"
        />
        {deleteNote ? (
          <Text testID="delete-note" style={{ color: colors.success }}>
            {deleteNote}
          </Text>
        ) : null}
        {deleteError ? (
          <Text
            testID="delete-error"
            accessibilityRole="alert"
            style={{ color: colors.danger, marginTop: spacing.sm }}
          >
            {deleteError}
          </Text>
        ) : null}
      </Dialog>
    </Screen>
  );
}
