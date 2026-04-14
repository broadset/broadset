import type { BroadsetDocument, BroadsetElement, BroadsetElementStyle, Canvas } from '@broadset/model';

export function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 210,
    height: 118,
    unit: 'mm',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
    ...overrides,
  };
}

export function makeStyle(overrides: Partial<BroadsetElementStyle> = {}): Partial<BroadsetElementStyle> {
  return { opacity: 1, ...overrides };
}

export function makeElement(type: BroadsetElement['type'], overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id: `el-${Math.random().toString(36).slice(2, 8)}`,
    type,
    name: type,
    locked: false,
    visible: true,
    position: { x: 10, y: 10 },
    width: 100,
    height: 50,
    rotation: 0,
    style: makeStyle() as BroadsetElementStyle,
    content: '',
    ...overrides,
  } as BroadsetElement;
}

export function makeDocument(overrides: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return {
    id: 'doc-1',
    name: 'Test Doc',
    canvas: makeCanvas(),
    elements: [],
    pages: [{ id: 'page-1', name: 'Page 1', overrides: [] }],
    animations: [],
    ...overrides,
  } as BroadsetDocument;
}
