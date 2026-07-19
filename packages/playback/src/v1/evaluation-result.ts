import type { projectFormatV1 } from '@broadset/model';

export type PlaybackEvaluationResultV1<T> =
  | { readonly status: 'resolved'; readonly value: T }
  | { readonly status: 'invalid'; readonly diagnostics: readonly projectFormatV1.Diagnostic[] };

export function resolvedEvaluationV1<T>(value: T): PlaybackEvaluationResultV1<T> {
  return { status: 'resolved', value };
}

export function invalidEvaluationV1<T>(options: {
  readonly code: string;
  readonly message: string;
  readonly pointer?: string | undefined;
}): PlaybackEvaluationResultV1<T> {
  return {
    status: 'invalid',
    diagnostics: [{
      code: options.code,
      severity: 'error',
      message: options.message,
      ...(options.pointer === undefined ? {} : { pointer: options.pointer }),
    }],
  };
}
