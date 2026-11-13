import { Router } from 'express';
import { updateMeSchema, type UpdateMeInput } from '@planner/shared';
import type { ObjectId } from 'mongodb';
import type { AppDeps } from '../../core/deps';
import { asyncHandler } from '../../core/http/async-handler';
import { requireAuth } from '../../core/middleware/require-auth';
import { validate } from '../../core/middleware/validate';
import { createMeService } from './me.service';

export function meRouter(deps: AppDeps): Router {
  const router = Router();
  const service = createMeService(deps);
  router.use(requireAuth(deps));
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json(await service.get(res.locals.userId as ObjectId));
    }),
  );
  router.patch(
    '/',
    validate(updateMeSchema, 'body'),
    asyncHandler(async (_req, res) => {
      const input = res.locals.input as UpdateMeInput;
      res.json(await service.update(res.locals.userId as ObjectId, input));
    }),
  );
  router.delete(
    '/',
    asyncHandler(async (_req, res) => {
      await service.remove(res.locals.userId as ObjectId);
      res.status(204).end();
    }),
  );
  return router;
}
