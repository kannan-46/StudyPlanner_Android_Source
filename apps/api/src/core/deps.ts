import type { Db } from 'mongodb';
import { loadConfig, type AppConfig } from '../config/env';
import { createMongo } from './db/mongo';
import {
  createDevGoogleStub,
  createGoogleVerifier,
} from '../modules/auth/google-verifier';

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

export function productionDeps(): AppDeps {
  const config = loadConfig(process.env);
  const mongo = createMongo(config);
  return {
    config,
    getDb: () => mongo.getDb(),
    googleVerifier: config.devGoogleStub
      ? createDevGoogleStub()
      : createGoogleVerifier(config.googleWebClientId),
    now: () => new Date(),
  };
}
