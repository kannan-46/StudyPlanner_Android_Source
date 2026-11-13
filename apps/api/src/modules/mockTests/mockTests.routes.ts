import { Router } from 'express';
import {
  mockTestInputSchema,
  mockTestUpdateSchema,
  type MockTestInput,
  type MockTestUpdate,
} from '@planner/shared';
import type { ObjectId } from 'mongodb';
import type { AppDeps } from '../../core/deps';
import { asyncHandler } from '../../core/http/async-handler';
import { requireAuth } from '../../core/middleware/require-auth';
import { validate } from '../../core/middleware/validate';
import { createMockTestsService } from './mockTests.service';

export function mockTestsRouter(deps: AppDeps): Router {
  const router = Router();
  const service = createMockTestsService(deps);
  router.use(requireAuth(deps));
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json(await service.list(res.locals.userId as ObjectId));
    }),
  );
  router.post(
    '/',
    validate(mockTestInputSchema, 'body'),
    asyncHandler(async (_req, res) => {
      const input = res.locals.input as MockTestInput;
      res
        .status(201)
        .json(await service.create(res.locals.userId as ObjectId, input));
    }),
  );
  router.patch(
    '/:id',
    validate(mockTestUpdateSchema, 'body'),
    asyncHandler(async (req, res) => {
      const input = res.locals.input as MockTestUpdate;
      res.json(
        await service.update(
          res.locals.userId as ObjectId,
          req.params.id as string,
          input,
        ),
      );
    }),
  );
  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      await service.remove(
        res.locals.userId as ObjectId,
        req.params.id as string,
      );
      res.status(204).end();
    }),
  );
  return router;
}
