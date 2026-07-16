import type { projectFormatV1 } from '@broadset/model';

import type { ProjectEditorState } from './project-store';

export function selectActiveDocumentV1(
  state: ProjectEditorState,
): projectFormatV1.BroadsetDocumentV1 | undefined {
  return state.project.documents.find((document) => document.id === state.activeDocumentId);
}

export function selectActivePageV1(state: ProjectEditorState): projectFormatV1.PageDefinition | undefined {
  return selectActiveDocumentV1(state)?.pages.find((page) => page.id === state.activePageId);
}

export function selectElementByIdV1(
  state: ProjectEditorState,
  elementId: projectFormatV1.Id,
): projectFormatV1.Element | undefined {
  return selectActiveDocumentV1(state)?.elements.find((element) => element.id === elementId);
}

export function selectActiveElementsV1(state: ProjectEditorState): readonly projectFormatV1.Element[] {
  const document = selectActiveDocumentV1(state);

  if (document === undefined) return [];

  const elementsById = new Map(document.elements.map((element) => [element.id, element]));

  return state.activeElementIds
    .map((elementId) => elementsById.get(elementId))
    .filter((element) => element !== undefined);
}
