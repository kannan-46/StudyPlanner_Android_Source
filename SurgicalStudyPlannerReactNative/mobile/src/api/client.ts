import {API_BASE_URL} from '../config/api';
import type {
  Account,
  AuthResponse,
  PlannerDocument,
  PlannerDraft,
} from '../types/planner';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiConfig = {registrationEnabled: boolean};

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  if (API_BASE_URL.includes('.invalid')) {
    throw new Error('This APK has no hosted API URL yet. Configure the API URL and rebuild the APK.');
  }

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? {'Content-Type': 'application/json'} : {}),
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Could not reach the API. Check your internet connection and try again.');
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload &&
      typeof payload.message === 'string'
        ? payload.message
        : 'The server could not complete the request.';
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

export function getApiConfig(): Promise<ApiConfig> {
  return request<ApiConfig>('/v1/config');
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({email, password}),
  });
}

export function register(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({email, password}),
  });
}

export function getPlanner(token: string): Promise<PlannerDocument> {
  return request<PlannerDocument>('/v1/planner', {}, token);
}

export function savePlanner(
  token: string,
  planner: PlannerDraft,
  expectedVersion: number,
): Promise<PlannerDocument> {
  return request<PlannerDocument>(
    '/v1/planner',
    {
      method: 'PUT',
      body: JSON.stringify({expectedVersion, ...planner}),
    },
    token,
  );
}

export type {Account};
