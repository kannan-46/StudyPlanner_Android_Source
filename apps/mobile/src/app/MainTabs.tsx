import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Banner } from '../shared/ui/Banner';
import { useTheme } from '../shared/ui/ThemeProvider';
import { useOnline } from '../shared/lib/useOnline';
import { HomeScreen } from '../features/home/HomeScreen';
import { ScheduleScreen } from '../features/schedule/ScheduleScreen';
import { TopicsScreen } from '../features/topics/TopicsScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';

export type MainTabParamList = {
  Home: undefined;
  Schedule: undefined;
  Topics: undefined;
  Progress: undefined;
  Settings: undefined;
};

export const OFFLINE_TEXT = "No connection — changes can't be saved right now";

const Tab = createBottomTabNavigator<MainTabParamList>();

const glyph = (color: string) => (
  <Text style={{ color, fontSize: 16 }}>●</Text>
);

export function MainTabs() {
  const online = useOnline();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {online ? null : <Banner tone="warning" text={OFFLINE_TEXT} />}
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: { backgroundColor: colors.surface },
          tabBarIcon: ({ color }) => glyph(color),
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Schedule" component={ScheduleScreen} />
        <Tab.Screen name="Topics" component={TopicsScreen} />
        <Tab.Screen name="Progress" component={ProgressScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </View>
  );
}
