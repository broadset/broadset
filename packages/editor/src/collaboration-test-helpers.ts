import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createEmptyBroadsetDocument,
} from '@broadset/model';

export function makeElement(
  overrides: Partial<
    Pick<BroadsetElement, 'id' | 'name' | 'position' | 'width' | 'height' | 'content' | 'locked' | 'rotation'>
  > & { readonly type?: string } = {},
): BroadsetElement {
  return createDefaultElement(overrides.type ?? 'rectangle', overrides);
}

export function makeDocument(
  elements: readonly BroadsetElement[],
  overrides: Partial<Pick<BroadsetDocument, 'pages' | 'canvas' | 'animations'>> = {},
): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    ...overrides,
    elements,
  };
}
