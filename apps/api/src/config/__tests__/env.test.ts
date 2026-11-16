import { DEFAULT_APP_VERSION, loadConfig } from '../env';

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
        'https://github.com/kannan-46/StudyPlanner_Android_Source/releases/latest/download/StudyPlanner.apk',
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

  describe('invalid update settings', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warn.mockRestore();
    });

    function expectOneWarning(name: string, value: string): void {
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toContain(name);
      expect(message).not.toContain(value);
    }

    it.each(['4.2.0', '4.5', 'six', '0', '-3'])(
      'falls back for LATEST_VERSION_CODE %p without echoing it',
      value => {
        const c = loadConfig({ ...base, LATEST_VERSION_CODE: value });
        expect(c.appVersion.latestVersionCode).toBe(
          DEFAULT_APP_VERSION.latestVersionCode,
        );
        expectOneWarning('LATEST_VERSION_CODE', value);
      },
    );

    it.each(['ftp://x', 'not a url', 'javascript:alert(1)'])(
      'falls back for APK_DOWNLOAD_URL %p without echoing it',
      value => {
        const c = loadConfig({ ...base, APK_DOWNLOAD_URL: value });
        expect(c.appVersion.downloadUrl).toBe(DEFAULT_APP_VERSION.downloadUrl);
        expectOneWarning('APK_DOWNLOAD_URL', value);
      },
    );

    it('falls back for an overlong LATEST_VERSION_NAME', () => {
      const value = 'v'.repeat(41);
      const c = loadConfig({ ...base, LATEST_VERSION_NAME: value });
      expect(c.appVersion.latestVersionName).toBe(
        DEFAULT_APP_VERSION.latestVersionName,
      );
      expectOneWarning('LATEST_VERSION_NAME', value);
    });

    it('falls back for overlong UPDATE_NOTES', () => {
      const value = 'n'.repeat(501);
      const c = loadConfig({ ...base, UPDATE_NOTES: value });
      expect(c.appVersion.notes).toBeNull();
      expectOneWarning('UPDATE_NOTES', value);
    });

    it('keeps the valid settings when one is invalid', () => {
      const c = loadConfig({
        ...base,
        LATEST_VERSION_CODE: '4.2.0',
        LATEST_VERSION_NAME: '4.2.0',
        APK_DOWNLOAD_URL: 'https://example.com/app.apk',
        UPDATE_NOTES: 'Bug fixes',
      });
      expect(c.appVersion).toEqual({
        latestVersionCode: DEFAULT_APP_VERSION.latestVersionCode,
        latestVersionName: '4.2.0',
        downloadUrl: 'https://example.com/app.apk',
        notes: 'Bug fixes',
      });
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('does not warn for valid or blank settings', () => {
      loadConfig({
        ...base,
        LATEST_VERSION_CODE: '6',
        LATEST_VERSION_NAME: '',
        APK_DOWNLOAD_URL: '',
        UPDATE_NOTES: '',
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it('still fails fast on a missing required var', () => {
      expect(() =>
        loadConfig({
          MONGODB_URI: base.MONGODB_URI,
          GOOGLE_WEB_CLIENT_ID: base.GOOGLE_WEB_CLIENT_ID,
          LATEST_VERSION_CODE: '4.2.0',
        }),
      ).toThrow(/^Invalid environment: JWT_SECRET$/);
      expect(() =>
        loadConfig({ ...base, MONGODB_URI: '', LATEST_VERSION_CODE: '6' }),
      ).toThrow(/^Invalid environment: MONGODB_URI$/);
      // The required vars are checked before any update setting is parsed.
      expect(warn).not.toHaveBeenCalled();
    });

    it.each(['LATEST_VERSION_NAME', 'LATEST_VERSION_CODE'] as const)(
      'falls back for a %s made only of spaces',
      name => {
        const c = loadConfig({ ...base, [name]: '   ' });
        expect(c.appVersion).toEqual(DEFAULT_APP_VERSION);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
          `Ignoring invalid ${name}; using the default`,
        );
      },
    );

    it('quietly treats UPDATE_NOTES made only of spaces as no notes', () => {
      const c = loadConfig({ ...base, UPDATE_NOTES: '   ' });
      expect(c.appVersion.notes).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
