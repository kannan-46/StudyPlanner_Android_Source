import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { renderHomePage } from './modules/pages/home.html';
import {
  publicBasePath,
  renderPrivacyPage,
} from './modules/pages/privacy.html';

/**
 * Minimal app used when configuration is invalid: public pages still work,
 * everything else answers 503. Never needs a loaded AppConfig.
 */
export function createFallbackApp(reason: string): Express {
  console.error(`Service unavailable: ${reason}`);
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  const html =
    (body: string) => (_req: express.Request, res: express.Response) => {
      res.type('text/html; charset=utf-8').send(body);
    };
  const contact = process.env.CONTACT_EMAIL || null;
  app.get('/', html(renderHomePage(publicBasePath(process.env))));
  app.get('/privacy', html(renderPrivacyPage(contact)));
  app.use((_req, res) => {
    const id = randomUUID();
    res.setHeader('X-Request-Id', id);
    res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The server is not available right now. Try again later.',
      },
      requestId: id,
    });
  });
  return app;
}

/** Names of the failing env vars only, never values. */
export function describeConfigFailure(err: unknown): string {
  const m =
    err instanceof Error
      ? /^Invalid environment: (.*)$/.exec(err.message)
      : null;
  return m ? `invalid environment: ${m[1]}` : 'startup failed';
}
