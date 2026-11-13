import type { AuthResponse } from '@planner/shared';
import type { Http } from '../../shared/api/http';

export function makeAuthApi(http: Http) {
  return {
    googleSignIn: (idToken: string, deviceLabel?: string) =>
      http.post<AuthResponse>('/v1/auth/google', { idToken, deviceLabel }),
    logout: (refreshToken: string) =>
      http.post<void>('/v1/auth/logout', { refreshToken }),
  };
}
