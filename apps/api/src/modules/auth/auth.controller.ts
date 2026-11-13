import type {
  GoogleSignInInput,
  LogoutInput,
  RefreshInput,
} from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { asyncHandler } from '../../core/http/async-handler';
import { createAuthService } from './auth.service';

export function createAuthController(deps: AppDeps) {
  const service = createAuthService(deps);
  return {
    google: asyncHandler(async (_req, res) => {
      const input = res.locals.input as GoogleSignInInput;
      res.json(await service.googleSignIn(input.idToken, input.deviceLabel));
    }),
    refresh: asyncHandler(async (_req, res) => {
      const input = res.locals.input as RefreshInput;
      res.json(await service.refresh(input.refreshToken));
    }),
    logout: asyncHandler(async (_req, res) => {
      const input = res.locals.input as LogoutInput;
      await service.logout(input.refreshToken);
      res.status(204).end();
    }),
  };
}
