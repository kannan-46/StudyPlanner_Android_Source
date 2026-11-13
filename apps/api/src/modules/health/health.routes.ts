import { Router } from 'express';
import type { AppDeps } from '../../core/deps';

const PING_TIMEOUT_MS = 3000;

export function healthRouter(deps: AppDeps): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const build = { sha: deps.config.buildSha };
    const time = deps.now().toISOString();
    let timer: NodeJS.Timeout | undefined;
    try {
      const ping = (async () => {
        const db = await deps.getDb();
        await db.command({ ping: 1 });
      })();
      ping.catch(() => undefined);
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), PING_TIMEOUT_MS);
      });
      await Promise.race([ping, timeout]);
      res.json({ status: 'ok', db: 'ok', build, time });
    } catch {
      res
        .status(503)
        .json({ status: 'degraded', db: 'unreachable', build, time });
    } finally {
      if (timer) clearTimeout(timer);
    }
  });

  return router;
}
