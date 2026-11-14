import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from '../shared/ui/ThemeProvider';
import { HomeScreen } from '../features/home/HomeScreen';
import { ScheduleScreen } from '../features/schedule/ScheduleScreen';
import { TopicsScreen } from '../features/topics/TopicsScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { useReminderSnapshotSync } from '../features/agenda/useReminderSnapshotSync';

export type MainTabParamList = {
  Home: undefined;
  Schedule: undefined;
  Topics: undefined;
  Progress: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const GLYPHS: Record<keyof MainTabParamList, string> = {
  Home: '⌂',
  Schedule: '▦',
  Topics: '☰',
  Progress: '◔',
  Settings: '⚙',
};

// The glyph is an icon, so it keeps a fixed size inside the tab bar's fixed
// icon box even when the phone uses large text (the labels still scale).
export const TabGlyph = ({
  name,
  color,
  size,
}: {
  name: keyof MainTabParamList;
  color: string;
  size: number;
}) => (
  <Text
    allowFontScaling={false}
    importantForAccessibility="no"
    style={{
      color,
      fontSize: Math.round(size * 0.75),
      lineHeight: size,
      textAlign: 'center',
    }}
  >
    {GLYPHS[name]}
  </Text>
);

/**
 * Tab labels grow with the phone's text size, but only up to
 * TAB_LABEL_MAX_SCALE, so they still fit inside the fixed-height tab bar.
 */
export const TAB_LABEL_MAX_SCALE = 1.3;

export const TabLabel = ({
  children,
  color,
  position,
}: {
  children: string;
  color: string;
  position: 'beside-icon' | 'below-icon';
}) => (
  <Text
    numberOfLines={1}
    maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE}
    style={[
      styles.label,
      position === 'beside-icon' ? styles.labelBeside : styles.labelBelow,
      { color },
    ]}
  >
    {children}
  </Text>
);

const styles = StyleSheet.create({
  label: { fontWeight: '500', textAlign: 'center' },
  labelBeside: { fontSize: 13, marginStart: 5 },
  labelBelow: { fontSize: 10 },
});

const tabGlyph = (
  name: keyof MainTabParamList,
  color: string,
  size: number,
) => <TabGlyph name={name} color={color} size={size} />;

export function MainTabs() {
  useReminderSnapshotSync();
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
        tabBarIcon: ({ color, size }) => tabGlyph(route.name, color, size),
        tabBarLabel: TabLabel,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} />
      <Tab.Screen name="Topics" component={TopicsScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
