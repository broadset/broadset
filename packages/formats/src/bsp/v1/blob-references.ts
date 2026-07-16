import type { projectFormatV1 } from '@broadset/model';

import { BSP_BLOB_PATH_PREFIX_V1, BSP_MAX_DIAGNOSTICS_V1 } from './constants';

export interface ProjectBlobReferenceV1 {
  readonly reference: projectFormatV1.BlobReference;
  readonly pointer: string;
}

export function collectProjectBlobReferencesV1(
  project: projectFormatV1.BroadsetProjectV1,
): readonly ProjectBlobReferenceV1[] {
  const references: ProjectBlobReferenceV1[] = [];

  project.resources.assets.forEach((asset, assetIndex) => {
    const assetPointer = `/resources/assets/${String(assetIndex)}`;

    references.push({ reference: asset.blob, pointer: `${assetPointer}/blob` });
    asset.derivatives?.forEach((derivative, derivativeIndex) => {
      references.push({
        reference: derivative.blob,
        pointer: `${assetPointer}/derivatives/${String(derivativeIndex)}/blob`,
      });
    });
  });

  return references;
}

function expectedBlobPathV1(digest: projectFormatV1.Sha256Digest): string {
  return `${BSP_BLOB_PATH_PREFIX_V1}${digest.slice('sha256:'.length)}`;
}

export function validatePackageBlobReferencesV1(
  references: readonly ProjectBlobReferenceV1[],
): readonly projectFormatV1.Diagnostic[] {
  const diagnostics: projectFormatV1.Diagnostic[] = [];
  const byDigest = new Map<projectFormatV1.Sha256Digest, projectFormatV1.BlobReference>();

  for (const descriptor of references) {
    if (diagnostics.length >= BSP_MAX_DIAGNOSTICS_V1) break;

    const { reference, pointer } = descriptor;

    if (reference.source.kind !== 'package') {
      diagnostics.push(
        error('bsp.non-package-blob', 'Every packaged asset blob source must have kind package', pointer),
      );

      continue;
    }

    if (reference.source.path !== expectedBlobPathV1(reference.digest)) {
      diagnostics.push(error('bsp.blob-path-mismatch', 'Blob package path must match its SHA-256 digest', pointer));
    }

    const prior = byDigest.get(reference.digest);

    if (
      prior !== undefined &&
      (prior.byteLength !== reference.byteLength ||
        prior.mediaType !== reference.mediaType ||
        prior.source.kind !== 'package' ||
        prior.source.path !== reference.source.path)
    ) {
      diagnostics.push(
        error('bsp.inconsistent-blob-reference', 'Repeated blob digest has inconsistent metadata', pointer),
      );
    }

    byDigest.set(reference.digest, prior ?? reference);
  }

  return diagnostics;
}

function error(code: string, message: string, pointer: string): projectFormatV1.Diagnostic {
  return { code, severity: 'error', message, pointer };
}
