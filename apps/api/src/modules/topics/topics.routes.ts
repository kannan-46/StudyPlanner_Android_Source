import { Router } from 'express';
import {
  topicCreateSchema,
  topicListQuerySchema,
  topicUpdateSchema,
} from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { requireAuth } from '../../core/middleware/require-auth';
import { validate } from '../../core/middleware/validate';
import { createTopicsController } from './topics.controller';

export function topicsRouter(deps: AppDeps): Router {
  const router = Router();
  const c = createTopicsController(deps);
  router.use(requireAuth(deps));
  router.get('/', validate(topicListQuerySchema, 'query'), c.list);
  router.post('/', validate(topicCreateSchema, 'body'), c.create);
  router.get('/:id', c.get);
  router.patch('/:id', validate(topicUpdateSchema, 'body'), c.update);
  router.delete('/:id', c.remove);
  return router;
}
