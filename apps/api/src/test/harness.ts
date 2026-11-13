import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { AuthResponse } from '@planner/shared';
import { createMongo } from '../core/db/mongo';
import type { AppDeps, GoogleVerifier } from '../core/deps';

const openMongos: { close(): Promise<void> }[] = [];

export async function startTestDb(): Promise<{
  uri: string;
  stop(): Promise<void>;
}> {
  const server = await MongoMemoryServer.create();
  return {
    uri: server.getUri(),
    stop: async () => {
      await Promise.all(openMongos.splice(0).map(m => m.close()));
      await server.stop();
    },
  };
}

const fakeVerifier: GoogleVerifier = async idToken => {
  const m = /^google:([^:]+):(.+)$/.exec(idToken);
  if (!m) throw new Error('invalid test token');
  const sub = m[1] as string;
  const email = m[2] as string;
  return { sub, email, name: sub, picture: null, emailVerified: true };
};

export function makeTestDeps(
  overrides: Partial<AppDeps> = {},
  uri = 'mongodb://127.0.0.1:1',
): AppDeps {
  const config = {
    mongodbUri: uri,
    mongodbDb: `test_${randomUUID().replace(/-/g, '')}`,
    jwtSecret: 'test-secret-test-secret-test-secret-123',
    googleWebClientId: 'test-client-id',
    port: 0,
    trustProxyHops: 0,
    devGoogleStub: false,
    buildSha: null,
  };
  const mongo = createMongo(config);
  openMongos.push(mongo);
  return {
    config,
    getDb: () => mongo.getDb(),
    googleVerifier: fakeVerifier,
    now: () => new Date('2026-11-13T10:00:00Z'),
    ...overrides,
  };
}

export async function signIn(app: Express, sub = 'u1'): Promise<AuthResponse> {
  const res = await request(app)
    .post('/v1/auth/google')
    .send({ idToken: `google:${sub}:${sub}@test.dev` });
  if (res.status !== 200) {
    throw new Error(`signIn failed with ${res.status}`);
  }
  return res.body as AuthResponse;
}
