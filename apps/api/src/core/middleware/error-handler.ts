import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import {
  badJsonProblem,
  ERROR_CODES,
  ScheduleError,
  tooLargeProblem,
  type ErrorCode,
} from '@planner/shared';
import { AppError } from '../errors/app-error';

function body(
  res: { locals: Record<string, unknown> },
  code: ErrorCode,
  details?: unknown,
  message?: string,
) {
  return {
    error: {
      code,
      message: message ?? ERROR_CODES[code].message,
      ...(details === undefined ? {} : { details }),
    },
    requestId: String(res.locals.requestId ?? ''),
  };
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(body(res, 'NOT_FOUND'));
};

// Express recognises error handlers by their four-argument signature.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    res.status(err.status).json(body(res, err.code, err.details, err.message));
    return;
  }
  if (err instanceof ZodError) {
    const details = err.issues.map(i => ({ path: i.path, message: i.message }));
    res.status(400).json(body(res, 'VALIDATION_FAILED', details));
    return;
  }
  if (err instanceof ScheduleError) {
    // REVISION_NOT_FOUND has no public code of its own; it is a 404.
    const code: ErrorCode =
      err.code === 'REVISION_NOT_FOUND' ? 'NOT_FOUND' : err.code;
    res.status(ERROR_CODES[code].status).json(body(res, code));
    return;
  }
  const type = (err as { type?: unknown } | null)?.type;
  if (type === 'entity.too.large') {
    const limit = (err as { limit?: unknown }).limit;
    const details = [
      tooLargeProblem(typeof limit === 'number' ? limit : undefined),
    ];
    res
      .status(413)
      .json(
        body(res, 'VALIDATION_FAILED', details, 'Request body is too large.'),
      );
    return;
  }
  if (type === 'entity.parse.failed' || err instanceof SyntaxError) {
    res
      .status(400)
      .json(
        body(
          res,
          'VALIDATION_FAILED',
          [{ ...badJsonProblem(), message: 'Malformed JSON body.' }],
          'Malformed JSON body.',
        ),
      );
    return;
  }
  // Other body-reading failures (a damaged gzip body, an unsupported
  // encoding) are the client's fault, not a server error.
  const httpErr = err as { status?: unknown; expose?: unknown } | null;
  if (
    httpErr?.expose === true &&
    typeof httpErr.status === 'number' &&
    httpErr.status >= 400 &&
    httpErr.status < 500
  ) {
    res
      .status(400)
      .json(
        body(
          res,
          'VALIDATION_FAILED',
          [{ ...badJsonProblem(), message: 'Unreadable request body.' }],
          'Unreadable request body.',
        ),
      );
    return;
  }

  const name = err instanceof Error ? err.name : typeof err;
  console.error(
    `Unhandled error ${name} requestId=${String(res.locals.requestId)}`,
  );
  res.status(500).json(body(res, 'INTERNAL'));
};
