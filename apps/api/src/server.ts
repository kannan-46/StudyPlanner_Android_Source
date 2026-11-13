import './load-env';
import { createApp } from './app';
import { productionDeps } from './core/deps';

const deps = productionDeps();
createApp(deps).listen(deps.config.port, () => {
  console.log(`API listening on :${deps.config.port}`);
});
