import { loadConfig } from '../env';

const base = {
  MONGODB_URI: 'mongodb://localhost:27017',
  JWT_SECRET: 'x'.repeat(32),
  GOOGLE_WEB_CLIENT_ID: 'client-id',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig(base);
    expect(c.mongodbDb).toBe('studyplanner');
    expect(c.port).toBe(3000);
    expect(c.trustProxyHops).toBe(0);
    expect(c.devGoogleStub).toBe(false);
    expect(c.buildSha).toBeNull();
  });

  it('rejects a short JWT_SECRET without echoing its value', () => {
    let message = '';
    try {
      loadConfig({ ...base, JWT_SECRET: 'short-secret-value' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('JWT_SECRET');
    expect(message).not.toContain('short-secret-value');
  });

  it('refuses DEV_GOOGLE_STUB on Vercel', () => {
    expect(() =>
      loadConfig({ ...base, DEV_GOOGLE_STUB: 'true', VERCEL: '1' }),
    ).toThrow(/DEV_GOOGLE_STUB/);
  });

  it('uses one proxy hop on Vercel', () => {
    expect(
      loadConfig({ ...base, VERCEL: '1', VERCEL_GIT_COMMIT_SHA: 'abc' }),
    ).toMatchObject({ trustProxyHops: 1, buildSha: 'abc' });
  });
});
