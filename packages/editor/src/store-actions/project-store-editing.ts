import type { projectFormatV1 } from '@broadset/model';
import type { StoreApi } from 'zustand/vanilla';

import type { PlacementPoint, PlacementState } from '../editing-state';
import type { ProjectEditorState } from './project-store';

type ProjectEditorEditingActions = Pick<
  ProjectEditorState,
  | 'beginPlacement'
  | 'cancelPlacement'
  | 'enterClipPathEditing'
  | 'enterPathEditing'
  | 'finishPathDrawing'
  | 'startPathDrawing'
  | 'updatePlacement'
>;

function hasElement(state: ProjectEditorState, elementId: projectFormatV1.Id): boolean {
  const document = state.project.documents.find((candidate) => candidate.id === state.activeDocumentId);

  return document?.elements.some((candidate) => candidate.id === elementId) ?? false;
}

export function createProjectEditorEditingActions(
  set: StoreApi<ProjectEditorState>['setState'],
): ProjectEditorEditingActions {
  return {
    beginPlacement(elementType: string): void {
      const placement: PlacementState = { type: 'placement-anchor', elementType };

      set({
        placement,
        placementPreview: null,
        pathEditingElementId: null,
        pathDrawingElementId: null,
        clipPathEditingElementId: null,
        motionPathEditingElementId: null,
        inlineTextEditingElementId: null,
        editingMode: placement,
      });
    },
    updatePlacement(placement: PlacementState, preview: PlacementPoint | null = null): void {
      set({ placement, placementPreview: preview, editingMode: placement });
    },
    cancelPlacement(): void {
      set({
        placement: null,
        placementPreview: null,
        pathEditingElementId: null,
        pathDrawingElementId: null,
        clipPathEditingElementId: null,
        motionPathEditingElementId: null,
        inlineTextEditingElementId: null,
        editingMode: { type: 'none' },
      });
    },
    enterPathEditing(elementId: projectFormatV1.Id): void {
      set((state) =>
        hasElement(state, elementId) ?
          {
            activeElementIds: [elementId],
            pathEditingElementId: elementId,
            pathDrawingElementId: null,
            clipPathEditingElementId: null,
            motionPathEditingElementId: null,
            inlineTextEditingElementId: null,
            editingMode: { type: 'path-editing', elementId },
          }
        : {},
      );
    },
    enterClipPathEditing(elementId: projectFormatV1.Id): void {
      set((state) =>
        hasElement(state, elementId) ?
          {
            activeElementIds: [elementId],
            pathEditingElementId: null,
            pathDrawingElementId: null,
            clipPathEditingElementId: elementId,
            motionPathEditingElementId: null,
            inlineTextEditingElementId: null,
            editingMode: { type: 'clip-path-editing', elementId },
          }
        : {},
      );
    },
    startPathDrawing(elementId: projectFormatV1.Id): void {
      set({
        activeElementIds: [elementId],
        placement: null,
        placementPreview: null,
        pathEditingElementId: null,
        pathDrawingElementId: elementId,
        clipPathEditingElementId: null,
        motionPathEditingElementId: null,
        inlineTextEditingElementId: null,
        editingMode: { type: 'path-drawing', elementId },
      });
    },
    finishPathDrawing(): void {
      set({
        placement: null,
        placementPreview: null,
        pathEditingElementId: null,
        pathDrawingElementId: null,
        clipPathEditingElementId: null,
        motionPathEditingElementId: null,
        inlineTextEditingElementId: null,
        editingMode: { type: 'none' },
      });
    },
  };
}
