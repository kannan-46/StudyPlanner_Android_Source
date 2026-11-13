import '../src/load-env';
import { createApp } from '../src/app';
import { productionDeps } from '../src/core/deps';

export default createApp(productionDeps());
