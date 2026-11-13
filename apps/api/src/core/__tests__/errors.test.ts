import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../../app';
import { AppError } from '../errors/app-error';
import { asyncHandler } from '../http/async-handler';
import { validate } from '../middleware/validate';
import { makeTestDeps } from '../../test/harness';

function app(getDb?: () => Promise<never>) {
  return createApp(makeTestDeps(getDb ? { getDb } : {}), a => {
    a.get('/t/dup', () => {
      throw new AppError('DUPLICATE_NAME');
    });
    a.get('/t/zod', () => {
      z.object({ a: z.string() }).parse({});
    });
    a.get('/t/boom', () => {
      throw new Error('db password=x');
    });
    a.post('/t/json', (_req, res) => {
      res.json({ ok: true });
    });
    a.get(
      '/t/validate',
      validate(z.object({ n: z.coerce.number() }), 'query'),
      (_req, res) => {
        res.json(res.locals.input);
      },
    );
    a.get(
      '/t/async',
      asyncHandler(async () => {
        throw new AppError('LIMIT_EXCEEDED');
      }),
    );
    a.get(
      '/t/db',
      asyncHandler(async (_req, res) => {
        await makeTestDeps({ getDb }).getDb();
        res.json({});
      }),
    );
  });
}

describe('error handling', () => {
  it('maps AppError to its status', async () => {
    const res = await request(app()).get('/t/dup');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('maps ZodError to 400 with issue details', async () => {
    const res = await request(app()).get('/t/zod');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0]).toMatchObject({ path: ['a'] });
  });

  it('hides unknown error details', async () => {
    const res = await request(app()).get('/t/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app())
      .post('/t/json')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 413 for oversized bodies', async () => {
    const res = await request(app())
      .post('/t/json')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ x: 'a'.repeat(1_100_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('forwards async rejections and validates input', async () => {
    expect((await request(app()).get('/t/async')).status).toBe(422);
    const ok = await request(app()).get('/t/validate?n=5');
    expect(ok.body).toEqual({ n: 5 });
    expect((await request(app()).get('/t/validate?n=x')).status).toBe(400);
  });

  it('returns 503 when the database is unavailable', async () => {
    const res = await request(
      app(async () => {
        throw new AppError('SERVICE_UNAVAILABLE');
      }),
    ).get('/t/db');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
