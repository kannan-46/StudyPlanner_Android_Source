import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {MockTest, PlannerDocument, PlannerSettings, Topic} from '../types/planner';
import type {Theme} from '../ui/theme';
import {HomeScreen, type TabName} from '../screens/HomeScreen';
import {TopicsScreen} from '../screens/TopicsScreen';
import {ScheduleScreen} from '../screens/ScheduleScreen';
import {ProgressScreen} from '../screens/ProgressScreen';
import {SettingsScreen} from '../screens/SettingsScreen';

const tabs: Array<{name: TabName; icon: string}> = [
  {name: 'Home', icon: '⌂'},
  {name: 'Topics', icon: '▤'},
  {name: 'Schedule', icon: '▦'},
  {name: 'Progress', icon: '↗'},
  {name: 'Settings', icon: '⚙'},
];

export function MainTabs({
  planner,
  theme,
  accountEmail,
  live,
  saving,
  canEdit,
  onSaveTopic,
  onDeleteTopic,
  onComplete,
  onSnooze,
  onAddMockTest,
  onDeleteMockTest,
  onSaveSettings,
  onResetPlanner,
  onSignOut,
}: {
  planner: PlannerDocument;
  theme: Theme;
  accountEmail: string;
  live: boolean;
  saving: boolean;
  canEdit: boolean;
  onSaveTopic: (topic: Topic, oldId?: string) => Promise<void>;
  onDeleteTopic: (id: string) => Promise<void>;
  onComplete: (topicId: string, revisionIndex: number) => void;
  onSnooze: (topicId: string, revisionIndex: number) => void;
  onAddMockTest: (test: MockTest) => Promise<void>;
  onDeleteMockTest: (id: string) => Promise<void>;
  onSaveSettings: (settings: PlannerSettings) => Promise<void>;
  onResetPlanner: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<TabName>('Home');
  const screenProps = {planner, theme};

  return (
    <View style={styles.root}>
      <View style={styles.screens}>
        <View style={[styles.screen, activeTab !== 'Home' && styles.hidden]}>
          <HomeScreen
            {...screenProps}
            live={live}
            saving={saving || !canEdit}
            onNavigate={setActiveTab}
            onComplete={onComplete}
            onSnooze={onSnooze}
          />
        </View>
        <View style={[styles.screen, activeTab !== 'Topics' && styles.hidden]}>
          <TopicsScreen
            {...screenProps}
            saving={saving || !canEdit}
            onSaveTopic={onSaveTopic}
            onDeleteTopic={onDeleteTopic}
          />
        </View>
        <View style={[styles.screen, activeTab !== 'Schedule' && styles.hidden]}>
          <ScheduleScreen {...screenProps} />
        </View>
        <View style={[styles.screen, activeTab !== 'Progress' && styles.hidden]}>
          <ProgressScreen
            {...screenProps}
            saving={saving || !canEdit}
            onAddMockTest={onAddMockTest}
            onDeleteMockTest={onDeleteMockTest}
          />
        </View>
        <View style={[styles.screen, activeTab !== 'Settings' && styles.hidden]}>
          <SettingsScreen
            {...screenProps}
            email={accountEmail}
            saving={saving}
            canEdit={canEdit}
            onSaveSettings={onSaveSettings}
            onResetPlanner={onResetPlanner}
            onSignOut={onSignOut}
          />
        </View>
      </View>
      <View style={[styles.nav, {backgroundColor: theme.surface, borderColor: theme.line}]}>
        {tabs.map(tab => {
          const selected = activeTab === tab.name;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{selected}}
              onPress={() => setActiveTab(tab.name)}
              style={styles.navItem}>
              <Text style={[styles.navIcon, {color: selected ? theme.accent : theme.muted}]}>{tab.icon}</Text>
              <Text style={[styles.navLabel, {color: selected ? theme.accent : theme.muted, fontWeight: selected ? '800' : '500'}]}>{tab.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  screens: {flex: 1},
  screen: {flex: 1},
  hidden: {display: 'none'},
  nav: {flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 7, paddingBottom: 3},
  navItem: {flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 1},
  navIcon: {fontSize: 19, lineHeight: 23},
  navLabel: {fontSize: 10},
});
