import { ERROR_CODES, type ErrorCode } from '@planner/shared';

const NETWORK_MESSAGE = "Can't reach the server — try again";

export class ApiError extends Error {
  code: ErrorCode | 'NETWORK';
  status: number;
  details?: unknown;
  requestId?: string;

  constructor(
    code: ErrorCode | 'NETWORK',
    status: number,
    message?: string,
    extra: { details?: unknown; requestId?: string } = {},
  ) {
    super(
      message ??
        (code === 'NETWORK' ? NETWORK_MESSAGE : ERROR_CODES[code].message),
    );
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = extra.details;
    this.requestId = extra.requestId;
  }
}

export function userMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return ERROR_CODES.INTERNAL.message;
  switch (e.code) {
    case 'VERSION_CONFLICT':
      return 'This changed on another device — refreshed';
    case 'REVISION_OUT_OF_ORDER':
      return 'Do the earlier revision first';
    case 'SERVICE_UNAVAILABLE':
    case 'NETWORK':
      return NETWORK_MESSAGE;
    default:
      return ERROR_CODES[e.code]?.message ?? ERROR_CODES.INTERNAL.message;
  }
}
