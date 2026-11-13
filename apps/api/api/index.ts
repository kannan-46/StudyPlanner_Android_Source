import '../src/load-env';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { productionDeps } from '../src/core/deps';
import { createFallbackApp, describeConfigFailure } from '../src/fallback-app';

let app: Express;
try {
  app = createApp(productionDeps());
} catch (err) {
  app = createFallbackApp(describeConfigFailure(err));
}

export default app;
