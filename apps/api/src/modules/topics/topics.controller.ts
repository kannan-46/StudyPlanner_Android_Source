import type { ObjectId } from 'mongodb';
import type {
  CompleteRevisionInput,
  SnoozeRevisionInput,
  TopicCreateInput,
  TopicListQuery,
  TopicUpdateInput,
} from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { asyncHandler } from '../../core/http/async-handler';
import { createTopicsService } from './topics.service';

export function createTopicsController(deps: AppDeps) {
  const service = createTopicsService(deps);
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(
        await service.list(
          res.locals.userId as ObjectId,
          res.locals.input as TopicListQuery,
        ),
      );
    }),
    create: asyncHandler(async (_req, res) => {
      res
        .status(201)
        .json(
          await service.create(
            res.locals.userId as ObjectId,
            res.locals.input as TopicCreateInput,
          ),
        );
    }),
    get: asyncHandler(async (req, res) => {
      res.json(
        await service.get(
          res.locals.userId as ObjectId,
          req.params.id as string,
        ),
      );
    }),
    update: asyncHandler(async (req, res) => {
      res.json(
        await service.update(
          res.locals.userId as ObjectId,
          req.params.id as string,
          res.locals.input as TopicUpdateInput,
        ),
      );
    }),
    completeRevision: asyncHandler(async (req, res) => {
      const { doneOn } = res.locals.input as CompleteRevisionInput;
      res.json(
        await service.completeRevision(
          res.locals.userId as ObjectId,
          req.params.id as string,
          req.params.revisionId as string,
          doneOn,
        ),
      );
    }),
    undoRevision: asyncHandler(async (req, res) => {
      res.json(
        await service.undoRevision(
          res.locals.userId as ObjectId,
          req.params.id as string,
          req.params.revisionId as string,
        ),
      );
    }),
    snoozeRevision: asyncHandler(async (req, res) => {
      const { today, days } = res.locals.input as SnoozeRevisionInput;
      res.json(
        await service.snoozeRevision(
          res.locals.userId as ObjectId,
          req.params.id as string,
          req.params.revisionId as string,
          today,
          days,
        ),
      );
    }),
    remove: asyncHandler(async (req, res) => {
      await service.remove(
        res.locals.userId as ObjectId,
        req.params.id as string,
      );
      res.status(204).end();
    }),
  };
}
