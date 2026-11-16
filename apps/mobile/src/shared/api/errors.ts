import { ERROR_CODES, type ErrorCode } from '@planner/shared';

const NETWORK_MESSAGE = "Can't reach the server — try again";
const GENERIC_MESSAGE = 'Something went wrong — try again';

export class ApiError extends Error {
  code: ErrorCode | 'NETWORK';
  status: number;
  details?: unknown;
  requestId?: string;
  /**
   * The session on the phone had already ended (signed out, or signed out by
   * the app) when this request finished, so its reply was dropped. The
   * sign-in screen is showing: callers should stay quiet, not show an error.
   */
  sessionEnded: boolean;

  constructor(
    code: ErrorCode | 'NETWORK',
    status: number,
    message?: string,
    extra: {
      details?: unknown;
      requestId?: string;
      sessionEnded?: boolean;
    } = {},
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
    this.sessionEnded = extra.sessionEnded ?? false;
  }
}

/**
 * True for a request whose reply was dropped because the user signed out (or
 * was signed out) while it was on its way. Nothing should be shown for it:
 * no snackbar, no error text, no rollback into the next session's data.
 */
export function isSessionEndedError(e: unknown): boolean {
  return e instanceof ApiError && e.sessionEnded;
}

/**
 * What the failed action was about, so a message can name it ("This topic
 * has been deleted", "You can have up to 5,000 topics").
 */
export type MessageContext =
  | 'topic'
  | 'exam'
  | 'subject'
  | 'mockTest'
  | 'backup';

const DELETED: Record<MessageContext, string> = {
  topic: 'This topic has been deleted',
  exam: 'This exam has been deleted',
  subject: 'This subject has been deleted',
  mockTest: 'This mock test has been deleted',
  backup: 'This has been deleted',
};

function limitMessage(context?: MessageContext): string {
  switch (context) {
    case 'topic':
    case 'backup':
      return 'You can have up to 5,000 topics — delete some to add more';
    case 'mockTest':
      return 'You can have up to 2,000 mock tests — delete some to add more';
    default:
      return "You've reached the maximum — delete some to add more";
  }
}

/**
 * The text shown to the user for a failed request. Every message follows one
 * style: plain words, no trailing full stop, an em dash before a second
 * clause. The API's own messages are never shown.
 */
export function userMessage(e: unknown, context?: MessageContext): string {
  if (!(e instanceof ApiError)) return GENERIC_MESSAGE;
  switch (e.code) {
    case 'NETWORK':
    case 'SERVICE_UNAVAILABLE':
      return NETWORK_MESSAGE;
    case 'VERSION_CONFLICT':
      return 'This changed on another device — refreshed';
    case 'REVISION_OUT_OF_ORDER':
      return 'Do the earlier revision first';
    case 'NOT_FOUND':
      return context ? DELETED[context] : 'This has been deleted';
    case 'LIMIT_EXCEEDED':
      return limitMessage(context);
    case 'VALIDATION_FAILED':
      return "Something here isn't right — check it and try again";
    case 'DUPLICATE_NAME':
      return 'You already have one with that name';
    case 'SUBJECT_IN_USE':
      return 'Move or delete its topics first';
    case 'BACKUP_INVALID':
      return 'This file is not a Study Planner backup';
    case 'RATE_LIMITED':
      return 'Too many tries — wait a minute and try again';
    case 'UNAUTHENTICATED':
    case 'TOKEN_EXPIRED':
      return 'Your session ended — sign in again';
    case 'GOOGLE_TOKEN_INVALID':
      return "Couldn't verify your Google sign-in — try again";
    default:
      // A gateway timeout or outage arrives without our error body.
      if (e.status === 502 || e.status === 503 || e.status === 504) {
        return NETWORK_MESSAGE;
      }
      return GENERIC_MESSAGE;
  }
}

/**
 * Whether trying the same request again can help: connection problems and
 * server hiccups can, a deleted item or a full list cannot.
 */
export function canRetry(e: unknown): boolean {
  if (!(e instanceof ApiError)) return true;
  if (e.code === 'NETWORK' || e.code === 'SERVICE_UNAVAILABLE') return true;
  if (e.code === 'RATE_LIMITED' || e.code === 'INTERNAL') return true;
  return e.status >= 500;
}
