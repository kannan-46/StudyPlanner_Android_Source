import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppDeps } from './core/deps';
import { requestId } from './core/middleware/request-id';
import { errorHandler, notFoundHandler } from './core/middleware/error-handler';
import { authRouter } from './modules/auth/auth.routes';
import { meRouter } from './modules/me/me.routes';
import { examsRouter } from './modules/exams/exams.routes';
import { subjectsRouter } from './modules/subjects/subjects.routes';
import { topicsRouter } from './modules/topics/topics.routes';
import { healthRouter } from './modules/health/health.routes';
import { agendaRouter } from './modules/agenda/agenda.routes';
import { statsRouter } from './modules/stats/stats.routes';
import { mockTestsRouter } from './modules/mockTests/mockTests.routes';

export function createApp(
  deps: AppDeps,
  extraRoutes?: (app: Express) => void,
): Express {
  const app = express();
  app.set('trust proxy', deps.config.trustProxyHops);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(requestId);
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter(deps));
  app.use('/v1/auth', authRouter(deps));
  app.use('/v1/me', meRouter(deps));
  app.use('/v1/exams', examsRouter(deps));
  app.use('/v1/subjects', subjectsRouter(deps));
  app.use('/v1/topics', topicsRouter(deps));
  app.use('/v1/agenda', agendaRouter(deps));
  app.use('/v1/stats', statsRouter(deps));
  app.use('/v1/mock-tests', mockTestsRouter(deps));
  extraRoutes?.(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
