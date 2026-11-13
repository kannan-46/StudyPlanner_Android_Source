import type { AuthResponse } from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { AppError } from '../../core/errors/app-error';
import { createUsersRepository, toUserView } from '../users/users.repository';
import { createSessionsRepository } from './sessions.repository';
import { signAccessToken } from './tokens';

export function createAuthService(deps: AppDeps) {
  return {
    async googleSignIn(
      idToken: string,
      deviceLabel: string | undefined,
    ): Promise<AuthResponse> {
      let identity;
      try {
        identity = await deps.googleVerifier(idToken);
      } catch {
        throw new AppError('GOOGLE_TOKEN_INVALID');
      }
      const db = await deps.getDb();
      const now = deps.now();
      const user = await createUsersRepository(db).upsertFromGoogle(
        identity,
        now,
      );
      const { refreshToken } = await createSessionsRepository(db).create(
        user._id,
        deviceLabel ?? null,
        now,
      );
      const accessToken = await signAccessToken(
        user._id.toHexString(),
        now,
        deps.config.jwtSecret,
      );
      return { accessToken, refreshToken, user: toUserView(user) };
    },

    async refresh(
      token: string,
    ): Promise<{ accessToken: string; refreshToken: string }> {
      const db = await deps.getDb();
      const now = deps.now();
      const { userId, refreshToken } = await createSessionsRepository(
        db,
      ).rotate(token, now);
      const accessToken = await signAccessToken(
        userId.toHexString(),
        now,
        deps.config.jwtSecret,
      );
      return { accessToken, refreshToken };
    },

    async logout(token: string): Promise<void> {
      const db = await deps.getDb();
      await createSessionsRepository(db).revoke(token, deps.now());
    },
  };
}
