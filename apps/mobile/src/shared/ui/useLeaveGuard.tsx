import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NavigationAction } from '@react-navigation/native';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { useTheme } from './ThemeProvider';

/**
 * Asks "Discard changes?" before a form with unsaved changes is left (back
 * arrow, Android back button or gesture). `leaveAfterSave` closes the screen
 * without asking once the form has been saved.
 */
export function useLeaveGuard(dirty: boolean) {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [pending, setPending] = useState<NavigationAction | null>(null);
  const [saved, setSaved] = useState(false);
  const left = useRef(false);

  usePreventRemove(dirty && !saved, ({ data }) => setPending(data.action));

  useEffect(() => {
    if (!saved || left.current) return;
    left.current = true;
    navigation.goBack();
  }, [saved, navigation]);

  const leaveAfterSave = useCallback(() => setSaved(true), []);

  const discard = () => {
    const action = pending;
    setPending(null);
    if (action) navigation.dispatch(action);
  };

  const dialog = (
    <Dialog
      visible={pending !== null}
      title="Discard changes?"
      onRequestClose={() => setPending(null)}
      actions={
        <>
          <Button title="Discard" variant="danger" onPress={discard} />
          <Button
            title="Keep editing"
            variant="secondary"
            onPress={() => setPending(null)}
          />
        </>
      }
    >
      <Text style={{ color: colors.text }}>
        You haven't saved this yet. If you leave now, what you've typed will be
        lost.
      </Text>
    </Dialog>
  );

  return { dialog, leaveAfterSave };
}
