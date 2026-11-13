import { NativeModules } from 'react-native';
import { GOOGLE_WEB_CLIENT_ID } from './config';

export type GoogleAuthErrorCode =
  | 'E_CANCELLED'
  | 'E_NO_ACCOUNT'
  | 'E_CONFIG'
  | 'E_FAILED';

export class GoogleAuthError extends Error {
  code: GoogleAuthErrorCode;
  constructor(code: GoogleAuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'GoogleAuthError';
    this.code = code;
  }
}

const KNOWN: GoogleAuthErrorCode[] = [
  'E_CANCELLED',
  'E_NO_ACCOUNT',
  'E_CONFIG',
  'E_FAILED',
];

function toAuthError(e: unknown): GoogleAuthError {
  if (e instanceof GoogleAuthError) return e;
  const code = (e as { code?: string } | null)?.code;
  const message = (e as { message?: string } | null)?.message;
  return new GoogleAuthError(
    KNOWN.includes(code as GoogleAuthErrorCode)
      ? (code as GoogleAuthErrorCode)
      : 'E_FAILED',
    message,
  );
}

export async function signInWithGoogle(): Promise<string> {
  const mod = NativeModules.GoogleAuth;
  if (!mod?.signIn) throw new GoogleAuthError('E_FAILED');
  try {
    const res = await mod.signIn(GOOGLE_WEB_CLIENT_ID);
    if (!res || typeof res.idToken !== 'string' || !res.idToken) {
      throw new GoogleAuthError('E_FAILED');
    }
    return res.idToken;
  } catch (e) {
    throw toAuthError(e);
  }
}

export async function signOutGoogle(): Promise<void> {
  try {
    await NativeModules.GoogleAuth?.signOut?.();
  } catch {
    // best effort
  }
}
