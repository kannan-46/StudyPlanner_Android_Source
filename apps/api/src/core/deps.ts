import type { Db } from 'mongodb';
import { loadConfig, type AppConfig } from '../config/env';
import { createMongo } from './db/mongo';
import { AppError } from './errors/app-error';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
  emailVerified: boolean;
}

export type GoogleVerifier = (idToken: string) => Promise<GoogleIdentity>;

export interface AppDeps {
  config: AppConfig;
  getDb: () => Promise<Db>;
  googleVerifier: GoogleVerifier;
  now: () => Date;
}

// Placeholder until Task 5 implements the real verifier.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createGoogleVerifier(_config: AppConfig): GoogleVerifier {
  return async () => {
    throw new AppError('GOOGLE_TOKEN_INVALID');
  };
}

export function productionDeps(): AppDeps {
  const config = loadConfig(process.env);
  const mongo = createMongo(config);
  return {
    config,
    getDb: () => mongo.getDb(),
    googleVerifier: createGoogleVerifier(config),
    now: () => new Date(),
  };
}
