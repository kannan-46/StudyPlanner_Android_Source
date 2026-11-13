import { SignJWT, jwtVerify, errors } from 'jose';
import { AppError } from '../../core/errors/app-error';

export const ACCESS_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const ISSUER = 'studyplanner-api';
const AUDIENCE = 'studyplanner-mobile';

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signAccessToken(
  userId: string,
  now: Date,
  secret: string,
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TOKEN_TTL_SECONDS)
    .sign(key(secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<{ userId: string }> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      currentDate: now,
    });
    if (typeof payload.sub !== 'string' || payload.sub === '') {
      throw new AppError('UNAUTHENTICATED');
    }
    return { userId: payload.sub };
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e instanceof errors.JWTExpired) throw new AppError('TOKEN_EXPIRED');
    throw new AppError('UNAUTHENTICATED');
  }
}
