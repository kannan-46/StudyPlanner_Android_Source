import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  googleSignInSchema,
  logoutSchema,
  refreshSchema,
} from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { AppError } from '../../core/errors/app-error';
import { validate } from '../../core/middleware/validate';
import { createAuthController } from './auth.controller';

export function authRouter(deps: AppDeps): Router {
  const router = Router();
  const controller = createAuthController(deps);

  // Sign-in is the expensive, abusable call. Refresh/logout are routine and
  // may come from many users behind one NAT, so they get a roomier budget.
  const limiter = (limit: number) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, _res, next) => next(new AppError('RATE_LIMITED')),
    });
  const signInLimiter = limiter(20);
  const sessionLimiter = limiter(300);

  router.post(
    '/google',
    signInLimiter,
    validate(googleSignInSchema, 'body'),
    controller.google,
  );
  router.post(
    '/refresh',
    sessionLimiter,
    validate(refreshSchema, 'body'),
    controller.refresh,
  );
  router.post(
    '/logout',
    sessionLimiter,
    validate(logoutSchema, 'body'),
    controller.logout,
  );
  return router;
}
