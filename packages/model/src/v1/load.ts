import { z } from 'zod';

import type { Diagnostic } from './diagnostics';
import { inspectProjectV1JsonText, inspectProjectV1Unknown, type ProjectV1LimitViolation } from './limits';
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
  return issue.path.length === 0 ? '' : `/${issue.path.map(escapePointerSegment).join('/')}`;
}

function createLimitResult(violation: ProjectV1LimitViolation): ProjectParseResult {
  return { status: 'quarantined', diagnostics: [createDiagnostic(violation.code, violation.message)] };
}

function hasSupportedIdentity(input: unknown): boolean {
  return projectIdentitySchema.safeParse(input).success;
}

export function parseProjectV1Unknown(input: unknown): ProjectParseResult {
  try {
    const violation = inspectProjectV1Unknown(input);

    if (violation !== undefined) return createLimitResult(violation);
  } catch (error: unknown) {
    return {
      status: 'quarantined',
      diagnostics: [
        createDiagnostic('structural-invalid', error instanceof Error ? error.message : 'Unreadable input'),
      ],
    };
  }

  if (!hasSupportedIdentity(input)) {
    return {
      status: 'quarantined',
      diagnostics: [createDiagnostic('unsupported-version', 'Input is not a Broadset project format v1 document')],
    };
  }

  let structural: ReturnType<typeof broadsetProjectV1Schema.safeParse>;

  try {
    structural = broadsetProjectV1Schema.safeParse(input);
  } catch (error: unknown) {
    return {
      status: 'quarantined',
      diagnostics: [
        createDiagnostic('structural-invalid', error instanceof Error ? error.message : 'Structural validation failed'),
      ],
    };
  }

  if (!structural.success) {
    return {
      status: 'quarantined',
      diagnostics: structural.error.issues.map((issue) =>
        createDiagnostic('structural-invalid', issue.message, issuePointer(issue)),
      ),
    };
  }

  let semanticDiagnostics: readonly Diagnostic[];

  try {
    semanticDiagnostics = validateBroadsetProjectV1Semantics(structural.data);
  } catch (error: unknown) {
    return {
      status: 'quarantined',
      diagnostics: [
        createDiagnostic(
          'semantic-validation-failed',
          error instanceof Error ? error.message : 'Semantic validation failed',
        ),
      ],
    };
  }

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
  const violation = inspectProjectV1JsonText(originalText);

  if (violation !== undefined) {
    return Promise.resolve({
      ...createLimitResult(violation),
      status: 'quarantined',
      originalText,
      ...(options.lastValidProject === undefined ? {} : { lastValidProject: options.lastValidProject }),
    });
  }

  let input: unknown;

  try {
    input = JSON.parse(originalText) as unknown;
  } catch (error: unknown) {
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
