import request from 'supertest';
import { createFallbackApp, describeConfigFailure } from '../fallback-app';

describe('fallback app', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  afterAll(() => spy.mockRestore());

  it('serves public pages and 503s everything else', async () => {
    const app = createFallbackApp('invalid environment: JWT_SECRET');
    expect((await request(app).get('/')).status).toBe(200);
    const p = await request(app).get('/privacy');
    expect(p.status).toBe(200);
    expect(p.text).toContain("Contact the developer through the app's listing");
    for (const path of ['/health', '/v1/me']) {
      const r = await request(app).get(path);
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(r.body.requestId).toEqual(expect.any(String));
    }
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET'));
  });

  it('reports only variable names', () => {
    expect(
      describeConfigFailure(new Error('Invalid environment: JWT_SECRET, X')),
    ).toBe('invalid environment: JWT_SECRET, X');
    expect(describeConfigFailure(new Error('secret=abc'))).toBe(
      'startup failed',
    );
  });
});
