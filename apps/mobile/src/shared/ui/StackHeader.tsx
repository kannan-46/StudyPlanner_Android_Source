import React, { createContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { useTheme } from './ThemeProvider';

/**
 * True for screens drawn under a StackHeader. The header already sits below
 * the status bar, so Screen must not add the top inset a second time.
 */
export const UnderHeaderContext = createContext(false);

/** The title a header shows: options.title, else the route name. */
export function headerTitle(
  options: NativeStackHeaderProps['options'],
  routeName: string,
): string {
  return typeof options.title === 'string' ? options.title : routeName;
}

/**
 * Header for pushed stack screens: a 48 dp back arrow and the screen title,
 * in the app's theme colours. Long titles wrap to two lines.
 */
export function StackHeader({
  back,
  options,
  route,
  navigation,
}: NativeStackHeaderProps) {
  const { colors, spacing } = useTheme();
  return (
    <SafeAreaView
      testID="stack-header"
      edges={['top', 'left', 'right']}
      style={{
        backgroundColor: colors.background,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.line,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 56,
          paddingHorizontal: spacing.xs,
          paddingVertical: spacing.xs,
          gap: spacing.xs,
        }}
      >
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            android_ripple={{ color: colors.line, borderless: true }}
            style={{
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              allowFontScaling={false}
              style={{ color: colors.text, fontSize: 24, lineHeight: 28 }}
            >
              ←
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: spacing.md }} />
        )}
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          maxFontSizeMultiplier={1.5}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 20,
            fontWeight: '700',
            paddingRight: spacing.md,
          }}
        >
          {headerTitle(options, route.name)}
        </Text>
      </View>
    </SafeAreaView>
  );
}
