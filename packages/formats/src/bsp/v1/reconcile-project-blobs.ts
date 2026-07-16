import type { projectFormatV1 } from '@broadset/model';

import type { ProjectBlobReferenceV1 } from './blob-references';
import { BSP_MAX_DIAGNOSTICS_V1 } from './constants';
import { bspError } from './diagnostics';
import type { BspPackageEntryV1, BspPackageManifestV1 } from './types';

export function validateProjectManifestRelationsV1(
  references: readonly ProjectBlobReferenceV1[],
  manifest: BspPackageManifestV1,
): readonly projectFormatV1.Diagnostic[] {
  const entriesByPath = new Map<string, BspPackageEntryV1>();
  const blobPaths: string[] = [];
  const referencedPaths = new Set<string>();
  const diagnostics: projectFormatV1.Diagnostic[] = [];

  manifest.entries.forEach((entry) => {
    if (entry.role !== 'blob') return;

    const path = entry.path;

    entriesByPath.set(path, entry);
    blobPaths.push(path);
  });

  for (const descriptor of references) {
    if (diagnostics.length >= BSP_MAX_DIAGNOSTICS_V1) break;

    const { reference, pointer } = descriptor;

    if (reference.source.kind !== 'package') continue;

    const referencePath = reference.source.path;
    const entry = entriesByPath.get(referencePath);

    referencedPaths.add(referencePath);

    if (entry === undefined) {
      diagnostics.push(
        bspError('bsp.missing-blob-manifest-entry', `Project blob is absent from manifest: ${referencePath}`, pointer),
      );
    } else if (
      entry.digest !== reference.digest ||
      entry.byteLength !== reference.byteLength ||
      entry.mediaType !== reference.mediaType
    ) {
      diagnostics.push(
        bspError(
          'bsp.blob-descriptor-mismatch',
          `Manifest blob metadata differs from project: ${referencePath}`,
          pointer,
        ),
      );
    }
  }

  for (const path of blobPaths) {
    if (diagnostics.length >= BSP_MAX_DIAGNOSTICS_V1) break;

    if (!referencedPaths.has(path)) {
      diagnostics.push(bspError('bsp.unreferenced-blob', `Manifest blob is not referenced by project.json: ${path}`));
    }
  }

  return diagnostics;
}
