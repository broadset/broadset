import type { projectFormatV1 } from '@broadset/model';

export function bspError(code: string, message: string, pointer?: string): projectFormatV1.Diagnostic {
  return {
    code,
    severity: 'error',
    message,
    ...(pointer === undefined ? {} : { pointer }),
  };
}

export function unknownFailureMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}
