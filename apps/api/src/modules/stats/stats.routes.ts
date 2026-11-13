import { Router } from 'express';
import { statsQuerySchema, type StatsQuery } from '@planner/shared';
import type { ObjectId } from 'mongodb';
import type { AppDeps } from '../../core/deps';
import { asyncHandler } from '../../core/http/async-handler';
import { requireAuth } from '../../core/middleware/require-auth';
import { validate } from '../../core/middleware/validate';
import { createStatsService } from './stats.service';

export function statsRouter(deps: AppDeps): Router {
  const router = Router();
  const service = createStatsService(deps);
  router.use(requireAuth(deps));
  router.get(
    '/',
    validate(statsQuerySchema, 'query'),
    asyncHandler(async (_req, res) => {
      const { today } = res.locals.input as StatsQuery;
      res.json(await service.get(res.locals.userId as ObjectId, today));
    }),
  );
  return router;
}
