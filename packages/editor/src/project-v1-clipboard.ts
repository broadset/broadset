import { projectFormatV1 } from '@broadset/model';

import { isValidProject } from './store-actions/project-store-mutations';

const CLIPBOARD_KIND = 'broadset-elements';
const CLIPBOARD_VERSION = 1;
const MAX_CLIPBOARD_JSON_LENGTH = 5_000_000;
const MINIMUM_BOOLEAN_OPERANDS = 2;

function collectCopiedIds(
  elements: readonly projectFormatV1.Element[],
  selectedIds: ReadonlySet<projectFormatV1.Id>,
): ReadonlySet<projectFormatV1.Id> {
  const copiedIds = new Set(selectedIds);
  let previousSize = -1;

  while (previousSize !== copiedIds.size) {
    previousSize = copiedIds.size;
    elements.forEach((element) => {
      if (element.parentId !== null && copiedIds.has(element.parentId)) copiedIds.add(element.id);
    });
  }

  return copiedIds;
}

function detachedGeometry(
  element: projectFormatV1.Element,
  copiedIds: ReadonlySet<projectFormatV1.Id>,
  elementsById: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Element>,
): projectFormatV1.ElementGeometry {
  if (element.parentId === null || copiedIds.has(element.parentId)) return element.geometry;

  let transform = element.geometry.transform;
  let parentId: projectFormatV1.Id | null = element.parentId;
  const visited = new Set<projectFormatV1.Id>([element.id]);

  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);

    const parent = elementsById.get(parentId);

    if (parent === undefined) break;

    transform = projectFormatV1.composeElementTransformsV1(parent.geometry.transform, transform);
    parentId = parent.parentId;
  }

  return { ...element.geometry, transform };
}

function remapAppearance(
  appearance: projectFormatV1.Appearance,
  ids: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Id>,
): projectFormatV1.Appearance {
  const clip = appearance.clip;
  const mask = appearance.mask;
  let remappedClip: projectFormatV1.Appearance['clip'] = undefined;
  let remappedMask: projectFormatV1.Appearance['mask'];

  if (clip?.kind === 'vector') {
    const vectorElementId = ids.get(clip.vectorElementId);

    remappedClip = vectorElementId === undefined ? undefined : { ...clip, vectorElementId };
  } else if (clip?.kind === 'component-path') {
    const componentInstanceId = ids.get(clip.componentInstanceId);

    remappedClip = componentInstanceId === undefined ? undefined : { ...clip, componentInstanceId };
  }

  if (mask?.kind === 'vector') {
    const vectorElementId = ids.get(mask.vectorElementId);

    remappedMask = vectorElementId === undefined ? undefined : { ...mask, vectorElementId };
  } else if (mask?.kind === 'component-path') {
    const componentInstanceId = ids.get(mask.componentInstanceId);

    remappedMask = componentInstanceId === undefined ? undefined : { ...mask, componentInstanceId };
  } else {
    remappedMask = mask;
  }

  return {
    opacity: appearance.opacity,
    blendMode: appearance.blendMode,
    isolation: appearance.isolation,
    fills: appearance.fills,
    strokes: appearance.strokes,
    effects: appearance.effects,
    ...(remappedClip === undefined ? {} : { clip: remappedClip }),
    ...(remappedMask === undefined ? {} : { mask: remappedMask }),
  };
}

function remapElement(
  element: projectFormatV1.Element,
  ids: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Id>,
): projectFormatV1.Element {
  const nextId = ids.get(element.id);

  if (nextId === undefined) return element;

  const parentId = element.parentId === null ? null : (ids.get(element.parentId) ?? null);
  const remappedBase = {
    id: nextId,
    name: parentId === null ? `${element.name} copy` : element.name,
    parentId,
    appearance: remapAppearance(element.appearance, ids),
  };

  if (element.kind === 'text') {
    const vectorElementId = element.textPath === undefined ? undefined : ids.get(element.textPath.vectorElementId);
    const { textPath: _textPath, ...withoutTextPath } = element;

    return vectorElementId === undefined || element.textPath === undefined ?
        { ...withoutTextPath, ...remappedBase }
      : { ...withoutTextPath, ...remappedBase, textPath: { ...element.textPath, vectorElementId } };
  }

  if (element.kind !== 'vector' || element.geometryData.kind !== 'boolean') return { ...element, ...remappedBase };

  const operandIds = element.geometryData.operandIds.flatMap((operandId) => {
    const remapped = ids.get(operandId);

    return remapped === undefined ? [] : [remapped];
  });

  return {
    ...element,
    ...remappedBase,
    geometryData:
      operandIds.length < MINIMUM_BOOLEAN_OPERANDS ?
        projectFormatV1.createRectangleGeometry()
      : { ...element.geometryData, operandIds },
  };
}

function parsePayload(json: string): readonly projectFormatV1.Element[] | null {
  if (json.length === 0 || json.length > MAX_CLIPBOARD_JSON_LENGTH) return null;

  try {
    const input: unknown = JSON.parse(json);

    if (typeof input !== 'object' || input === null) return null;
    if (Reflect.get(input, 'kind') !== CLIPBOARD_KIND || Reflect.get(input, 'version') !== CLIPBOARD_VERSION) return null;

    const candidates: unknown = Reflect.get(input, 'elements');

    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    const elements = candidates.flatMap((candidate) => {
      const parsed = projectFormatV1.elementSchema.safeParse(candidate);

      return parsed.success ? [parsed.data] : [];
    });

    return elements.length === candidates.length ? elements : null;
  } catch {
    return null;
  }
}

export function createElementClipboardPayloadV1(options: {
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly selectedElementIds: readonly projectFormatV1.Id[];
}): string | null {
  const existingIds = new Set(options.document.elements.map(({ id }) => id));
  const selectedIds = new Set(options.selectedElementIds.filter((elementId) => existingIds.has(elementId)));

  if (selectedIds.size === 0) return null;

  const copiedIds = collectCopiedIds(options.document.elements, selectedIds);
  const elementsById = new Map(options.document.elements.map((element) => [element.id, element]));
  const elements = options.document.elements
    .filter(({ id }) => copiedIds.has(id))
    .map((element): projectFormatV1.Element => ({
      ...element,
      parentId: element.parentId !== null && copiedIds.has(element.parentId) ? element.parentId : null,
      geometry: detachedGeometry(element, copiedIds, elementsById),
    }));

  return JSON.stringify({ kind: CLIPBOARD_KIND, version: CLIPBOARD_VERSION, elements });
}

export function pasteElementClipboardPayloadV1(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
  readonly payload: string;
  readonly createId: () => projectFormatV1.Id;
}): { readonly project: projectFormatV1.BroadsetProjectV1; readonly rootElementIds: readonly projectFormatV1.Id[] } | null {
  const sourceElements = parsePayload(options.payload);
  const document = options.project.documents.find(({ id }) => id === options.documentId);

  if (sourceElements === null || !document?.pages.some(({ id }) => id === options.pageId)) {
    return null;
  }

  const ids = new Map(sourceElements.map((element) => [element.id, options.createId()]));
  const elements = sourceElements.map((element) => remapElement(element, ids));
  const rootElementIds = elements.filter(({ parentId }) => parentId === null).map(({ id }) => id);
  const nextDocument: projectFormatV1.BroadsetDocumentV1 = {
    ...document,
    elements: [...document.elements, ...elements],
    pages: document.pages.map((page) =>
      page.id === options.pageId ?
        {
          ...page,
          rootInstances: [
            ...page.rootInstances,
            ...rootElementIds.map((elementId): projectFormatV1.PageRootInstance => ({
              id: options.createId(),
              elementId,
              overrides: [],
              componentPropertyValues: [],
            })),
          ],
        }
      : page,
    ),
  };
  const project: projectFormatV1.BroadsetProjectV1 = {
    ...options.project,
    documents: options.project.documents.map((candidate) => (candidate.id === document.id ? nextDocument : candidate)),
  };

  return isValidProject(project) ? { project, rootElementIds } : null;
}
