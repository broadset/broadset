import { projectFormatV1 } from '@broadset/model';

import type { ProjectImportResultV1, ResourceCollectionV1 } from '../../v1';

function mergeElement(
  preserved: projectFormatV1.Element,
  current: projectFormatV1.Element,
): projectFormatV1.Element {
  return projectFormatV1.elementSchema.parse({
    ...preserved,
    geometry: current.geometry,
    appearance: current.appearance,
    locked: current.locked,
    ...(preserved.kind === 'text' && current.kind === 'text' ? { text: current.text } : {}),
    ...(preserved.kind === 'vector' && current.kind === 'vector' ? { geometryData: current.geometryData } : {}),
  });
}

function mergeAssets(
  preserved: readonly projectFormatV1.Asset[],
  current: readonly projectFormatV1.Asset[],
): readonly projectFormatV1.Asset[] {
  return [...new Map([...preserved, ...current].map((asset) => [asset.id, asset])).values()];
}

function mergeFonts(
  preserved: readonly projectFormatV1.FontFamilyResource[],
  current: readonly projectFormatV1.FontFamilyResource[],
): readonly projectFormatV1.FontFamilyResource[] {
  return [...new Map([...preserved, ...current].map((font) => [font.id, font])).values()];
}

export function reconcileMetadataProjectV1(input: {
  readonly preservedProject: projectFormatV1.BroadsetProjectV1;
  readonly currentDocument: projectFormatV1.BroadsetDocumentV1;
  readonly currentResources: ResourceCollectionV1;
  readonly preservedBlobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
}): ProjectImportResultV1 | undefined {
  const preservedDocument = input.preservedProject.documents[0];

  if (preservedDocument === undefined) return undefined;

  const currentById = new Map(input.currentDocument.elements.map((element) => [element.id, element]));
  const preservedIds = new Set(preservedDocument.elements.map(({ id }) => id));
  const elements = preservedDocument.elements.map((element) => {
    const current = currentById.get(element.id);

    return current === undefined ? element : mergeElement(element, current);
  });
  const additions = input.currentDocument.elements.filter(({ id }) => !preservedIds.has(id));
  const documents = input.preservedProject.documents.map((document, index) =>
    index === 0 ?
      {
        ...document,
        surface: { ...document.surface, size: input.currentDocument.surface.size },
        elements: [...elements, ...additions],
      }
    : document,
  );
  const project: projectFormatV1.BroadsetProjectV1 = {
    ...input.preservedProject,
    resources: {
      ...input.preservedProject.resources,
      assets: mergeAssets(input.preservedProject.resources.assets, input.currentResources.resources.assets),
      fonts: mergeFonts(input.preservedProject.resources.fonts, input.currentResources.resources.fonts),
    },
    documents,
  };
  const structural = projectFormatV1.parseProjectV1Unknown(project);

  if (structural.status !== 'loaded') return undefined;

  if (projectFormatV1.validateBroadsetProjectV1Semantics(project).some(({ severity }) => severity === 'error')) {
    return undefined;
  }

  return {
    project,
    blobs: new Map([...input.preservedBlobs, ...input.currentResources.blobs]),
  };
}
