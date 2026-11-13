import request from 'supertest';
import type { Db } from 'mongodb';
import { createApp } from '../../../app';
import { makeTestDeps, startTestDb } from '../../../test/harness';

describe('health and 404', () => {
  let stop: () => Promise<void>;
  let uri: string;

  beforeAll(async () => {
    const db = await startTestDb();
    stop = db.stop;
    uri = db.uri;
  });
  afterAll(async () => {
    await stop();
  });

  it('returns 200 ok against a live database', async () => {
    const app = createApp(makeTestDeps({}, uri));
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
    expect(res.body.build).toHaveProperty('sha');
    expect(typeof res.body.time).toBe('string');
  });

  it('returns 503 degraded within 4s when the db hangs', async () => {
    const hung = {
      command: () => new Promise(() => undefined),
    } as unknown as Db;
    const app = createApp(makeTestDeps({ getDb: async () => hung }));
    const started = Date.now();
    const res = await request(app).get('/health');
    expect(Date.now() - started).toBeLessThan(4000);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'unreachable' });
  });

  it('returns a NOT_FOUND body with a request id', async () => {
    const app = createApp(makeTestDeps());
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });
});
