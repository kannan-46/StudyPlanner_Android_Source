import { Router } from 'express';
import {
  completeRevisionSchema,
  snoozeRevisionSchema,
  unsnoozeRevisionSchema,
} from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { validate } from '../../core/middleware/validate';
import { createTopicsController } from './topics.controller';

/** Mounted at /v1/topics/:id/revisions; auth is applied by the parent router. */
export function revisionsRouter(deps: AppDeps): Router {
  const router = Router({ mergeParams: true });
  const c = createTopicsController(deps);
  router.post(
    '/:revisionId/complete',
    validate(completeRevisionSchema, 'body'),
    c.completeRevision,
  );
  router.post('/:revisionId/undo', c.undoRevision);
  router.post(
    '/:revisionId/snooze',
    validate(snoozeRevisionSchema, 'body'),
    c.snoozeRevision,
  );
  router.post(
    '/:revisionId/unsnooze',
    validate(unsnoozeRevisionSchema, 'body'),
    c.unsnoozeRevision,
  );
  return router;
}
