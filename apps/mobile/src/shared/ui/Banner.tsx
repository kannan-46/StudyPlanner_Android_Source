import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAnnounce } from './announce';
import { useTheme } from './ThemeProvider';

export type BannerTone = 'info' | 'warning' | 'error';

export function Banner({
  tone,
  text,
  actionLabel,
  onAction,
  announce = false,
}: {
  tone: BannerTone;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Read the text aloud to TalkBack when the banner appears (and when its
   * text changes). Use it for banners that show up on their own, like
   * "No connection"; leave it off for banners that are always on a screen.
   */
  announce?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const { stroke, fill } =
    tone === 'error'
      ? { stroke: colors.danger, fill: colors.softDanger }
      : tone === 'warning'
      ? { stroke: colors.warning, fill: colors.softWarning }
      : { stroke: colors.accent, fill: colors.softAccent };
  useAnnounce(text, announce);
  return (
    <View
      testID="banner"
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: stroke,
        backgroundColor: fill,
        borderRadius: radius.md,
        paddingLeft: spacing.md,
        minHeight: 48,
      }}
    >
      <Text
        style={{
          color: colors.text,
          flexShrink: 1,
          paddingVertical: spacing.sm,
        }}
      >
        {text}
      </Text>
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={{
            minHeight: 48,
            minWidth: 48,
            paddingHorizontal: spacing.md,
            justifyContent: 'center',
          }}
        >
          {/* The app's action colour, never muted (that reads as disabled). */}
          <Text
            testID="banner-action"
            style={{
              color: colors.accent,
              fontWeight: '700',
              textDecorationLine: 'underline',
            }}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
