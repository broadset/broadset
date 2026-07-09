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

function makeDocument(elements: readonly BroadsetElement[]): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
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

export function makeScreenDoc(
  elements: readonly BroadsetElement[],
  canvasOverrides: Partial<{ width: number; height: number }> = {},
): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    documentMode: 'screen',
    canvas: { ...base.canvas, width: canvasOverrides.width ?? 1920, height: canvasOverrides.height ?? 1080 },
    elements,
  };
}

export function makePrintDoc(
  elements: readonly BroadsetElement[],
  canvasOverrides: Partial<{ width: number; height: number }> = {},
): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    documentMode: 'print',
    canvas: {
      ...base.canvas,
      width: canvasOverrides.width ?? 210,
      height: canvasOverrides.height ?? 297,
      unit: 'mm',
    },
    elements,
  };
}
