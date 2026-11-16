import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Asks the screen reader (TalkBack) to read `message` now. Does nothing when
 * no screen reader is running. Use it for messages that appear without the
 * user moving focus to them: a failed save, a sign-in error, going offline.
 *
 * On Android `accessibilityRole="alert"` announces nothing, and a live region
 * that mounts together with its text is often skipped, so say it explicitly.
 */
export function announce(message: string | null | undefined): void {
  const text = message?.trim();
  if (!text) return;
  try {
    AccessibilityInfo.announceForAccessibility(text);
  } catch {
    // Never let an accessibility call break the screen.
  }
}

/**
 * Announces `message` when it appears and again whenever it changes to a new
 * non-empty text. Pass null/undefined/'' while there is nothing to say.
 * `enabled` lets a caller switch it off (e.g. a banner that is always there).
 */
export function useAnnounce(
  message: string | null | undefined,
  enabled = true,
): void {
  useEffect(() => {
    if (enabled) announce(message);
  }, [message, enabled]);
}
