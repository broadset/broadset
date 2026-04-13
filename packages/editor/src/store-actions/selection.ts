import type { BroadsetDocument } from '@broadset/model';

import type { EditingMode, EditorState } from './store';

export function createEditingMode(
  pendingPlacementType: string | null,
  pathEditingElementId: string | null,
  pathDrawingElementId: string | null,
  inlineTextEditingElementId: string | null,
  clipPathEditingElementId: string | null = null,
  motionPathEditingElementId: string | null = null,
): EditingMode {
  if (motionPathEditingElementId !== null) {
    return { type: 'motion-path-editing', elementId: motionPathEditingElementId };
  }

  if (clipPathEditingElementId !== null) {
    return { type: 'clip-path-editing', elementId: clipPathEditingElementId };
  }

  if (inlineTextEditingElementId !== null) {
    return { type: 'inline-text', elementId: inlineTextEditingElementId };
  }

  if (pathDrawingElementId !== null) {
    return { type: 'path-drawing', elementId: pathDrawingElementId };
  }

  if (pathEditingElementId !== null) {
    return { type: 'path-editing', elementId: pathEditingElementId };
  }

  if (pendingPlacementType !== null) {
    return { type: 'placement', elementType: pendingPlacementType };
  }

  return { type: 'none' };
}

export function filterSelectionToExisting(
  document: BroadsetDocument,
  elementIds: readonly string[],
): readonly string[] {
  const existingIds = new Set(document.elements.map((element) => element.id));

  return elementIds.filter((elementId) => existingIds.has(elementId));
}

export function createInteractionState(
  activeElementIds: readonly string[],
  pendingPlacementType: string | null,
  pathEditingElementId: string | null,
  pathDrawingElementId: string | null,
  inlineTextEditingElementId: string | null = null,
  clipPathEditingElementId: string | null = null,
  motionPathEditingElementId: string | null = null,
): Pick<
  EditorState,
  | 'activeElementIds'
  | 'pendingPlacementType'
  | 'pathEditingElementId'
  | 'pathDrawingElementId'
  | 'clipPathEditingElementId'
  | 'motionPathEditingElementId'
  | 'inlineTextEditingElementId'
  | 'editingMode'
> {
  return {
    activeElementIds,
    pendingPlacementType,
    pathEditingElementId,
    pathDrawingElementId,
    clipPathEditingElementId,
    motionPathEditingElementId,
    inlineTextEditingElementId,
    editingMode: createEditingMode(
      pendingPlacementType,
      pathEditingElementId,
      pathDrawingElementId,
      inlineTextEditingElementId,
      clipPathEditingElementId,
      motionPathEditingElementId,
    ),
  };
}

export function applySelectionSideEffects(
  state: Pick<
    EditorState,
    | 'pendingPlacementType'
    | 'pathEditingElementId'
    | 'pathDrawingElementId'
    | 'clipPathEditingElementId'
    | 'motionPathEditingElementId'
    | 'inlineTextEditingElementId'
  >,
  nextActiveElementIds: readonly string[],
): Pick<
  EditorState,
  | 'activeElementIds'
  | 'pendingPlacementType'
  | 'pathEditingElementId'
  | 'pathDrawingElementId'
  | 'clipPathEditingElementId'
  | 'motionPathEditingElementId'
  | 'inlineTextEditingElementId'
  | 'editingMode'
> {
  const nextPathEditingElementId =
    state.pathEditingElementId !== null && nextActiveElementIds.includes(state.pathEditingElementId) ?
      state.pathEditingElementId
    : null;
  const nextPathDrawingElementId =
    state.pathDrawingElementId !== null && nextActiveElementIds.includes(state.pathDrawingElementId) ?
      state.pathDrawingElementId
    : null;
  const nextClipPathEditingElementId =
    state.clipPathEditingElementId !== null && nextActiveElementIds.includes(state.clipPathEditingElementId) ?
      state.clipPathEditingElementId
    : null;
  const nextMotionPathEditingElementId =
    state.motionPathEditingElementId !== null && nextActiveElementIds.includes(state.motionPathEditingElementId) ?
      state.motionPathEditingElementId
    : null;
  const nextInlineTextEditingElementId =
    state.inlineTextEditingElementId !== null && nextActiveElementIds.includes(state.inlineTextEditingElementId) ?
      state.inlineTextEditingElementId
    : null;
  const nextPendingPlacementType = nextActiveElementIds.length === 0 ? state.pendingPlacementType : null;

  return createInteractionState(
    nextActiveElementIds,
    nextPendingPlacementType,
    nextPathEditingElementId,
    nextPathDrawingElementId,
    nextInlineTextEditingElementId,
    nextClipPathEditingElementId,
    nextMotionPathEditingElementId,
  );
}
