import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../../core/errors/app-error';
import type { GoogleVerifier } from '../../core/deps';

export function createGoogleVerifier(webClientId: string): GoogleVerifier {
  const client = new OAuth2Client();
  return async idToken => {
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: webClientId,
      });
      const p = ticket.getPayload();
      if (!p || !p.sub || !p.email || p.email_verified !== true) {
        throw new Error('unverified');
      }
      return {
        sub: p.sub,
        email: p.email,
        name: p.name ?? p.email,
        picture: p.picture ?? null,
        emailVerified: true,
      };
    } catch {
      throw new AppError('GOOGLE_TOKEN_INVALID');
    }
  };
}

export function createDevGoogleStub(): GoogleVerifier {
  return async idToken => {
    const m = /^dev:([^:]+):(.+)$/.exec(idToken);
    if (!m) throw new AppError('GOOGLE_TOKEN_INVALID');
    const sub = m[1] as string;
    const email = m[2] as string;
    return { sub, email, name: sub, picture: null, emailVerified: true };
  };
}
