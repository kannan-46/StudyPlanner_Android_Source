import { Router } from 'express';
import helmet from 'helmet';
import type { AppDeps } from '../../core/deps';
import { renderHomePage } from './home.html';
import { renderPrivacyPage } from './privacy.html';

export function pagesRouter(deps: AppDeps): Router {
  const router = Router();
  const csp = helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: { styleSrc: ["'self'", "'unsafe-inline'"] },
  });

  router.get('/', csp, (_req, res) => {
    res.type('text/html; charset=utf-8').send(renderHomePage());
  });
  router.get('/privacy', csp, (_req, res) => {
    res
      .type('text/html; charset=utf-8')
      .send(renderPrivacyPage(deps.config.contactEmail ?? null));
  });
  return router;
}
