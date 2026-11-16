import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../shared/ui/Button';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import type { UpdateCheck } from './useUpdateCheck';

export const DOWNLOAD_FAILED_TEXT = "Couldn't open the download link";

export const updateAvailableText = (versionName: string) =>
  `Version ${versionName} is available`;

/**
 * Non-blocking "update available" card shown at the top of the main app.
 * Renders nothing unless the server has a newer release the user has not
 * dismissed with Later.
 */
export function UpdateBanner({ check }: { check: UpdateCheck }) {
  const { colors, radius, spacing } = useTheme();
  const snackbar = useSnackbar();
  const { latest, showBanner, dismiss, download } = check;
  if (!showBanner || !latest) return null;

  async function onDownload() {
    const ok = await download();
    if (!ok) snackbar.show({ message: DOWNLOAD_FAILED_TEXT });
  }

  return (
    <View
      testID="update-banner"
      accessibilityRole="summary"
      style={{
        borderWidth: 1,
        borderColor: colors.accent,
        backgroundColor: colors.softAccent,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        gap: spacing.xs,
      }}
    >
      <Text style={{ color: colors.text, fontWeight: '700' }}>
        {updateAvailableText(latest.latestVersionName)}
      </Text>
      {latest.notes ? (
        <Text style={{ color: colors.muted }}>{latest.notes}</Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        <Button title="Later" variant="text" onPress={() => dismiss()} />
        <Button title="Download" variant="text" onPress={onDownload} />
      </View>
    </View>
  );
}
