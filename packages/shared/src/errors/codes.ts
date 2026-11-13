export const ERROR_CODES = {
  UNAUTHENTICATED: { status: 401, message: 'Please sign in again.' },
  TOKEN_EXPIRED: { status: 401, message: 'Your session expired.' },
  GOOGLE_TOKEN_INVALID: {
    status: 401,
    message: 'Google sign-in could not be verified.',
  },
  VALIDATION_FAILED: { status: 400, message: 'Some fields are invalid.' },
  NOT_FOUND: { status: 404, message: 'Not found.' },
  DUPLICATE_NAME: { status: 409, message: 'That name already exists.' },
  SUBJECT_IN_USE: { status: 409, message: 'This subject still has topics.' },
  REVISION_OUT_OF_ORDER: {
    status: 409,
    message: 'Revisions must be done in order.',
  },
  VERSION_CONFLICT: {
    status: 409,
    message: 'This item changed on another device. Try again.',
  },
  LIMIT_EXCEEDED: { status: 422, message: 'You have reached the limit.' },
  BACKUP_INVALID: { status: 400, message: 'This backup file is not valid.' },
  RATE_LIMITED: {
    status: 429,
    message: 'Too many requests. Try again shortly.',
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: 'The server is waking up. Try again.',
  },
  INTERNAL: { status: 500, message: 'Something went wrong.' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
  requestId: string;
}
