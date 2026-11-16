import { cancelOneShot } from '../../native/reminders';
import { saveFocusTimer } from './localPrefs';

/** Id of the focus timer's one-shot alarm (letters, digits, _ or -). */
export const FOCUS_ALARM_ID = 'focus_timer';

/**
 * Stops a running focus session for good: cancels its alarm (and removes the
 * notification if it already showed) and forgets the saved session, so it
 * neither rings after sign-out nor comes back for the next account.
 * Never rejects.
 */
export async function clearFocusSession(): Promise<void> {
  try {
    await cancelOneShot(FOCUS_ALARM_ID);
  } catch {
    // Best effort: the saved session is still removed below.
  }
  await saveFocusTimer(null);
}
