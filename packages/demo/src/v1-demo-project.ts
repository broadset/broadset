import { projectFormatV1 } from '@broadset/model';
import { sceneInstanceKeyV1 } from '@broadset/renderer';
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

function instanceAddress(instance: projectFormatV1.ResolvedSceneInstance): projectFormatV1.InstanceAddress {
  return {
    rootInstanceId: instance.rootInstanceId,
    componentInstancePath: instance.componentInstancePath,
    elementId: instance.element.id,
  };
}

export function layerInstanceIdV1(options: {
  readonly pageId: projectFormatV1.Id;
  readonly address: projectFormatV1.InstanceAddress;
}): string {
  return sceneInstanceKeyV1(options);
}

function toUnknownArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value.map((entry: unknown): unknown => entry) : undefined;
}

export function parseLayerInstanceIdV1(
  value: string,
  pageId: projectFormatV1.Id,
): projectFormatV1.InstanceAddress | undefined {
  let decoded: unknown;

  try {
    decoded = JSON.parse(value);
  } catch {
    return undefined;
  }

  const entries = toUnknownArray(decoded);

  if (entries?.length !== 4 || entries[0] !== pageId) return undefined;

  const parsed = projectFormatV1.instanceAddressSchema.safeParse({
    rootInstanceId: entries[1],
    componentInstancePath: entries[2],
    elementId: entries[3],
  });

  return parsed.success ? parsed.data : undefined;
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
    const address = instanceAddress(instance);

    return {
      id: layerInstanceIdV1({ pageId: options.pageId, address }),
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
