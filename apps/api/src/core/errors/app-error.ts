import { ERROR_CODES, type ErrorCode } from '@planner/shared';

export class AppError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(
    public readonly code: ErrorCode,
    opts?: { message?: string; details?: unknown },
  ) {
    super(opts?.message ?? ERROR_CODES[code].message);
    this.name = 'AppError';
    this.status = ERROR_CODES[code].status;
    this.details = opts?.details;
  }
}
