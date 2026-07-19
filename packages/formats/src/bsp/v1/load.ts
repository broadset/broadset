import { projectFormatV1 } from '@broadset/model';

import { readBoundedZip } from '../../_shared/archive/zip-reader';
import { computeSha256DigestV1 } from '../../v1/blob-reference';
import { collectProjectBlobReferencesV1, validatePackageBlobReferencesV1 } from './blob-references';
import { BSP_MANIFEST_PATH_V1, BSP_MAX_DIAGNOSTICS_V1, BSP_PACKAGE_LIMITS_V1, BSP_PROJECT_PATH_V1 } from './constants';
import { bspError, unknownFailureMessage } from './diagnostics';
import { bspPackageManifestV1Schema, validateManifestRelations } from './manifest';
import { validateProjectManifestRelationsV1 } from './reconcile-project-blobs';
import type { BspPackageManifestV1, LoadBspPackageOptionsV1, LoadBspPackageResultV1 } from './types';

const MANIFEST_DECODER = new TextDecoder('utf-8', { fatal: true });
const EMPTY_RECOVERY_BYTES = new Uint8Array();

export async function loadBspPackageV1(
  bytes: Uint8Array,
  options: LoadBspPackageOptionsV1 = {},
): Promise<LoadBspPackageResultV1> {
  if (bytes.byteLength > BSP_PACKAGE_LIMITS_V1.maxInputBytes) {
    return quarantine(
      EMPTY_RECOVERY_BYTES,
      [bspError('bsp.zip.input-size-limit', 'BSP package exceeds the compressed-input limit')],
      options,
    );
  }

  let originalBytes: Uint8Array;

  try {
    originalBytes = bytes.slice();
  } catch (error: unknown) {
    return quarantine(
      EMPTY_RECOVERY_BYTES,
      [bspError('bsp.allocation-failed', unknownFailureMessage(error, 'Unable to retain package bytes'))],
      options,
    );
  }

  try {
    const archive = readBoundedZip({ bytes: originalBytes, limits: BSP_PACKAGE_LIMITS_V1 });

    if (archive.status === 'rejected' || archive.issues.length > 0) {
      return quarantine(
        originalBytes,
        archive.issues.map((issue) =>
          bspError(
            `bsp.zip.${issue.code}`,
            `BSP ZIP validation failed${issue.path === undefined ? '' : ` for ${issue.path}`}`,
          ),
        ),
        options,
      );
    }

    const manifestResult = parseManifest(archive.entries.get(BSP_MANIFEST_PATH_V1));

    if (manifestResult.status === 'failed') return quarantine(originalBytes, manifestResult.diagnostics, options);

    const packageDiagnostics = validatePackageEntries(manifestResult.manifest, archive.entries);

    if (packageDiagnostics.length > 0) return quarantine(originalBytes, packageDiagnostics, options);

    const integrityDiagnostics = await verifyManifestEntries(manifestResult.manifest, archive.entries);

    if (integrityDiagnostics.length > 0) return quarantine(originalBytes, integrityDiagnostics, options);

    const projectBytes = archive.entries.get(BSP_PROJECT_PATH_V1);

    if (projectBytes === undefined) {
      return quarantine(originalBytes, [bspError('bsp.missing-project', 'Package has no project.json entry')], options);
    }

    const loaded = await projectFormatV1.loadProjectV1Json(projectBytes);

    if (loaded.status !== 'loaded') return quarantine(originalBytes, loaded.diagnostics, options);

    const references = collectProjectBlobReferencesV1(loaded.project);
    const referenceDiagnostics = validatePackageBlobReferencesV1(references);
    const relationDiagnostics = validateProjectManifestRelationsV1(references, manifestResult.manifest);
    const diagnostics = [...referenceDiagnostics, ...relationDiagnostics];

    if (diagnostics.length > 0) return quarantine(originalBytes, diagnostics, options);

    const blobs = new Map<projectFormatV1.Sha256Digest, Uint8Array>();

    for (const descriptor of references) {
      const { reference } = descriptor;

      if (blobs.has(reference.digest) || reference.source.kind !== 'package') continue;

      const payload = archive.entries.get(reference.source.path);

      if (payload === undefined) {
        return quarantine(originalBytes, [bspError('bsp.missing-blob', `Missing blob ${reference.digest}`)], options);
      }

      blobs.set(reference.digest, payload.slice());
    }

    return {
      status: 'loaded',
      project: loaded.project,
      blobs,
      diagnostics: loaded.diagnostics.slice(0, BSP_MAX_DIAGNOSTICS_V1),
    };
  } catch (error: unknown) {
    return quarantine(
      originalBytes,
      [bspError('bsp.load-failed', unknownFailureMessage(error, 'BSP package load failed'))],
      options,
    );
  }
}

function parseManifest(
  bytes: Uint8Array | undefined,
):
  | { readonly status: 'parsed'; readonly manifest: BspPackageManifestV1 }
  | { readonly status: 'failed'; readonly diagnostics: readonly projectFormatV1.Diagnostic[] } {
  if (bytes === undefined) {
    return { status: 'failed', diagnostics: [bspError('bsp.missing-manifest', 'Package has no manifest.json entry')] };
  }

  let input: unknown;

  try {
    input = JSON.parse(MANIFEST_DECODER.decode(bytes));
  } catch (error: unknown) {
    return {
      status: 'failed',
      diagnostics: [
        bspError('bsp.invalid-manifest', unknownFailureMessage(error, 'Manifest is not strict UTF-8 JSON')),
      ],
    };
  }

  const parsed = bspPackageManifestV1Schema.safeParse(input);

  if (!parsed.success) {
    return {
      status: 'failed',
      diagnostics: parsed.error.issues
        .slice(0, BSP_MAX_DIAGNOSTICS_V1)
        .map((issue) =>
          bspError('bsp.invalid-manifest', issue.message, issue.path.length === 0 ? '' : `/${issue.path.join('/')}`),
        ),
    };
  }

  const relationFailures = validateManifestRelations(parsed.data);

  if (relationFailures.length > 0) {
    return {
      status: 'failed',
      diagnostics: relationFailures.map((message) => bspError('bsp.invalid-manifest', message)),
    };
  }

  return { status: 'parsed', manifest: parsed.data };
}

function validatePackageEntries(
  manifest: BspPackageManifestV1,
  entries: ReadonlyMap<string, Uint8Array>,
): readonly projectFormatV1.Diagnostic[] {
  const listed = new Set([BSP_MANIFEST_PATH_V1, ...manifest.entries.map(({ path }) => path)]);
  const diagnostics: projectFormatV1.Diagnostic[] = [];

  entries.forEach((_bytes, path) => {
    if (diagnostics.length < BSP_MAX_DIAGNOSTICS_V1 && !listed.has(path)) {
      diagnostics.push(bspError('bsp.unlisted-entry', `ZIP entry is not listed: ${path}`));
    }
  });
  listed.forEach((path) => {
    if (diagnostics.length < BSP_MAX_DIAGNOSTICS_V1 && !entries.has(path))
      diagnostics.push(bspError('bsp.missing-entry', `Manifest-listed ZIP entry is missing: ${path}`));
  });

  return diagnostics;
}

async function verifyManifestEntries(
  manifest: BspPackageManifestV1,
  entries: ReadonlyMap<string, Uint8Array>,
): Promise<readonly projectFormatV1.Diagnostic[]> {
  const diagnostics: projectFormatV1.Diagnostic[] = [];

  for (const descriptor of manifest.entries) {
    if (diagnostics.length >= BSP_MAX_DIAGNOSTICS_V1) break;

    const payload = entries.get(descriptor.path);

    if (payload === undefined) continue;

    if (payload.byteLength !== descriptor.byteLength) {
      diagnostics.push(
        bspError('bsp.entry-length-mismatch', `Entry length does not match manifest: ${descriptor.path}`),
      );

      continue;
    }

    const digest = await computeSha256DigestV1(payload);

    if (digest !== descriptor.digest) {
      diagnostics.push(
        bspError('bsp.entry-digest-mismatch', `Entry digest does not match manifest: ${descriptor.path}`),
      );
    }
  }

  return diagnostics;
}

function quarantine(
  originalBytes: Uint8Array,
  diagnostics: readonly projectFormatV1.Diagnostic[],
  options: LoadBspPackageOptionsV1,
): Extract<LoadBspPackageResultV1, { readonly status: 'quarantined' }> {
  return {
    status: 'quarantined',
    diagnostics: diagnostics.slice(0, BSP_MAX_DIAGNOSTICS_V1),
    originalBytes,
    ...(options.lastValidProject === undefined ? {} : { lastValidProject: options.lastValidProject }),
  };
}
