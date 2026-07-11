import { z } from 'zod';

import type { Diagnostic } from './diagnostics';
import type { BroadsetProjectV1 } from './project';
import { broadsetProjectV1Schema } from './project';
import { validateBroadsetProjectV1Semantics } from './semantic-validation';

export type ProjectParseResult =
  | {
      readonly status: 'loaded';
      readonly project: BroadsetProjectV1;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly status: 'quarantined'; readonly diagnostics: readonly Diagnostic[] };

export type ProjectLoadResult =
  | Extract<ProjectParseResult, { readonly status: 'loaded' }>
  | {
      readonly status: 'quarantined';
      readonly diagnostics: readonly Diagnostic[];
      readonly originalText: string;
      readonly lastValidProject?: BroadsetProjectV1 | undefined;
    };

export interface ProjectLoadOptions {
  readonly lastValidProject?: BroadsetProjectV1 | undefined;
}

const PROJECT_SCHEMA = 'https://schema.broadset.dev/v1/project.schema.json';
const PROJECT_FORMAT = 'broadset-project';
const PROJECT_SCHEMA_VERSION = 1;
const projectIdentitySchema = z.object({
  $schema: z.literal(PROJECT_SCHEMA),
  format: z.literal(PROJECT_FORMAT),
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
});

function createDiagnostic(code: string, message: string, pointer?: string): Diagnostic {
  return {
    code,
    severity: 'error',
    message,
    ...(pointer === undefined ? {} : { pointer }),
  };
}

function escapePointerSegment(segment: PropertyKey): string {
  return String(segment).replaceAll('~', '~0').replaceAll('/', '~1');
}

function issuePointer(issue: z.core.$ZodIssue): string {
  return `/${issue.path.map(escapePointerSegment).join('/')}`;
}

function hasSupportedIdentity(input: unknown): boolean {
  return projectIdentitySchema.safeParse(input).success;
}

export function parseProjectV1Unknown(input: unknown): ProjectParseResult {
  if (!hasSupportedIdentity(input)) {
    return {
      status: 'quarantined',
      diagnostics: [createDiagnostic('unsupported-version', 'Input is not a Broadset project format v1 document')],
    };
  }

  const structural = broadsetProjectV1Schema.safeParse(input);

  if (!structural.success) {
    return {
      status: 'quarantined',
      diagnostics: structural.error.issues.map((issue) =>
        createDiagnostic('structural-invalid', issue.message, issuePointer(issue)),
      ),
    };
  }

  const semanticDiagnostics = validateBroadsetProjectV1Semantics(structural.data);

  if (semanticDiagnostics.some(({ severity }) => severity === 'error')) {
    return {
      status: 'quarantined',
      diagnostics: [
        createDiagnostic('semantic-invalid', 'Project failed whole-project semantic validation'),
        ...semanticDiagnostics,
      ],
    };
  }

  return { status: 'loaded', project: structural.data, diagnostics: semanticDiagnostics };
}

export function loadProjectV1Json(originalText: string, options: ProjectLoadOptions = {}): Promise<ProjectLoadResult> {
  let input: unknown;

  try {
    input = JSON.parse(originalText) as unknown;
  } catch (error) {
    return Promise.resolve({
      status: 'quarantined',
      originalText,
      diagnostics: [
        createDiagnostic('invalid-json', error instanceof Error ? error.message : 'Input is not valid JSON'),
      ],
      ...(options.lastValidProject === undefined ? {} : { lastValidProject: options.lastValidProject }),
    });
  }

  const result = parseProjectV1Unknown(input);

  if (result.status === 'loaded') return Promise.resolve(result);

  return Promise.resolve({
    ...result,
    originalText,
    ...(options.lastValidProject === undefined ? {} : { lastValidProject: options.lastValidProject }),
  });
}
