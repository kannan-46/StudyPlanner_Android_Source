import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAnnounce } from '../../shared/ui/announce';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { useTheme } from '../../shared/ui/ThemeProvider';
import type { UpdateCheck } from './useUpdateCheck';

export const UPDATE_TITLE = 'Update available';

export const DOWNLOAD_FAILED_TEXT = "Couldn't open the download link";

export const updateAvailableText = (versionName: string) =>
  `Version ${versionName} is available`;

/** What happens after Download: the browser saves the APK, then you install it. */
export const UPDATE_INSTALL_HINT =
  'Download it, then open the downloaded file to install it.';

/**
 * Centred "Update available" dialog for the main app. Renders nothing unless
 * the server has a newer release the user has not dismissed with Later.
 * Later (and Back) remembers the choice for this version; Download opens the
 * link and closes the dialog until the next check.
 */
export function UpdateDialog({ check }: { check: UpdateCheck }) {
  const { colors, spacing } = useTheme();
  const { latest, showPrompt, dismiss, close, download } = check;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!showPrompt) setFailed(false);
  }, [showPrompt]);
  useAnnounce(failed ? DOWNLOAD_FAILED_TEXT : null);
  if (!showPrompt || !latest) return null;

  function onLater() {
    dismiss().catch(() => undefined);
  }

  async function onDownload() {
    const ok = await download();
    if (ok) close();
    else setFailed(true);
  }

  return (
    <Dialog
      visible
      title={UPDATE_TITLE}
      onRequestClose={onLater}
      actions={
        <>
          <Button title="Download" onPress={onDownload} />
          <Button title="Later" variant="secondary" onPress={onLater} />
        </>
      }
    >
      <View testID="update-dialog" style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.text, fontSize: 16 }}>
          {updateAvailableText(latest.latestVersionName)}
        </Text>
        <Text style={{ color: colors.muted }}>{UPDATE_INSTALL_HINT}</Text>
        {latest.notes ? (
          <Text style={{ color: colors.muted }}>{latest.notes}</Text>
        ) : null}
        {failed ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            {DOWNLOAD_FAILED_TEXT}
          </Text>
        ) : null}
      </View>
    </Dialog>
  );
}
