import type { AppError, AppErrorCode, Result } from '../../shared/contracts';

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = (code: AppErrorCode, message: string, details?: unknown): Result<never> => ({
  ok: false,
  error: { code, message, details }
});

export const toAppError = (error: unknown, fallbackCode: AppErrorCode = 'INTERNAL_ERROR'): AppError => {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    return error as AppError;
  }

  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message
    };
  }

  return {
    code: fallbackCode,
    message: 'Unknown error',
    details: error
  };
};
