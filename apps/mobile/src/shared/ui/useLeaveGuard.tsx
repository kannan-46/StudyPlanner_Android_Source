import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NavigationAction } from '@react-navigation/native';
import { ConfirmDialog } from './ConfirmDialog';
import { useSnackbar } from './Snackbar';

export const STILL_SAVING_MESSAGE = 'Still saving. Please wait a moment.';

/**
 * Asks "Discard changes?" before a form with unsaved changes is left (back
 * arrow, Android back button or gesture).
 *
 * - `saving`: pass true while the form's save is in flight. Leaving is then
 *   held without the discard warning (the input is not lost: it is being
 *   saved) and a short "Still saving" note is shown instead. It may lag a
 *   commit behind (e.g. reported from a child form with
 *   `useEffect(() => onSavingChange?.(saving))`): once `leaveAfterSave` has
 *   been called, nothing is blocked any more.
 * - `leaveAfterSave(after?)` closes the screen without asking once the form
 *   has been saved. `after` runs once the screen has gone (e.g. to show the
 *   "Topic added" snackbar), so the snackbar appears straight away in its
 *   final place above the tab bar instead of jumping up.
 */
export function useLeaveGuard(dirty: boolean, saving = false) {
  const navigation = useNavigation();
  const snackbar = useSnackbar();
  const [pending, setPending] = useState<NavigationAction | null>(null);
  const [saved, setSaved] = useState(false);
  const left = useRef(false);
  const afterLeave = useRef<(() => void) | undefined>(undefined);

  // Once saved, never block: a form that reports `saving` through an effect
  // can still say "saving" in the commit where the save has already finished,
  // and blocking then would strand the student on the filled-in form.
  usePreventRemove(!saved && (saving || dirty), ({ data }) => {
    if (saving) snackbar.show({ message: STILL_SAVING_MESSAGE });
    else setPending(data.action);
  });

  // A save that starts or finishes closes any discard prompt left open.
  useEffect(() => {
    if (saving || saved) setPending(null);
  }, [saving, saved]);

  useEffect(() => {
    if (!saved || left.current) return;
    left.current = true;
    navigation.goBack();
    const after = afterLeave.current;
    afterLeave.current = undefined;
    // The pop and the next screen's focus effects (tab-bar lift) run in this
    // task; run `after` in the next one so it sees the final layout.
    if (after) setTimeout(after, 0);
  }, [saved, navigation]);

  const leaveAfterSave = useCallback((after?: () => void) => {
    afterLeave.current = after;
    setSaved(true);
  }, []);

  const discard = () => {
    const action = pending;
    setPending(null);
    if (action) navigation.dispatch(action);
  };

  const dialog = (
    <ConfirmDialog
      visible={pending !== null}
      title="Discard changes?"
      message="You haven't saved this yet. If you leave now, what you've typed will be lost."
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      destructive
      onConfirm={discard}
      onCancel={() => setPending(null)}
    />
  );

  return { dialog, leaveAfterSave };
}
