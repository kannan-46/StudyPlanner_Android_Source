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

  router.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, _res, next) => next(new AppError('RATE_LIMITED')),
    }),
  );
  router.post(
    '/google',
    validate(googleSignInSchema, 'body'),
    controller.google,
  );
  router.post('/refresh', validate(refreshSchema, 'body'), controller.refresh);
  router.post('/logout', validate(logoutSchema, 'body'), controller.logout);
  return router;
}
