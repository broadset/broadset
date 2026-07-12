import { projectFormatV1 } from '@broadset/model';

const MINIMUM_BOOLEAN_OPERANDS = 2;

export interface RemoveDocumentElementsV1Options {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly elementIds: readonly projectFormatV1.Id[];
}

function collectDeletedElementIds(
  elements: readonly projectFormatV1.Element[],
  requestedIds: readonly projectFormatV1.Id[],
): ReadonlySet<projectFormatV1.Id> {
  const deletedIds = new Set<projectFormatV1.Id>(requestedIds);
  let previousSize = -1;

  while (previousSize !== deletedIds.size) {
    previousSize = deletedIds.size;
    elements.forEach((element) => {
      if (element.parentId !== null && deletedIds.has(element.parentId)) deletedIds.add(element.id);
    });
  }

  return deletedIds;
}

function addPaintEntityIds(
  paint: projectFormatV1.Paint,
  entityIds: Set<projectFormatV1.Id>,
): void {
  if (paint.kind !== 'gradient') return;

  paint.gradient.stops.forEach((stop) => entityIds.add(stop.id));
}

function addElementEntityIds(
  element: projectFormatV1.Element,
  entityIds: Set<projectFormatV1.Id>,
): void {
  entityIds.add(element.id);
  element.appearance.fills.forEach((fill) => {
    entityIds.add(fill.id);
    addPaintEntityIds(fill.paint, entityIds);
  });
  element.appearance.strokes.forEach((stroke) => {
    entityIds.add(stroke.id);
    addPaintEntityIds(stroke.paint, entityIds);
  });
  element.appearance.effects.forEach((effect) => entityIds.add(effect.id));

  if (element.kind === 'text') {
    element.text.paragraphs.forEach((paragraph) => {
      entityIds.add(paragraph.id);
      paragraph.runs.forEach((run) => entityIds.add(run.id));
    });
  }

  if (element.kind === 'vector' && element.geometryData.kind === 'path') {
    element.geometryData.path.points.forEach((point) => entityIds.add(point.id));
  }
}

function collectDeletedEntityIds(
  elements: readonly projectFormatV1.Element[],
  deletedElementIds: ReadonlySet<projectFormatV1.Id>,
): ReadonlySet<projectFormatV1.Id> {
  const entityIds = new Set<projectFormatV1.Id>();

  elements.forEach((element) => {
    if (deletedElementIds.has(element.id)) addElementEntityIds(element, entityIds);
  });

  return entityIds;
}

function removeDeletedAppearanceReferences(
  appearance: projectFormatV1.Appearance,
  deletedElementIds: ReadonlySet<projectFormatV1.Id>,
): projectFormatV1.Appearance {
  const clip = appearance.clip;
  const mask = appearance.mask;
  const keepClip =
    clip !== undefined &&
    (clip.kind === 'vector' ? !deletedElementIds.has(clip.vectorElementId) : !deletedElementIds.has(clip.componentInstanceId));
  let keepMask = mask !== undefined;

  if (mask?.kind === 'vector') keepMask = !deletedElementIds.has(mask.vectorElementId);
  if (mask?.kind === 'component-path') keepMask = !deletedElementIds.has(mask.componentInstanceId);

  return {
    opacity: appearance.opacity,
    blendMode: appearance.blendMode,
    isolation: appearance.isolation,
    fills: appearance.fills,
    strokes: appearance.strokes,
    effects: appearance.effects,
    ...(keepClip ? { clip } : {}),
    ...(keepMask ? { mask } : {}),
  };
}

function repairSurvivingElementReferences(
  element: projectFormatV1.Element,
  deletedElementIds: ReadonlySet<projectFormatV1.Id>,
): projectFormatV1.Element {
  const appearance = removeDeletedAppearanceReferences(element.appearance, deletedElementIds);

  if (element.kind === 'text') {
    const { textPath, ...base } = element;

    return textPath === undefined || deletedElementIds.has(textPath.vectorElementId)
      ? { ...base, appearance }
      : { ...base, appearance, textPath };
  }

  if (element.kind !== 'vector' || element.geometryData.kind !== 'boolean') {
    return { ...element, appearance };
  }

  const operandIds = element.geometryData.operandIds.filter((operandId) => !deletedElementIds.has(operandId));

  return {
    ...element,
    appearance,
    geometryData:
      operandIds.length < MINIMUM_BOOLEAN_OPERANDS
        ? projectFormatV1.createRectangleGeometry()
        : { ...element.geometryData, operandIds },
  };
}

function targetReferencesDeletedEntity(
  target: projectFormatV1.PropertyTarget,
  deletedEntityIds: ReadonlySet<projectFormatV1.Id>,
): boolean {
  return deletedEntityIds.has(target.entity.entityId);
}

function removeElementsFromDocument(
  document: projectFormatV1.BroadsetDocumentV1,
  requestedIds: readonly projectFormatV1.Id[],
): projectFormatV1.BroadsetDocumentV1 {
  const existingIds = new Set(document.elements.map((element) => element.id));
  const requestedExistingIds = requestedIds.filter((elementId) => existingIds.has(elementId));

  if (requestedExistingIds.length === 0) return document;

  const deletedIds = collectDeletedElementIds(document.elements, requestedExistingIds);
  const deletedEntityIds = collectDeletedEntityIds(document.elements, deletedIds);

  return {
    ...document,
    elements: document.elements
      .filter((element) => !deletedIds.has(element.id))
      .map((element) => repairSurvivingElementReferences(element, deletedIds)),
    pages: document.pages.map((page) => ({
      ...page,
      rootInstances: page.rootInstances.filter((instance) => !deletedIds.has(instance.elementId)),
      descendantOverrides: page.descendantOverrides.filter((entry) => !deletedIds.has(entry.address.elementId)),
    })),
    sequences: document.sequences.map((sequence) => ({
      ...sequence,
      tracks: sequence.tracks.filter((track) => !targetReferencesDeletedEntity(track.target, deletedEntityIds)),
    })),
    stateMachines: document.stateMachines.map((machine) => ({
      ...machine,
      states: machine.states.map((state) => ({
        ...state,
        values: state.values.filter((value) => !targetReferencesDeletedEntity(value.target, deletedEntityIds)),
      })),
    })),
    bindings: document.bindings.filter((binding) => !targetReferencesDeletedEntity(binding.target, deletedEntityIds)),
  };
}

/** Removes document-owned element subtrees without leaving page placements or direct property targets dangling. */
export function removeDocumentElementsV1(
  options: RemoveDocumentElementsV1Options,
): projectFormatV1.BroadsetProjectV1 {
  if (options.elementIds.length === 0) return options.project;

  const documentIndex = options.project.documents.findIndex((document) => document.id === options.documentId);

  if (documentIndex < 0) return options.project;

  const currentDocument = options.project.documents[documentIndex];

  if (currentDocument === undefined) return options.project;

  const nextDocument = removeElementsFromDocument(currentDocument, options.elementIds);

  if (nextDocument === currentDocument) return options.project;

  return {
    ...options.project,
    documents: options.project.documents.map((document, index) =>
      index === documentIndex ? nextDocument : document,
    ),
  };
}
