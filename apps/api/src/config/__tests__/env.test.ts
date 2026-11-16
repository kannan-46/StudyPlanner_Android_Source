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

  it('defaults the latest app release', () => {
    expect(loadConfig(base).appVersion).toEqual({
      latestVersionCode: 5,
      latestVersionName: '4.1.0',
      downloadUrl:
        'https://github.com/kannan-46/StudyPlanner_Android_Source/releases/latest',
      notes: null,
    });
    // A blank line in .env or Vercel counts as unset.
    expect(
      loadConfig({ ...base, LATEST_VERSION_CODE: '', UPDATE_NOTES: '' })
        .appVersion,
    ).toMatchObject({ latestVersionCode: 5, notes: null });
  });

  it('reads the latest app release from env vars', () => {
    expect(
      loadConfig({
        ...base,
        LATEST_VERSION_CODE: '6',
        LATEST_VERSION_NAME: '4.2.0',
        APK_DOWNLOAD_URL: 'https://example.com/app.apk',
        UPDATE_NOTES: '  Bug fixes  ',
      }).appVersion,
    ).toEqual({
      latestVersionCode: 6,
      latestVersionName: '4.2.0',
      downloadUrl: 'https://example.com/app.apk',
      notes: 'Bug fixes',
    });
  });

  it('rejects an invalid version code or download url', () => {
    expect(() => loadConfig({ ...base, LATEST_VERSION_CODE: '4.5' })).toThrow(
      /LATEST_VERSION_CODE/,
    );
    expect(() =>
      loadConfig({ ...base, APK_DOWNLOAD_URL: 'javascript:alert(1)' }),
    ).toThrow(/APK_DOWNLOAD_URL/);
  });
});
