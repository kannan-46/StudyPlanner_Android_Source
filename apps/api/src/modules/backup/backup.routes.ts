import { Router } from 'express';
import type { ObjectId } from 'mongodb';
import {
  BACKUP_MAX_BODY_BYTES,
  backupImportSchema,
  type BackupImportInput,
} from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { asyncHandler } from '../../core/http/async-handler';
import { requireAuth } from '../../core/middleware/require-auth';
import { validate } from '../../core/middleware/validate';
import { createBackupService } from './backup.service';

/**
 * Backups get an 8 MiB body limit (mounted in app.ts before the 1 MB
 * parser). It counts decoded bytes: a gzip body is inflated first, which is
 * how an upload larger than Vercel's 4.5 MB request cap can still arrive.
 */
export const BACKUP_BODY_LIMIT = BACKUP_MAX_BODY_BYTES;

export function backupRouter(deps: AppDeps): Router {
  const router = Router();
  const service = createBackupService(deps);
  router.use(requireAuth(deps));
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json(await service.export(res.locals.userId as ObjectId));
    }),
  );
  router.post(
    '/import',
    validate(backupImportSchema, 'body'),
    asyncHandler(async (_req, res) => {
      const input = res.locals.input as BackupImportInput;
      res.json(
        await service.import(
          res.locals.userId as ObjectId,
          input.mode,
          input.data,
        ),
      );
    }),
  );
  return router;
}
