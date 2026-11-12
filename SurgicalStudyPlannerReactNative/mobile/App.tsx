import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  AppState,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {io} from 'socket.io-client';
import {API_BASE_URL} from './src/config/api';
import {AuthProvider, useAuth} from './src/auth/AuthContext';
import {AuthScreen} from './src/screens/AuthScreen';
import {MainTabs} from './src/navigation/MainTabs';
import {ApiError, getPlanner, savePlanner} from './src/api/client';
import {syncNativeAlarms} from './src/planner/nativeAlarms';
import {addDays, localDateString} from './src/planner/revisions';
import {
  DEFAULT_SETTINGS,
  type MockTest,
  type PlannerDocument,
  type PlannerDraft,
  type PlannerSettings,
  type Topic,
} from './src/types/planner';
import {darkTheme, lightTheme, type Theme} from './src/ui/theme';
import {Button, Notice} from './src/ui/components';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const auth = useAuth();
  if (auth.loading) {
    return <LoadingScreen theme={lightTheme} message="Preparing your planner…" />;
  }
  if (!auth.token) {
    return (
      <SafeAreaView style={{flex: 1, backgroundColor: lightTheme.background}} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <AuthScreen
          theme={lightTheme}
          registrationEnabled={auth.registrationEnabled}
          configError={auth.configError}
          onLogin={auth.signIn}
          onRegister={auth.createAccount}
          onRetry={auth.refreshApiConfig}
        />
      </SafeAreaView>
    );
  }
  return (
    <PlannerSession
      key={auth.token}
      token={auth.token}
      accountEmail={auth.account?.email ?? ''}
      onSignOut={auth.signOut}
    />
  );
}

function PlannerSession({
  token,
  accountEmail,
  onSignOut,
}: {
  token: string;
  accountEmail: string;
  onSignOut: () => Promise<void>;
}) {
  const [planner, setPlanner] = useState<PlannerDocument | null>(null);
  const plannerRef = useRef<PlannerDocument | null>(null);
  const savingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [alarmWarning, setAlarmWarning] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const theme = planner?.settings.dark ? darkTheme : lightTheme;

  const applyPlanner = useCallback(async (next: PlannerDocument) => {
    const current = plannerRef.current;
    if (current && next.version < current.version) {
      return;
    }
    plannerRef.current = next;
    setPlanner(next);
    try {
      await syncNativeAlarms(next);
      setAlarmWarning(null);
    } catch (error) {
      setAlarmWarning(error instanceof Error ? error.message : 'Planner saved, but device reminders could not refresh.');
    }
  }, []);

  const refreshPlanner = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const current = await getPlanner(token);
      await applyPlanner(current);
      setConnectionError(null);
      setActionError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await onSignOut();
        return;
      }
      const message = error instanceof Error ? error.message : 'Could not load your planner.';
      setConnectionError(message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [token, applyPlanner, onSignOut]);

  useEffect(() => {
    void refreshPlanner(true);
  }, [refreshPlanner]);

  useEffect(() => {
    let wasActive = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', nextState => {
      const isActive = nextState === 'active';
      if (isActive && !wasActive) void refreshPlanner();
      wasActive = isActive;
    });
    return () => subscription.remove();
  }, [refreshPlanner]);

  useEffect(() => {
    if (API_BASE_URL.includes('.invalid')) {
      setLive(false);
      return;
    }
    const socket = io(API_BASE_URL, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: {token},
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });
    socket.on('connect', () => {
      setLive(true);
      void refreshPlanner();
    });
    socket.on('disconnect', () => setLive(false));
    socket.on('connect_error', error => {
      setLive(false);
      if (error.message === 'unauthorized') void onSignOut();
    });
    socket.on('planner:changed', () => void refreshPlanner());
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, refreshPlanner, onSignOut]);

  const commit = useCallback(async (
    update: (current: PlannerDocument) => PlannerDraft,
  ): Promise<void> => {
    if (connectionError) {
      throw new Error('Reconnect to the API before editing your planner.');
    }
    if (savingRef.current) {
      throw new Error('A planner save is already in progress. Please wait.');
    }
    const current = plannerRef.current;
    if (!current) {
      throw new Error('Your planner is not loaded yet. Try again in a moment.');
    }

    savingRef.current = true;
    setSaving(true);
    setActionError(null);
    try {
      const saved = await savePlanner(token, update(current), current.version);
      await applyPlanner(saved);
      setConnectionError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const newest = await getPlanner(token);
          await applyPlanner(newest);
        } catch (refreshError) {
          setConnectionError(refreshError instanceof Error ? refreshError.message : 'Could not reload the latest planner.');
        }
        const message = 'Another device saved changes first. The latest planner is loaded; review it and reapply your change.';
        setActionError(message);
        throw new Error(message);
      }
      if (error instanceof ApiError && error.status === 401) {
        await onSignOut();
      }
      const message = error instanceof Error ? error.message : 'Could not save your planner.';
      setActionError(message);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [token, connectionError, applyPlanner, onSignOut]);

  const saveTopic = async (topic: Topic, oldId?: string) => commit(current => ({
    ...current,
    topics: oldId
      ? current.topics.map(existing => existing.id === oldId ? topic : existing)
      : [topic, ...current.topics],
  }));

  const deleteTopic = async (id: string) => {
    try {
      await commit(current => ({...current, topics: current.topics.filter(topic => topic.id !== id)}));
    } catch {
      // The persistent error banner explains why the change did not save.
    }
  };

  const completeRevision = (topicId: string, revisionIndex: number) => {
    void commit(current => ({
      ...current,
      topics: current.topics.map(topic => topic.id !== topicId ? topic : {
        ...topic,
        revisions: topic.revisions.map((revision, index) => index !== revisionIndex ? revision : {
          ...revision,
          done: true,
          completedAt: localDateString(),
        }),
      }),
    })).catch(() => undefined);
  };

  const snoozeRevision = (topicId: string, revisionIndex: number) => {
    void commit(current => ({
      ...current,
      topics: current.topics.map(topic => topic.id !== topicId ? topic : {
        ...topic,
        revisions: topic.revisions.map((revision, index) => index !== revisionIndex ? revision : {
          ...revision,
          date: addDays(revision.date, 1),
        }),
      }),
    })).catch(() => undefined);
  };

  const addMockTest = async (test: MockTest) => commit(current => ({
    ...current,
    mockTests: [test, ...current.mockTests],
  }));

  const deleteMockTest = async (id: string) => {
    try {
      await commit(current => ({...current, mockTests: current.mockTests.filter(test => test.id !== id)}));
    } catch {
      // The persistent error banner explains why the change did not save.
    }
  };

  const saveSettings = async (settings: PlannerSettings) => commit(current => ({...current, settings}));

  const resetPlanner = async () => {
    try {
      await commit(() => ({
        settings: {...DEFAULT_SETTINGS, intervals: [...DEFAULT_SETTINGS.intervals]},
        topics: [],
        mockTests: [],
      }));
    } catch {
      // The persistent error banner explains why the change did not save.
    }
  };

  if (loading && !planner) {
    return <LoadingScreen theme={theme} message="Loading your cloud planner…" />;
  }
  if (connectionError || !planner) {
    return (
      <SafeAreaView style={[styles.root, {backgroundColor: theme.background}]} edges={['top', 'bottom']}>
        <StatusBar barStyle={theme === darkTheme ? 'light-content' : 'dark-content'} />
        <View style={styles.errorContent}>
          <Text style={[styles.title, {color: theme.text}]}>Can't reach your planner</Text>
          <Notice theme={theme} danger>{connectionError ?? 'The API connection is not ready.'}</Notice>
          <Button theme={theme} label="Retry" busy={loading} onPress={() => void refreshPlanner(true)} />
          <Button theme={theme} kind="text" label="Sign out" onPress={() => void onSignOut()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, {backgroundColor: theme.background}]} edges={['top', 'bottom']}>
      <StatusBar barStyle={theme === darkTheme ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, {backgroundColor: theme.surface, borderColor: theme.line}]}>
        <View style={{flex: 1}}>
          <Text style={[styles.title, {color: theme.text}]}>Surgical Study Planner</Text>
          <Text style={[styles.subtitle, {color: theme.muted}]} numberOfLines={1}>{accountEmail} · {live ? 'Live' : 'Online'}</Text>
        </View>
        <Text style={{fontSize: 25}}>🩺</Text>
      </View>
      {connectionError ? (
        <View style={styles.connectionNotice}>
          <Notice theme={theme} danger>{connectionError} Changes are paused until the API reconnects.</Notice>
          <Button theme={theme} kind="secondary" label="Retry sync" busy={loading} onPress={() => void refreshPlanner(true)} />
        </View>
      ) : null}
      {alarmWarning ? <Notice theme={theme} danger>{alarmWarning}</Notice> : null}
      {actionError ? <Notice theme={theme} danger>{actionError}</Notice> : null}
      <View style={styles.tabs}>
        <MainTabs
          planner={planner}
          theme={theme}
          accountEmail={accountEmail}
          live={live}
          saving={saving}
          canEdit={!connectionError}
          onSaveTopic={saveTopic}
          onDeleteTopic={deleteTopic}
          onComplete={completeRevision}
          onSnooze={snoozeRevision}
          onAddMockTest={addMockTest}
          onDeleteMockTest={deleteMockTest}
          onSaveSettings={saveSettings}
          onResetPlanner={resetPlanner}
          onSignOut={onSignOut}
        />
      </View>
      <View style={styles.refreshOverlay} pointerEvents="none">
        {saving ? <Text style={[styles.savingText, {color: theme.muted}]}>Saving…</Text> : null}
      </View>
    </SafeAreaView>
  );
}

function LoadingScreen({theme, message}: {theme: Theme; message: string}) {
  return (
    <SafeAreaView style={[styles.loading, {backgroundColor: theme.background}]} edges={['top', 'bottom']}>
      <StatusBar barStyle={theme === darkTheme ? 'light-content' : 'dark-content'} />
      <ActivityIndicator size="large" color={theme.accent} />
      <Text style={{color: theme.muted, marginTop: 12}}>{message}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  header: {minHeight: 62, paddingHorizontal: 18, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth},
  title: {fontSize: 17, fontWeight: '900'},
  subtitle: {fontSize: 11, marginTop: 2},
  tabs: {flex: 1},
  connectionNotice: {paddingHorizontal: 14, paddingTop: 8, gap: 7},
  errorContent: {flex: 1, justifyContent: 'center', padding: 22, gap: 14},
  refreshOverlay: {position: 'absolute', top: 70, right: 14},
  savingText: {fontSize: 11, fontWeight: '700'},
});
