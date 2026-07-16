import type { projectFormatV1 } from '@broadset/model';

import {
  BSP_JSON_MIME_V1,
  BSP_MANIFEST_PATH_V1,
  BSP_MAX_DIAGNOSTICS_V1,
  BSP_PACKAGE_LIMITS_V1,
  BSP_PROJECT_PATH_V1,
} from './constants';
import { bspError } from './diagnostics';

export interface PreparedBspBlobV1 {
  readonly reference: projectFormatV1.BlobReference;
  readonly bytes: Uint8Array;
}

type BspExportPreparationV1 =
  | { readonly status: 'ready'; readonly blobs: readonly PreparedBspBlobV1[] }
  | { readonly status: 'rejected'; readonly diagnostics: readonly projectFormatV1.Diagnostic[] };

interface CapturedBspBlobV1 {
  readonly reference: projectFormatV1.BlobReference;
  readonly source: Uint8Array;
}

interface PreflightAnalysisV1 {
  readonly captured: readonly CapturedBspBlobV1[];
  readonly diagnostics: readonly projectFormatV1.Diagnostic[];
}

interface EstimatedManifestEntryV1 {
  readonly path: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly digest: string;
  readonly role: 'project' | 'blob';
}

const PLACEHOLDER_DIGEST = `sha256:${'0'.repeat(64)}`;
const MANIFEST_PREFIX =
  '{"format":"broadset-project-package","version":1,"tool":{"name":"Broadset","version":"1"},"project":';
const MANIFEST_ENTRIES_PREFIX = ',"entries":[';
const MANIFEST_SUFFIX = ']}';

export function validateBspReferenceCountV1(
  references: readonly projectFormatV1.BlobReference[],
): readonly projectFormatV1.Diagnostic[] {
  const uniqueDigests = new Set<projectFormatV1.Sha256Digest>();

  references.forEach((reference) => uniqueDigests.add(reference.digest));

  return uniqueDigests.size + 2 > BSP_PACKAGE_LIMITS_V1.maxEntries ?
      [bspError('bsp.entry-count-limit', 'BSP package would exceed the 4096-entry limit')]
    : [];
}

export function preflightBspExportV1(input: {
  readonly projectByteLength: number;
  readonly references: readonly projectFormatV1.BlobReference[];
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
}): readonly projectFormatV1.Diagnostic[] {
  return analyzeBspExportV1(input).diagnostics;
}

export function prepareBspExportV1(input: {
  readonly projectByteLength: number;
  readonly references: readonly projectFormatV1.BlobReference[];
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
}): BspExportPreparationV1 {
  const analysis = analyzeBspExportV1(input);

  if (analysis.diagnostics.length > 0) return { status: 'rejected', diagnostics: analysis.diagnostics };

  const blobs: PreparedBspBlobV1[] = [];

  try {
    for (const captured of analysis.captured) {
      const bytes = captured.source.slice();

      if (bytes.byteLength !== captured.source.byteLength) {
        return {
          status: 'rejected',
          diagnostics: [bspError('bsp.allocation-failed', `Unable to retain blob ${captured.reference.digest}`)],
        };
      }

      blobs.push({ reference: captured.reference, bytes });
    }
  } catch {
    return {
      status: 'rejected',
      diagnostics: [bspError('bsp.allocation-failed', 'Unable to retain BSP blob bytes')],
    };
  }

  return { status: 'ready', blobs };
}

function analyzeBspExportV1(input: {
  readonly projectByteLength: number;
  readonly references: readonly projectFormatV1.BlobReference[];
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
}): PreflightAnalysisV1 {
  const diagnostics: projectFormatV1.Diagnostic[] = [...validateBspReferenceCountV1(input.references)];
  const captured: CapturedBspBlobV1[] = [];
  const uniqueReferences = uniqueBlobReferences(input.references);
  let retainedBytes = validProjectLength(input.projectByteLength, diagnostics) ? input.projectByteLength : 0;

  for (const reference of uniqueReferences) {
    if (diagnostics.length >= BSP_MAX_DIAGNOSTICS_V1) break;

    const source = input.blobs.get(reference.digest);

    validateDeclaredBlobLength(reference, diagnostics);

    if (source === undefined) {
      diagnostics.push(bspError('bsp.missing-blob', `Missing blob bytes for ${reference.digest}`));

      continue;
    }

    captured.push({ reference, source });
    retainedBytes = validateCapturedBlob({ reference, source, retainedBytes, diagnostics });
  }

  reserveManifestAndZipBytes({
    projectByteLength: input.projectByteLength,
    references: uniqueReferences,
    retainedBytes,
    diagnostics,
  });

  return { captured, diagnostics: diagnostics.slice(0, BSP_MAX_DIAGNOSTICS_V1) };
}

function uniqueBlobReferences(
  references: readonly projectFormatV1.BlobReference[],
): readonly projectFormatV1.BlobReference[] {
  const seen = new Set<projectFormatV1.Sha256Digest>();
  const unique: projectFormatV1.BlobReference[] = [];

  references.forEach((reference) => {
    if (seen.has(reference.digest)) return;

    seen.add(reference.digest);
    unique.push(reference);
  });

  return unique;
}

function validProjectLength(byteLength: number, diagnostics: projectFormatV1.Diagnostic[]): boolean {
  if (!isSafeByteLength(byteLength)) {
    diagnostics.push(bspError('bsp.invalid-byte-length', 'project.json has an unsafe byte length'));

    return false;
  }

  if (byteLength > BSP_PACKAGE_LIMITS_V1.maxEntryBytes) {
    diagnostics.push(bspError('bsp.entry-size-limit', 'project.json exceeds the entry-size limit'));

    return false;
  }

  return true;
}

function validateDeclaredBlobLength(
  reference: projectFormatV1.BlobReference,
  diagnostics: projectFormatV1.Diagnostic[],
): void {
  if (!isSafeByteLength(reference.byteLength)) {
    diagnostics.push(bspError('bsp.invalid-byte-length', `Blob ${reference.digest} has an unsafe byte length`));
  } else if (reference.byteLength > BSP_PACKAGE_LIMITS_V1.maxEntryBytes) {
    diagnostics.push(bspError('bsp.entry-size-limit', `Blob ${reference.digest} exceeds the entry-size limit`));
  }
}

function validateCapturedBlob(input: {
  readonly reference: projectFormatV1.BlobReference;
  readonly source: Uint8Array;
  readonly retainedBytes: number;
  readonly diagnostics: projectFormatV1.Diagnostic[];
}): number {
  const actualBytes = input.source.byteLength;

  if (!isSafeByteLength(actualBytes) || actualBytes > BSP_PACKAGE_LIMITS_V1.maxEntryBytes) {
    input.diagnostics.push(
      bspError('bsp.entry-size-limit', `Blob ${input.reference.digest} exceeds the entry-size limit`),
    );

    return input.retainedBytes;
  }

  if (actualBytes !== input.reference.byteLength) {
    input.diagnostics.push(
      bspError('bsp.byte-length-mismatch', `Blob ${input.reference.digest} length differs from its reference`),
    );
  }

  if (input.retainedBytes > BSP_PACKAGE_LIMITS_V1.maxTotalBytes - actualBytes) {
    input.diagnostics.push(bspError('bsp.total-size-limit', 'BSP retained payload bytes exceed the total-size limit'));

    return input.retainedBytes;
  }

  return input.retainedBytes + actualBytes;
}

function reserveManifestAndZipBytes(input: {
  readonly projectByteLength: number;
  readonly references: readonly projectFormatV1.BlobReference[];
  readonly retainedBytes: number;
  readonly diagnostics: projectFormatV1.Diagnostic[];
}): void {
  const manifestBytes = estimateManifestByteLength(input.projectByteLength, input.references);

  if (manifestBytes === undefined) {
    input.diagnostics.push(bspError('bsp.entry-size-limit', 'manifest.json exceeds the entry-size limit'));

    return;
  }

  if (input.retainedBytes > BSP_PACKAGE_LIMITS_V1.maxTotalBytes - manifestBytes) {
    input.diagnostics.push(bspError('bsp.total-size-limit', 'BSP retained bytes exceed the total-size limit'));
  }

  const zipOverhead = storedZipOverhead(input.references);

  if (input.retainedBytes + manifestBytes > BSP_PACKAGE_LIMITS_V1.maxInputBytes - zipOverhead) {
    input.diagnostics.push(
      bspError('bsp.input-size-limit', 'Stored BSP package would exceed the compressed-input limit'),
    );
  }
}

function estimateManifestByteLength(
  projectByteLength: number,
  references: readonly projectFormatV1.BlobReference[],
): number | undefined {
  const projectEntry: EstimatedManifestEntryV1 = {
    path: BSP_PROJECT_PATH_V1,
    mediaType: BSP_JSON_MIME_V1,
    byteLength: projectByteLength,
    digest: PLACEHOLDER_DIGEST,
    role: 'project',
  };
  let total = MANIFEST_PREFIX.length;

  total = addManifestEntryBytes(total, projectEntry);
  if (total < 0) return undefined;
  total = addWithinLimit(total, MANIFEST_ENTRIES_PREFIX.length);
  if (total < 0) return undefined;

  let hasEntry = false;

  for (const reference of references) {
    if (reference.source.kind !== 'package') return undefined;
    if (hasEntry) total = addWithinLimit(total, 1);

    total = addManifestEntryBytes(total, {
      path: reference.source.path,
      mediaType: reference.mediaType,
      byteLength: reference.byteLength,
      digest: reference.digest,
      role: 'blob',
    });
    if (total < 0) return undefined;
    hasEntry = true;
  }

  if (hasEntry) total = addWithinLimit(total, 1);
  total = addManifestEntryBytes(total, projectEntry);
  if (total < 0) return undefined;
  total = addWithinLimit(total, MANIFEST_SUFFIX.length);

  return total < 0 ? undefined : total;
}

function addManifestEntryBytes(total: number, entry: EstimatedManifestEntryV1): number {
  const fixedParts = ['{"path":', ',"mediaType":', ',"byteLength":', ',"digest":', ',"role":', '}'];
  const stringValues = [entry.path, entry.mediaType, entry.digest, entry.role];
  let next = total;

  next = addWithinLimit(next, fixedParts[0]?.length ?? 0);
  next = addJsonStringBytes(next, stringValues[0] ?? '');
  next = addWithinLimit(next, fixedParts[1]?.length ?? 0);
  next = addJsonStringBytes(next, stringValues[1] ?? '');
  next = addWithinLimit(next, fixedParts[2]?.length ?? 0);
  next = addWithinLimit(next, String(entry.byteLength).length);
  next = addWithinLimit(next, fixedParts[3]?.length ?? 0);
  next = addJsonStringBytes(next, stringValues[2] ?? '');
  next = addWithinLimit(next, fixedParts[4]?.length ?? 0);
  next = addJsonStringBytes(next, stringValues[3] ?? '');

  return addWithinLimit(next, fixedParts[5]?.length ?? 0);
}

function addJsonStringBytes(total: number, value: string): number {
  let next = addWithinLimit(total, 2);

  for (let index = 0; index < value.length && next >= 0; index += 1) {
    const code = value.charCodeAt(index);

    if (
      code === 0x22 ||
      code === 0x5c ||
      code === 0x08 ||
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0c ||
      code === 0x0d
    )
      next = addWithinLimit(next, 2);
    else if (code <= 0x1f || (code >= 0xd800 && code <= 0xdfff && !isSurrogatePair(value, index)))
      next = addWithinLimit(next, 6);
    else if (code <= 0x7f) next = addWithinLimit(next, 1);
    else if (code <= 0x7ff) next = addWithinLimit(next, 2);
    else if (code >= 0xd800 && code <= 0xdbff) {
      next = addWithinLimit(next, 4);
      index += 1;
    } else next = addWithinLimit(next, 3);
  }

  return next;
}

function isSurrogatePair(value: string, index: number): boolean {
  const leading = value.charCodeAt(index);
  const trailing = value.charCodeAt(index + 1);

  return leading >= 0xd800 && leading <= 0xdbff && trailing >= 0xdc00 && trailing <= 0xdfff;
}

function addWithinLimit(total: number, addition: number): number {
  if (total < 0 || addition > BSP_PACKAGE_LIMITS_V1.maxEntryBytes - total) return -1;

  return total + addition;
}

function storedZipOverhead(references: readonly projectFormatV1.BlobReference[]): number {
  const paths = [
    BSP_MANIFEST_PATH_V1,
    BSP_PROJECT_PATH_V1,
    ...references.flatMap((reference) => (reference.source.kind === 'package' ? [reference.source.path] : [])),
  ];

  return paths.reduce((total, path) => total + 76 + path.length * 2, 22);
}

function isSafeByteLength(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
