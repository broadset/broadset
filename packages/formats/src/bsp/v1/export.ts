import { projectFormatV1 } from '@broadset/model';
import { strToU8, zipSync } from 'fflate';

import { verifyBlobBytesV1 } from '../../v1/blob-integrity';
import { computeSha256DigestV1 } from '../../v1/blob-reference';
import { collectProjectBlobReferencesV1, validatePackageBlobReferencesV1 } from './blob-references';
import {
  BSP_JSON_MIME_V1,
  BSP_MANIFEST_PATH_V1,
  BSP_MAX_DIAGNOSTICS_V1,
  BSP_PACKAGE_LIMITS_V1,
  BSP_PROJECT_PATH_V1,
} from './constants';
import { bspError, unknownFailureMessage } from './diagnostics';
import { prepareBspExportV1, type PreparedBspBlobV1, validateBspReferenceCountV1 } from './export-preflight';
import { comparePackageEntryPaths } from './manifest';
import type {
  BspPackageEntryV1,
  BspPackageManifestV1,
  ExportBspPackageOptionsV1,
  ExportBspPackageResultV1,
} from './types';

const FIXED_ZIP_TIME = new Date('1980-01-01T00:00:00.000Z');

export async function exportBspPackageV1(options: ExportBspPackageOptionsV1): Promise<ExportBspPackageResultV1> {
  try {
    const parsed = projectFormatV1.parseProjectV1Unknown(options.project);

    if (parsed.status !== 'loaded') {
      return { status: 'failed', diagnostics: parsed.diagnostics.slice(0, BSP_MAX_DIAGNOSTICS_V1) };
    }

    const references = collectProjectBlobReferencesV1(parsed.project);
    const referenceDiagnostics = validatePackageBlobReferencesV1(references);

    if (referenceDiagnostics.length > 0) return { status: 'failed', diagnostics: referenceDiagnostics };

    const blobReferences = references.map(({ reference }) => reference);
    const countDiagnostics = validateBspReferenceCountV1(blobReferences);

    if (countDiagnostics.length > 0) return { status: 'failed', diagnostics: countDiagnostics };

    const encodedProject = encodeCanonicalProject(parsed.project);

    if (encodedProject.status === 'failed') return encodedProject;

    const prepared = prepareBspExportV1({
      projectByteLength: encodedProject.bytes.byteLength,
      references: blobReferences,
      blobs: options.blobs,
    });

    if (prepared.status === 'rejected') return { status: 'failed', diagnostics: prepared.diagnostics };

    const projectEntry = await createEntry({
      path: BSP_PROJECT_PATH_V1,
      mediaType: BSP_JSON_MIME_V1,
      bytes: encodedProject.bytes,
      role: 'project',
    });
    const verifiedBlobs = await verifyPreparedBlobs(prepared.blobs);

    if (verifiedBlobs.status === 'failed') return verifiedBlobs;

    const entries = [projectEntry, ...verifiedBlobs.entries].sort(comparePackageEntryPaths);
    const manifest: BspPackageManifestV1 = {
      format: 'broadset-project-package',
      version: 1,
      tool: { name: 'Broadset', version: '1' },
      project: projectEntry,
      entries,
    };
    const manifestBytes = encodeUtf8(JSON.stringify(manifest));
    const packageDiagnostics = validateCompletedPackage(entries, manifestBytes);

    if (packageDiagnostics.length > 0) return { status: 'failed', diagnostics: packageDiagnostics };

    const archiveEntries: Record<string, Uint8Array> = {
      [BSP_MANIFEST_PATH_V1]: manifestBytes,
      [BSP_PROJECT_PATH_V1]: encodedProject.bytes,
    };

    verifiedBlobs.payloads.forEach((bytes, path) => {
      archiveEntries[path] = bytes;
    });

    const bytes = zipSync(archiveEntries, { level: 0, mtime: FIXED_ZIP_TIME });

    if (bytes.byteLength > BSP_PACKAGE_LIMITS_V1.maxInputBytes) {
      return {
        status: 'failed',
        diagnostics: [bspError('bsp.input-size-limit', 'Exported BSP package exceeds the 256 MiB input limit')],
      };
    }

    return {
      status: 'exported',
      bytes,
      diagnostics: parsed.diagnostics.slice(0, BSP_MAX_DIAGNOSTICS_V1),
    };
  } catch (error: unknown) {
    return {
      status: 'failed',
      diagnostics: [bspError('bsp.export-failed', unknownFailureMessage(error, 'BSP package export failed'))],
    };
  }
}

function encodeCanonicalProject(
  project: projectFormatV1.BroadsetProjectV1,
):
  | { readonly status: 'encoded'; readonly bytes: Uint8Array }
  | Extract<ExportBspPackageResultV1, { readonly status: 'failed' }> {
  try {
    const bytes = encodeUtf8(projectFormatV1.canonicalizeProjectV1(project));

    return bytes.byteLength > BSP_PACKAGE_LIMITS_V1.maxEntryBytes ?
        {
          status: 'failed',
          diagnostics: [bspError('bsp.entry-size-limit', 'project.json exceeds the entry-size limit')],
        }
      : { status: 'encoded', bytes };
  } catch (error: unknown) {
    if (error instanceof projectFormatV1.ProjectV1LimitError && error.code === 'canonical-output-too-large') {
      return {
        status: 'failed',
        diagnostics: [bspError('bsp.entry-size-limit', 'project.json exceeds the canonical serialization limit')],
      };
    }

    throw error;
  }
}

function encodeUtf8(value: string): Uint8Array {
  const encoded = strToU8(value);

  return new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength);
}

function validateCompletedPackage(
  entries: readonly BspPackageEntryV1[],
  manifestBytes: Uint8Array,
): readonly projectFormatV1.Diagnostic[] {
  if (manifestBytes.byteLength > BSP_PACKAGE_LIMITS_V1.maxEntryBytes) {
    return [bspError('bsp.entry-size-limit', 'manifest.json exceeds the entry-size limit')];
  }

  let retainedBytes = manifestBytes.byteLength;

  for (const entry of entries) {
    if (retainedBytes > BSP_PACKAGE_LIMITS_V1.maxTotalBytes - entry.byteLength) {
      return [bspError('bsp.total-size-limit', 'BSP retained bytes exceed the total-size limit')];
    }

    retainedBytes += entry.byteLength;
  }

  const zipEntryPaths = [BSP_MANIFEST_PATH_V1, ...entries.map(({ path }) => path)];
  const zipOverhead = zipEntryPaths.reduce((total, path) => total + 76 + path.length * 2, 22);

  return retainedBytes > BSP_PACKAGE_LIMITS_V1.maxInputBytes - zipOverhead ?
      [bspError('bsp.input-size-limit', 'Stored BSP package would exceed the compressed-input limit')]
    : [];
}

async function verifyPreparedBlobs(prepared: readonly PreparedBspBlobV1[]): Promise<
  | {
      readonly status: 'verified';
      readonly entries: readonly BspPackageEntryV1[];
      readonly payloads: ReadonlyMap<string, Uint8Array>;
    }
  | Extract<ExportBspPackageResultV1, { readonly status: 'failed' }>
> {
  const entries: BspPackageEntryV1[] = [];
  const payloads = new Map<string, Uint8Array>();

  for (const { reference, bytes } of prepared) {
    const integrity = await verifyBlobBytesV1({
      reference,
      bytes,
      maxBytes: BSP_PACKAGE_LIMITS_V1.maxEntryBytes,
    });

    if (integrity.status === 'rejected') {
      return {
        status: 'failed',
        diagnostics: [bspError(`bsp.${integrity.failure.code}`, integrity.failure.message)],
      };
    }

    if (reference.source.kind !== 'package') {
      return { status: 'failed', diagnostics: [bspError('bsp.non-package-blob', 'Blob source must be package')] };
    }

    entries.push({
      path: reference.source.path,
      mediaType: reference.mediaType,
      byteLength: bytes.byteLength,
      digest: reference.digest,
      role: 'blob',
    });
    payloads.set(reference.source.path, bytes);
  }

  return { status: 'verified', entries, payloads };
}

async function createEntry(input: {
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly role: BspPackageEntryV1['role'];
}): Promise<BspPackageEntryV1> {
  return {
    path: input.path,
    mediaType: input.mediaType,
    byteLength: input.bytes.byteLength,
    digest: await computeSha256DigestV1(input.bytes),
    role: input.role,
  };
}
