import { projectFormatV1 } from '@broadset/model';
import { z } from 'zod';

import {
  BSP_BLOB_PATH_PREFIX_V1,
  BSP_JSON_MIME_V1,
  BSP_MAX_DIAGNOSTICS_V1,
  BSP_PACKAGE_LIMITS_V1,
  BSP_PROJECT_PATH_V1,
} from './constants';
import type { BspPackageEntryV1, BspPackageManifestV1 } from './types';

const BLOB_PATH_PATTERN = /^blobs\/sha256\/[0-9a-f]{64}$/u;
const PREVIEW_PATH_PATTERN = /^previews\/[^/]+\.[^/.]+$/u;
const HISTORY_PATH_PATTERN = /^optional-history\/[^/]+\.json$/u;
const packageEntrySchema: z.ZodType<BspPackageEntryV1> = z.strictObject({
  path: z.union([
    z.literal(BSP_PROJECT_PATH_V1),
    z.string().regex(BLOB_PATH_PATTERN),
    z.string().regex(PREVIEW_PATH_PATTERN),
    z.string().regex(HISTORY_PATH_PATTERN),
  ]),
  mediaType: z.string().refine(isControlSafeMediaType),
  byteLength: z.number().int().nonnegative().max(BSP_PACKAGE_LIMITS_V1.maxEntryBytes),
  digest: projectFormatV1.sha256DigestSchema,
  role: z.enum(['project', 'blob', 'preview', 'history']),
});

export const bspPackageManifestV1Schema: z.ZodType<BspPackageManifestV1> = z.strictObject({
  format: z.literal('broadset-project-package'),
  version: z.literal(1),
  tool: z.strictObject({
    name: z.string().min(1),
    version: z.string().min(1),
    build: z.string().min(1).optional(),
  }),
  project: packageEntrySchema,
  entries: z.array(packageEntrySchema).max(BSP_PACKAGE_LIMITS_V1.maxEntries - 1),
});

export function comparePackageEntryPaths(left: BspPackageEntryV1, right: BspPackageEntryV1): number {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;

  return 0;
}

export function validateManifestRelations(manifest: BspPackageManifestV1): readonly string[] {
  const failures: string[] = [];
  const paths = new Set<string>();
  let previous: BspPackageEntryV1 | undefined;
  let projectEntry: BspPackageEntryV1 | undefined;
  let projectCount = 0;

  for (const entry of manifest.entries) {
    if (failures.length >= BSP_MAX_DIAGNOSTICS_V1) break;

    appendManifestEntryFailures({ entry, failures, paths, previous });

    if (entry.role === 'project') {
      projectCount += 1;
      projectEntry = entry;
    }

    previous = entry;
  }

  if (projectCount !== 1 && failures.length < BSP_MAX_DIAGNOSTICS_V1) {
    failures.push('Manifest must list exactly one project entry');
  }

  if (
    projectEntry !== undefined &&
    !equalEntries(manifest.project, projectEntry) &&
    failures.length < BSP_MAX_DIAGNOSTICS_V1
  ) {
    failures.push('Manifest project descriptor does not match the project entry');
  }

  return failures;
}

function appendManifestEntryFailures(input: {
  readonly entry: BspPackageEntryV1;
  readonly failures: string[];
  readonly paths: Set<string>;
  readonly previous: BspPackageEntryV1 | undefined;
}): void {
  if (input.paths.has(input.entry.path)) input.failures.push(`Duplicate manifest path: ${input.entry.path}`);

  input.paths.add(input.entry.path);

  if (input.previous !== undefined && comparePackageEntryPaths(input.previous, input.entry) >= 0) {
    input.failures.push('Manifest entries are not in canonical path order');
  }

  for (const failure of validateEntryRelations(input.entry)) {
    if (input.failures.length >= BSP_MAX_DIAGNOSTICS_V1) break;

    input.failures.push(failure);
  }
}

function validateEntryRelations(entry: BspPackageEntryV1): readonly string[] {
  if (entry.role === 'project') {
    return [
      ...(entry.path === BSP_PROJECT_PATH_V1 ? [] : ['The project entry path must be project.json']),
      ...(entry.mediaType === BSP_JSON_MIME_V1 ? [] : ['The project entry media type is invalid']),
    ];
  }

  if (entry.role === 'preview') {
    return PREVIEW_PATH_PATTERN.test(entry.path) ? [] : [`Preview entry has an invalid path: ${entry.path}`];
  }

  if (entry.role === 'history') {
    return HISTORY_PATH_PATTERN.test(entry.path) ? [] : [`History entry has an invalid path: ${entry.path}`];
  }

  return [
    ...(entry.path.startsWith(BSP_BLOB_PATH_PREFIX_V1) ? [] : [`Blob entry has an invalid path: ${entry.path}`]),
    ...(entry.path.slice(BSP_BLOB_PATH_PREFIX_V1.length) === digestHex(entry.digest) ?
      []
    : [`Blob entry path does not match its digest: ${entry.path}`]),
  ];
}

function isControlSafeMediaType(value: string): boolean {
  let slashCount = 0;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code < 0x21 || code > 0x7e) return false;
    if (value.charAt(index) === '/') slashCount += 1;
  }

  return slashCount === 1 && !value.startsWith('/') && !value.endsWith('/');
}

function digestHex(digest: projectFormatV1.Sha256Digest): string {
  return digest.slice('sha256:'.length);
}

function equalEntries(left: BspPackageEntryV1, right: BspPackageEntryV1): boolean {
  return (
    left.path === right.path &&
    left.mediaType === right.mediaType &&
    left.byteLength === right.byteLength &&
    left.digest === right.digest &&
    left.role === right.role
  );
}
