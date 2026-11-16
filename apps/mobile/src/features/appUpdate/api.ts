import type { AppVersionView } from '@planner/shared';
import type { Http } from '../../shared/api/http';

/**
 * Checks the server's answer. Anything unexpected (an older API, a proxy page,
 * a non-http link) counts as "no update information", never as an error.
 */
export function parseAppVersion(body: unknown): AppVersionView | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const code = b.latestVersionCode;
  const name = b.latestVersionName;
  const url = b.downloadUrl;
  const notes = b.notes;
  if (typeof code !== 'number' || !Number.isInteger(code) || code < 1) {
    return null;
  }
  if (typeof name !== 'string' || name.trim() === '') return null;
  if (typeof url !== 'string' || !/^https?:\/\/\S+$/i.test(url)) return null;
  return {
    latestVersionCode: code,
    latestVersionName: name.trim(),
    downloadUrl: url,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
  };
}

export function makeAppVersionApi(http: Http) {
  return {
    /** Public endpoint: works signed in or out. */
    latest: async () =>
      parseAppVersion(await http.get<unknown>('/v1/app/version')),
  };
}
