import * as Keychain from 'react-native-keychain';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const SERVICE = 'studyplanner.tokens';

export const tokenStore = {
  async get(): Promise<Tokens | null> {
    const creds = await Keychain.getGenericPassword({ service: SERVICE });
    if (!creds) return null;
    try {
      const parsed = JSON.parse(creds.password) as Partial<Tokens>;
      if (
        typeof parsed.accessToken === 'string' &&
        typeof parsed.refreshToken === 'string'
      ) {
        return {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
        };
      }
    } catch {
      // fall through to null
    }
    return null;
  },
  async set(t: Tokens): Promise<void> {
    await Keychain.setGenericPassword('tokens', JSON.stringify(t), {
      service: SERVICE,
    });
  },
  async clear(): Promise<void> {
    await Keychain.resetGenericPassword({ service: SERVICE });
  },
};
