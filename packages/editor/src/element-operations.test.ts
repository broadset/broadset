import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createEmptyBroadsetDocument,
  type ElementOverrides,
} from '@broadset/model';
import { describe, expect, it } from 'vitest';

import {
  alignElements,
  type ClipboardResult,
  copyElements,
  cutElements,
  distributeElements,
  pasteElements,
} from './element-operations';
import { createEditorStore } from './store-actions';

type ElementFactoryOverrides = ElementOverrides & {
  readonly type?: string;
};

function makeElement(overrides: ElementFactoryOverrides = {}): BroadsetElement {
  return createDefaultElement(overrides.type ?? 'rectangle', overrides);
}

function makeDocument(elements: readonly BroadsetElement[]): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    elements,
  };
}

function storeWithElements(...elements: readonly BroadsetElement[]) {
  const store = createEditorStore();

  store.getState().setDocument(makeDocument(elements));

  return store;
}

function findElement(store: ReturnType<typeof createEditorStore>, elementId: string): BroadsetElement | undefined {
  return store.getState().document.elements.find((element) => element.id === elementId);
}

describe('alignElements', () => {
  /** @description Aligning left must set all selected elements' x to the minimum x among them. */
  it('aligns elements left to the leftmost edge', () => {
    const a = makeElement({ position: { x: 50, y: 10 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 100, y: 20 }, width: 30, height: 20 });
    const c = makeElement({ position: { x: 80, y: 30 }, width: 25, height: 20 });
    const store = storeWithElements(a, b, c);

    store.getState().setActiveElements([a.id, b.id, c.id]);
    alignElements(store, 'left');

    expect(findElement(store, a.id)?.position.x).toBe(50);
    expect(findElement(store, b.id)?.position.x).toBe(50);
    expect(findElement(store, c.id)?.position.x).toBe(50);
  });

  /** @description Aligning right must set all selected elements' right edge to the rightmost right edge. */
  it('aligns elements right to the rightmost edge', () => {
    const a = makeElement({ position: { x: 50, y: 10 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 100, y: 20 }, width: 30, height: 20 });
    const c = makeElement({ position: { x: 80, y: 30 }, width: 25, height: 20 });
    const store = storeWithElements(a, b, c);

    store.getState().setActiveElements([a.id, b.id, c.id]);
    alignElements(store, 'right');

    // rightmost right edge is 100 + 30 = 130
    expect(findElement(store, a.id)?.position.x).toBe(110); // 130 - 20
    expect(findElement(store, b.id)?.position.x).toBe(100); // 130 - 30
    expect(findElement(store, c.id)?.position.x).toBe(105); // 130 - 25
  });

  /** @description Aligning center-x must center all selected elements on the midpoint of the bounding box. */
  it('aligns elements center-x to the horizontal midpoint', () => {
    const a = makeElement({ position: { x: 0, y: 0 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 100, y: 0 }, width: 40, height: 20 });
    const store = storeWithElements(a, b);

    store.getState().setActiveElements([a.id, b.id]);
    alignElements(store, 'center-x');

    // bounding box left=0, right=140, center=70
    expect(findElement(store, a.id)?.position.x).toBe(60); // 70 - 20/2
    expect(findElement(store, b.id)?.position.x).toBe(50); // 70 - 40/2
  });

  /** @description Aligning top must set all selected elements' y to the minimum y. */
  it('aligns elements top to the topmost edge', () => {
    const a = makeElement({ position: { x: 0, y: 50 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 0, y: 10 }, width: 20, height: 30 });
    const store = storeWithElements(a, b);

    store.getState().setActiveElements([a.id, b.id]);
    alignElements(store, 'top');

    expect(findElement(store, a.id)?.position.y).toBe(10);
    expect(findElement(store, b.id)?.position.y).toBe(10);
  });

  /** @description Aligning bottom must set all selected elements' bottom edge to the bottommost bottom edge. */
  it('aligns elements bottom to the bottommost edge', () => {
    const a = makeElement({ position: { x: 0, y: 50 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 0, y: 10 }, width: 20, height: 30 });
    const store = storeWithElements(a, b);

    store.getState().setActiveElements([a.id, b.id]);
    alignElements(store, 'bottom');

    // bottommost = 50 + 20 = 70
    expect(findElement(store, a.id)?.position.y).toBe(50); // 70 - 20
    expect(findElement(store, b.id)?.position.y).toBe(40); // 70 - 30
  });

  /** @description Aligning center-y must center all selected elements on the vertical midpoint. */
  it('aligns elements center-y to the vertical midpoint', () => {
    const a = makeElement({ position: { x: 0, y: 0 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 0, y: 100 }, width: 20, height: 40 });
    const store = storeWithElements(a, b);

    store.getState().setActiveElements([a.id, b.id]);
    alignElements(store, 'center-y');

    // bounding box top=0, bottom=140, center=70
    expect(findElement(store, a.id)?.position.y).toBe(60); // 70 - 20/2
    expect(findElement(store, b.id)?.position.y).toBe(50); // 70 - 40/2
  });

  /** @description Alignment must be a no-op when fewer than 2 elements are selected. */
  it('is a no-op with fewer than 2 selected elements', () => {
    const a = makeElement({ position: { x: 50, y: 10 }, width: 20, height: 20 });
    const store = storeWithElements(a);

    store.getState().selectElement(a.id);
    alignElements(store, 'left');

    expect(findElement(store, a.id)?.position.x).toBe(50);
  });

  /** @description Alignment must only affect selected elements, not all elements. */
  it('only affects selected elements', () => {
    const a = makeElement({ position: { x: 50, y: 10 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 100, y: 20 }, width: 30, height: 20 });
    const c = makeElement({ position: { x: 200, y: 30 }, width: 25, height: 20 });
    const store = storeWithElements(a, b, c);

    store.getState().setActiveElements([a.id, b.id]);
    alignElements(store, 'left');

    expect(findElement(store, a.id)?.position.x).toBe(50);
    expect(findElement(store, b.id)?.position.x).toBe(50);
    expect(findElement(store, c.id)?.position.x).toBe(200); // unaffected
  });

  /** @description Alignment must be undoable as a single undo step. */
  it('is undoable', () => {
    const a = makeElement({ position: { x: 50, y: 10 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 100, y: 20 }, width: 30, height: 20 });
    const store = storeWithElements(a, b);

    store.getState().setActiveElements([a.id, b.id]);
    alignElements(store, 'left');

    expect(findElement(store, b.id)?.position.x).toBe(50);

    store.getState().undo();

    expect(findElement(store, a.id)?.position.x).toBe(50);
    expect(findElement(store, b.id)?.position.x).toBe(100);
  });
});

describe('distributeElements', () => {
  /** @description Horizontal distribution must space elements evenly between leftmost and rightmost elements' centers. */
  it('distributes elements evenly horizontally', () => {
    const a = makeElement({ position: { x: 0, y: 0 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 200, y: 0 }, width: 20, height: 20 });
    const c = makeElement({ position: { x: 50, y: 0 }, width: 20, height: 20 });
    const store = storeWithElements(a, b, c);

    store.getState().setActiveElements([a.id, b.id, c.id]);
    distributeElements(store, 'horizontal');

    // centers: a=10, b=210, c should be (10+210)/2=110 so position.x=100
    // Sort by center-x: a(10), c(60), b(210)
    // leftmost center=10, rightmost center=210, spacing=(210-10)/2=100
    // c center should be 10+100=110, so c.x=100
    expect(findElement(store, a.id)?.position.x).toBe(0);
    expect(findElement(store, c.id)?.position.x).toBe(100);
    expect(findElement(store, b.id)?.position.x).toBe(200);
  });

  /** @description Vertical distribution must space elements evenly between topmost and bottommost elements' centers. */
  it('distributes elements evenly vertically', () => {
    const a = makeElement({ position: { x: 0, y: 0 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 0, y: 200 }, width: 20, height: 20 });
    const c = makeElement({ position: { x: 0, y: 50 }, width: 20, height: 20 });
    const store = storeWithElements(a, b, c);

    store.getState().setActiveElements([a.id, b.id, c.id]);
    distributeElements(store, 'vertical');

    expect(findElement(store, a.id)?.position.y).toBe(0);
    expect(findElement(store, c.id)?.position.y).toBe(100);
    expect(findElement(store, b.id)?.position.y).toBe(200);
  });

  /** @description Distribution must be a no-op with fewer than 3 selected elements. */
  it('is a no-op with fewer than 3 selected elements', () => {
    const a = makeElement({ position: { x: 0, y: 0 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 100, y: 0 }, width: 20, height: 20 });
    const store = storeWithElements(a, b);

    store.getState().setActiveElements([a.id, b.id]);
    distributeElements(store, 'horizontal');

    expect(findElement(store, a.id)?.position.x).toBe(0);
    expect(findElement(store, b.id)?.position.x).toBe(100);
  });

  /** @description Distribution with 4 elements must evenly space the middle two. */
  it('distributes 4 elements evenly', () => {
    const a = makeElement({ position: { x: 0, y: 0 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 300, y: 0 }, width: 20, height: 20 });
    const c = makeElement({ position: { x: 50, y: 0 }, width: 20, height: 20 });
    const d = makeElement({ position: { x: 250, y: 0 }, width: 20, height: 20 });
    const store = storeWithElements(a, b, c, d);

    store.getState().setActiveElements([a.id, b.id, c.id, d.id]);
    distributeElements(store, 'horizontal');

    // centers: a=10, b=310, c=60, d=260
    // sorted by center: a(10), c(60), d(260), b(310)
    // spacing = (310-10)/3 = 100
    // c center = 10+100 = 110, c.x = 100
    // d center = 10+200 = 210, d.x = 200
    expect(findElement(store, a.id)?.position.x).toBe(0);
    expect(findElement(store, c.id)?.position.x).toBe(100);
    expect(findElement(store, d.id)?.position.x).toBe(200);
    expect(findElement(store, b.id)?.position.x).toBe(300);
  });

  /** @description Distribution must be undoable as a single undo step. */
  it('is undoable', () => {
    const a = makeElement({ position: { x: 0, y: 0 }, width: 20, height: 20 });
    const b = makeElement({ position: { x: 200, y: 0 }, width: 20, height: 20 });
    const c = makeElement({ position: { x: 50, y: 0 }, width: 20, height: 20 });
    const store = storeWithElements(a, b, c);

    store.getState().setActiveElements([a.id, b.id, c.id]);
    distributeElements(store, 'horizontal');

    expect(findElement(store, c.id)?.position.x).toBe(100);

    store.getState().undo();

    expect(findElement(store, c.id)?.position.x).toBe(50);
  });
});

describe('copyElements', () => {
  /** @description Copy must serialize selected elements and return the clipboard data. */
  it('serializes selected elements to clipboard result', () => {
    const a = makeElement({ type: 'text', content: 'Hello' });
    const b = makeElement({ type: 'rectangle' });
    const store = storeWithElements(a, b);

    store.getState().setActiveElements([a.id, b.id]);

    const result = copyElements(store);

    expect(result.elements).toHaveLength(2);
    expect(result.json).toContain('Hello');
    expect(result.json).toContain(a.id);
  });

  /** @description Copy with no selection must return empty clipboard data. */
  it('returns empty result when nothing is selected', () => {
    const store = createEditorStore();
    const result = copyElements(store);

    expect(result.elements).toHaveLength(0);
    expect(result.json).toBe('[]');
  });

  /** @description Copy must not modify the document. */
  it('does not modify the document', () => {
    const a = makeElement({ type: 'rectangle' });
    const store = storeWithElements(a);
    const docBefore = store.getState().document;

    store.getState().selectElement(a.id);
    copyElements(store);

    expect(store.getState().document).toBe(docBefore);
  });
});

describe('cutElements', () => {
  /** @description Cut must copy elements to clipboard and remove them from the document. */
  it('copies elements and removes them from the document', () => {
    const a = makeElement({ type: 'rectangle' });
    const b = makeElement({ type: 'text', content: 'Hello' });
    const store = storeWithElements(a, b);

    store.getState().setActiveElements([a.id, b.id]);

    const result = cutElements(store);

    expect(result.elements).toHaveLength(2);
    expect(store.getState().document.elements).toHaveLength(0);
  });

  /** @description Cut must be undoable — undo restores the deleted elements. */
  it('is undoable', () => {
    const a = makeElement({ type: 'rectangle' });
    const store = storeWithElements(a);

    store.getState().selectElement(a.id);
    cutElements(store);
    expect(store.getState().document.elements).toHaveLength(0);

    store.getState().undo();
    expect(store.getState().document.elements).toHaveLength(1);
  });

  /** @description Cut of multiple elements must be atomic — a single undo restores all elements. */
  it('is atomic for multiple elements — single undo restores all', () => {
    const a = makeElement({ type: 'rectangle' });
    const b = makeElement({ type: 'text', content: 'Hello' });
    const c = makeElement({ type: 'ellipse' });
    const store = storeWithElements(a, b, c);

    store.getState().setActiveElements([a.id, b.id, c.id]);
    cutElements(store);
    expect(store.getState().document.elements).toHaveLength(0);

    store.getState().undo();
    expect(store.getState().document.elements).toHaveLength(3);
  });

  /** @description Cut must respect required element protection. */
  it('does not cut required elements', () => {
    const a = makeElement({ type: 'rectangle' });
    const store = createEditorStore({ config: { requiredElements: [a.id] } });

    store.getState().setDocument(makeDocument([a]));
    store.getState().selectElement(a.id);

    const result = cutElements(store);

    expect(result.elements).toHaveLength(1); // still serialized
    expect(store.getState().document.elements).toHaveLength(1); // but not deleted
  });
});

describe('pasteElements', () => {
  /** @description Paste must deserialize elements with new unique IDs. */
  it('creates elements with new unique IDs', () => {
    const a = makeElement({ type: 'rectangle' });
    const store = storeWithElements(a);
    const clipboardData: ClipboardResult = {
      elements: [a],
      json: JSON.stringify([a]),
    };

    pasteElements(store, clipboardData, { x: 100, y: 100 });

    const elements = store.getState().document.elements;

    expect(elements).toHaveLength(2);

    const pastedElement = elements.find((element) => element.id !== a.id);

    expect(pastedElement).toBeDefined();
    expect(pastedElement?.type).toBe('rectangle');
  });

  /** @description Paste must place elements centered at the viewport center. */
  it('places pasted elements at the specified viewport center', () => {
    const a = makeElement({ type: 'rectangle', position: { x: 0, y: 0 }, width: 40, height: 20 });
    const store = createEditorStore();
    const clipboardData: ClipboardResult = {
      elements: [a],
      json: JSON.stringify([a]),
    };

    pasteElements(store, clipboardData, { x: 200, y: 150 });

    const elements = store.getState().document.elements;

    expect(elements).toHaveLength(1);
    // element should be centered at viewport center: 200 - 40/2 = 180, 150 - 20/2 = 140
    expect(elements[0]?.position.x).toBe(180);
    expect(elements[0]?.position.y).toBe(140);
  });

  /** @description Paste with multiple elements must maintain relative positioning. */
  it('preserves relative positioning between multiple elements', () => {
    const a = makeElement({ type: 'rectangle', position: { x: 10, y: 10 }, width: 20, height: 20 });
    const b = makeElement({ type: 'rectangle', position: { x: 50, y: 30 }, width: 20, height: 20 });
    const store = createEditorStore();
    const clipboardData: ClipboardResult = {
      elements: [a, b],
      json: JSON.stringify([a, b]),
    };

    pasteElements(store, clipboardData, { x: 200, y: 200 });

    const elements = store.getState().document.elements;

    expect(elements).toHaveLength(2);

    // Group bounding box: left=10, top=10, right=70, bottom=50 → center=(40,30)
    // Offset to viewport center (200,200): shift by (160, 170)
    // a: (10+160, 10+170) = (170, 180)
    // b: (50+160, 30+170) = (210, 200)
    expect(elements[0]?.position.x).toBe(170);
    expect(elements[0]?.position.y).toBe(180);
    expect(elements[1]?.position.x).toBe(210);
    expect(elements[1]?.position.y).toBe(200);
  });

  /** @description Paste must select the newly pasted elements. */
  it('selects the pasted elements', () => {
    const a = makeElement({ type: 'rectangle' });
    const store = createEditorStore();
    const clipboardData: ClipboardResult = {
      elements: [a],
      json: JSON.stringify([a]),
    };

    pasteElements(store, clipboardData, { x: 100, y: 100 });

    const state = store.getState();

    expect(state.activeElementIds).toHaveLength(1);
    expect(state.activeElementIds[0]).not.toBe(a.id); // new ID
  });

  /** @description Pasting plain text from clipboard must create a new text element. */
  it('creates a text element from plain text clipboard', () => {
    const store = createEditorStore();

    pasteElements(store, { elements: [], json: '[]', plainText: 'Hello World' }, { x: 100, y: 100 });

    const elements = store.getState().document.elements;

    expect(elements).toHaveLength(1);
    expect(elements[0]?.type).toBe('text');
    expect(elements[0]?.content).toBe('Hello World');
  });

  /** @description Pasting an image data URL must create a new image element. */
  it('creates an image element from image data URL clipboard', () => {
    const store = createEditorStore();
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

    pasteElements(store, { elements: [], json: '[]', plainText: dataUrl }, { x: 200, y: 150 });

    const elements = store.getState().document.elements;

    expect(elements).toHaveLength(1);
    expect(elements[0]?.type).toBe('image');
    expect(elements[0]?.content).toBe(dataUrl);
  });

  /** @description Paste must ignore empty clipboard data. */
  it('is a no-op with empty clipboard and no plain text', () => {
    const store = createEditorStore();

    pasteElements(store, { elements: [], json: '[]' }, { x: 100, y: 100 });

    expect(store.getState().document.elements).toHaveLength(0);
  });
});
