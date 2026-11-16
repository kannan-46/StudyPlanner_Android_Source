import { Router } from 'express';
import type { AppVersionView } from '@planner/shared';
import type { AppDeps } from '../../core/deps';

/**
 * Public: the latest Android release, so installed apps can offer an update.
 * The values come from env vars, so a new release needs no code change.
 */
export function appVersionRouter(deps: AppDeps): Router {
  const router = Router();

  router.get('/version', (_req, res) => {
    const v = deps.config.appVersion;
    const body: AppVersionView = {
      latestVersionCode: v.latestVersionCode,
      latestVersionName: v.latestVersionName,
      downloadUrl: v.downloadUrl,
      notes: v.notes,
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
