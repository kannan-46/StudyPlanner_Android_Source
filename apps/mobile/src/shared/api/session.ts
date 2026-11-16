/**
 * A counter that changes every time the signed-in session ends (sign-out,
 * session expired). Work started under one session captures it and checks it
 * again before touching the cache, so a save that finishes after sign-out can
 * never write the previous account's data into the next account's session.
 */
let epoch = 0;

export type SessionEpoch = number;

export function currentSession(): SessionEpoch {
  return epoch;
}

/** Marks the current session as over. Call before clearing local data. */
export function endSession(): void {
  epoch += 1;
}

export function isCurrentSession(captured: SessionEpoch): boolean {
  return captured === epoch;
}
