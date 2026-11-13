import { Router } from 'express';
import { agendaQuerySchema, type AgendaQuery } from '@planner/shared';
import type { ObjectId } from 'mongodb';
import type { AppDeps } from '../../core/deps';
import { asyncHandler } from '../../core/http/async-handler';
import { requireAuth } from '../../core/middleware/require-auth';
import { validate } from '../../core/middleware/validate';
import { createAgendaService } from './agenda.service';

export function agendaRouter(deps: AppDeps): Router {
  const router = Router();
  const service = createAgendaService(deps);
  router.use(requireAuth(deps));
  router.get(
    '/',
    validate(agendaQuerySchema, 'query'),
    asyncHandler(async (_req, res) => {
      const { today, days } = res.locals.input as AgendaQuery;
      res.json({
        items: await service.list(res.locals.userId as ObjectId, today, days),
      });
    }),
  );
  return router;
}
