import { projectFormatV1 } from '@broadset/model';
import type { LayerInfo, MediaAsset } from '@broadset/ui';

function layerType(element: projectFormatV1.Element): string {
  if (element.kind !== 'vector') return element.kind;

  switch (element.geometryData.kind) {
    case 'rectangle':
      return 'rectangle';
    case 'ellipse':
      return 'ellipse';
    case 'path':
    case 'boolean':
      return 'path';
  }
}

export function selectDocumentV1(
  project: projectFormatV1.BroadsetProjectV1,
  documentId: projectFormatV1.Id,
): projectFormatV1.BroadsetDocumentV1 | undefined {
  return project.documents.find((document) => document.id === documentId);
}

export function selectPageV1(
  project: projectFormatV1.BroadsetProjectV1,
  documentId: projectFormatV1.Id,
  pageId: projectFormatV1.Id,
): projectFormatV1.PageDefinition | undefined {
  return selectDocumentV1(project, documentId)?.pages.find((page) => page.id === pageId);
}

export function buildLayerInfoListV1(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
}): readonly LayerInfo[] {
  const instances = projectFormatV1.resolvePageInstanceTree(options);
  const elementsById = new Map(instances.map(({ element }) => [element.id, element]));
  const childCounts = new Map<projectFormatV1.Id, number>();

  for (const instance of instances) {
    if (instance.parentElementId !== null) {
      childCounts.set(instance.parentElementId, (childCounts.get(instance.parentElementId) ?? 0) + 1);
    }
  }

  return instances.map((instance) => {
    const parent = instance.parentElementId === null ? undefined : elementsById.get(instance.parentElementId);

    return {
      id: instance.element.id,
      type: layerType(instance.element),
      name: instance.element.name,
      locked: instance.element.locked,
      visible: instance.visible,
      depth: instance.depth,
      expanded: true,
      hasChildren: (childCounts.get(instance.element.id) ?? 0) > 0,
      ...(parent === undefined ? {} : { parentName: parent.name }),
    };
  });
}

export function resolveProjectAssetUrlV1(
  project: projectFormatV1.BroadsetProjectV1,
  assetId: projectFormatV1.Id,
): string | null {
  const asset = project.resources.assets.find((candidate) => candidate.id === assetId);

  return asset?.blob.source.kind === 'external' ? asset.blob.source.url : null;
}

export function buildMediaAssetsV1(project: projectFormatV1.BroadsetProjectV1): readonly MediaAsset[] {
  return project.resources.assets.flatMap((asset) => {
    const url = resolveProjectAssetUrlV1(project, asset.id);

    return url === null ? [] : [{ id: asset.id, name: asset.name, url, category: asset.kind }];
  });
}
