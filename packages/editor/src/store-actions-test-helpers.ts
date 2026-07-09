import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createEmptyBroadsetDocument,
  type ElementOverrides,
} from '@broadset/model';

import { createEditorStore } from './store-actions';

type ElementFactoryOverrides = ElementOverrides & {
  readonly type?: string;
};

export function makeElement(overrides: ElementFactoryOverrides = {}): BroadsetElement {
  return createDefaultElement(overrides.type ?? 'rectangle', overrides);
}

export function makeDocument(
  elements: readonly BroadsetElement[],
  mode: 'screen' | 'print' = 'screen',
): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    documentMode: mode,
    elements,
  };
}

export function storeWithElements(...elements: readonly BroadsetElement[]) {
  const store = createEditorStore();

  store.getState().setDocument(makeDocument(elements));

  return store;
}

export function getElements(store: ReturnType<typeof createEditorStore>): readonly BroadsetElement[] {
  return store.getState().document.elements;
}

export function findElement(
  store: ReturnType<typeof createEditorStore>,
  elementId: string,
): BroadsetElement | undefined {
  return getElements(store).find((element) => element.id === elementId);
}
