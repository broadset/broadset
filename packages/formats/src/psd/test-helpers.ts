import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetElementStyleInput,
  type Canvas,
  styleSchema,
} from '@broadset/model';

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 200,
    height: 100,
    unit: 'px',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
    ...overrides,
  };
}

export function makeStyle(overrides: Partial<BroadsetElementStyleInput> = {}): BroadsetElementStyle {
  return styleSchema.parse({ opacity: 1, ...overrides });
}

export function makeElement(type: BroadsetElement['type'], overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id: `el-${String(Math.random()).slice(2, 8)}`,
    type,
    name: type,
    locked: false,
    position: { x: 10, y: 10 },
    width: 100,
    height: 50,
    rotation: 0,
    style: makeStyle(),
    content: '',
    ...overrides,
  } as BroadsetElement;
}

export function makeDocument(overrides: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return {
    id: 'doc-1',
    name: 'Test Doc',
    documentMode: 'screen',
    canvas: makeCanvas(),
    elements: [],
    pages: [{ id: 'page-1', name: 'Page 1', elements: [], locale: null, extensions: {} }],
    animations: [],
    dataSchema: { fields: [] },
    ...overrides,
  };
}
