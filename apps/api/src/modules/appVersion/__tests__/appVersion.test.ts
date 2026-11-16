import request from 'supertest';
import { createApp } from '../../../app';
import { loadConfig } from '../../../config/env';
import { makeTestDeps } from '../../../test/harness';

const baseEnv = {
  MONGODB_URI: 'mongodb://localhost:27017',
  JWT_SECRET: 'x'.repeat(32),
  GOOGLE_WEB_CLIENT_ID: 'client-id',
};

describe('GET /v1/app/version', () => {
  it('returns the default release without auth and is never cached', async () => {
    const res = await request(createApp(makeTestDeps())).get('/v1/app/version');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      latestVersionCode: 5,
      latestVersionName: '4.1.0',
      downloadUrl:
        'https://github.com/kannan-46/StudyPlanner_Android_Source/releases/latest/download/StudyPlanner.apk',
      notes: null,
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('serves the values set through the env vars', async () => {
    const config = loadConfig({
      ...baseEnv,
      LATEST_VERSION_CODE: '7',
      LATEST_VERSION_NAME: '4.3.0',
      APK_DOWNLOAD_URL: 'https://example.com/app-4.3.0.apk',
      UPDATE_NOTES: 'Faster sync',
    });
    const deps = makeTestDeps();
    deps.config.appVersion = config.appVersion;
    const res = await request(createApp(deps)).get('/v1/app/version');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      latestVersionCode: 7,
      latestVersionName: '4.3.0',
      downloadUrl: 'https://example.com/app-4.3.0.apk',
      notes: 'Faster sync',
    });
  });

  it('serves the default version code when LATEST_VERSION_CODE is invalid', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const config = loadConfig({
        ...baseEnv,
        LATEST_VERSION_CODE: '4.2.0',
        LATEST_VERSION_NAME: '4.2.0',
      });
      const deps = makeTestDeps();
      deps.config.appVersion = config.appVersion;
      const res = await request(createApp(deps)).get('/v1/app/version');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        latestVersionCode: 5,
        latestVersionName: '4.2.0',
      });
      expect(warn).toHaveBeenCalledWith(
        'Ignoring invalid LATEST_VERSION_CODE; using the default',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('ignores a bearer token and does not need the database', async () => {
    const res = await request(createApp(makeTestDeps()))
      .get('/v1/app/version')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(200);
  });
});
