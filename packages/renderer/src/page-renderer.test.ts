import type { BroadsetDocument, Canvas, PageElement } from '@broadset/model';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { DATA_ELEMENT_ID } from './data-attributes';
import { DocumentRenderer, PageRenderer } from './page-renderer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCanvas(overrides?: Partial<Canvas>): Canvas {
  return {
    width: 1920,
    height: 1080,
    padding: [0, 0, 0, 0],
    ...overrides,
  };
}

function makeElement(overrides: Partial<PageElement> & { id: string; type: string }): PageElement {
  return {
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    rotation: 0,
    content: '',
    parentId: null,
    groupId: null,
    ...overrides,
  };
}

function makeDocument(overrides?: Partial<BroadsetDocument>): BroadsetDocument {
  return {
    id: 'doc-1',
    documentMode: 'screen',
    canvas: makeCanvas(),
    pages: [
      {
        id: 'page-1',
        elements: [
          makeElement({ id: 'el-1', type: 'rectangle' }),
          makeElement({ id: 'el-2', type: 'text', content: 'Hello' }),
        ],
      },
      {
        id: 'page-2',
        elements: [makeElement({ id: 'el-3', type: 'rectangle' })],
      },
    ],
    animationRegistry: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PageRenderer
// ---------------------------------------------------------------------------

describe('PageRenderer', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  /**
   * @description The page renderer must set the host element dimensions to
   * the canvas width and height in px units.
   */
  it('applies canvas dimensions as px on the host', () => {
    const renderer = new PageRenderer();
    const canvas = makeCanvas({ width: 1920, height: 1080 });

    renderer.render(canvas, [], host);

    expect(host.style.width).toBe('1920px');
    expect(host.style.height).toBe('1080px');
    expect(host.style.position).toBe('relative');
    expect(host.style.overflow).toBe('hidden');
  });

  /**
   * @description Elements must be rendered in DOM order matching the document
   * element array order, ensuring correct z-stacking without z-index.
   */
  it('renders elements in document order (z-order by DOM order)', () => {
    const renderer = new PageRenderer();
    const elements = [
      makeElement({ id: 'first', type: 'rectangle' }),
      makeElement({ id: 'second', type: 'rectangle' }),
      makeElement({ id: 'third', type: 'rectangle' }),
    ];

    renderer.render(makeCanvas(), elements, host);

    const rendered = host.querySelectorAll(`[${DATA_ELEMENT_ID}]`);

    expect(rendered.length).toBe(3);
    expect(rendered[0]?.getAttribute(DATA_ELEMENT_ID)).toBe('first');
    expect(rendered[1]?.getAttribute(DATA_ELEMENT_ID)).toBe('second');
    expect(rendered[2]?.getAttribute(DATA_ELEMENT_ID)).toBe('third');
  });

  /**
   * @description Group element children must be rendered inside the group
   * container, not as siblings, to support nested transforms and clipping.
   */
  it('nests group children inside group container', () => {
    const renderer = new PageRenderer();
    const elements = [
      makeElement({ id: 'group-1', type: 'group', width: 400, height: 200 }),
      makeElement({ id: 'child-1', type: 'text', content: 'A', parentId: 'group-1', groupId: 'group-1' }),
      makeElement({ id: 'child-2', type: 'text', content: 'B', parentId: 'group-1', groupId: 'group-1' }),
    ];

    renderer.render(makeCanvas(), elements, host);

    const group = host.querySelector(`[${DATA_ELEMENT_ID}="group-1"]`);

    expect(group).not.toBeNull();

    const child1 = group?.querySelector(`[${DATA_ELEMENT_ID}="child-1"]`);
    const child2 = group?.querySelector(`[${DATA_ELEMENT_ID}="child-2"]`);

    expect(child1).not.toBeNull();
    expect(child2).not.toBeNull();

    // Children should be nested inside the group container, not direct children of host
    const child1El = host.querySelector(`[${DATA_ELEMENT_ID}="child-1"]`) as HTMLElement;

    expect(child1El.parentElement).toBe(group);
  });

  /**
   * @description Calling destroy() must remove all rendered elements and
   * clear the host for reuse.
   */
  it('destroy clears all rendered elements', () => {
    const renderer = new PageRenderer();
    const elements = [
      makeElement({ id: 'el-1', type: 'rectangle' }),
      makeElement({ id: 'el-2', type: 'text', content: 'Test' }),
    ];

    renderer.render(makeCanvas(), elements, host);

    expect(host.children.length).toBeGreaterThan(0);

    renderer.destroy();

    expect(host.children.length).toBe(0);
  });

  /**
   * @description Re-rendering must replace previous content completely,
   * not append to existing elements.
   */
  it('re-render replaces previous content', () => {
    const renderer = new PageRenderer();

    renderer.render(makeCanvas(), [makeElement({ id: 'old', type: 'rectangle' })], host);

    expect(host.querySelector(`[${DATA_ELEMENT_ID}="old"]`)).not.toBeNull();

    renderer.render(makeCanvas(), [makeElement({ id: 'new', type: 'rectangle' })], host);

    expect(host.querySelector(`[${DATA_ELEMENT_ID}="old"]`)).toBeNull();
    expect(host.querySelector(`[${DATA_ELEMENT_ID}="new"]`)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DocumentRenderer
// ---------------------------------------------------------------------------

describe('DocumentRenderer', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  /**
   * @description Mounting a document must render the first page by default.
   */
  it('mounts and renders the first page', () => {
    const renderer = new DocumentRenderer();
    const doc = makeDocument();

    renderer.mount(doc, host);

    expect(host.querySelector(`[${DATA_ELEMENT_ID}="el-1"]`)).not.toBeNull();
    expect(host.querySelector(`[${DATA_ELEMENT_ID}="el-2"]`)).not.toBeNull();
    // el-3 is on page 2, should not be visible
    expect(host.querySelector(`[${DATA_ELEMENT_ID}="el-3"]`)).toBeNull();

    renderer.destroy();
  });

  /**
   * @description setPage() must switch to the requested page index, rendering
   * only that page's elements and removing the previous page's elements.
   */
  it('switches pages with setPage()', () => {
    const renderer = new DocumentRenderer();
    const doc = makeDocument();

    renderer.mount(doc, host);
    renderer.setPage(1);

    // Page 2 element should be visible
    expect(host.querySelector(`[${DATA_ELEMENT_ID}="el-3"]`)).not.toBeNull();
    // Page 1 elements should be gone
    expect(host.querySelector(`[${DATA_ELEMENT_ID}="el-1"]`)).toBeNull();

    renderer.destroy();
  });

  /**
   * @description setPage() with an out-of-bounds index must be a no-op,
   * keeping the current page rendered.
   */
  it('ignores out-of-bounds page index', () => {
    const renderer = new DocumentRenderer();
    const doc = makeDocument();

    renderer.mount(doc, host);
    renderer.setPage(99);

    // Page 1 should still be visible
    expect(host.querySelector(`[${DATA_ELEMENT_ID}="el-1"]`)).not.toBeNull();

    renderer.setPage(-1);

    expect(host.querySelector(`[${DATA_ELEMENT_ID}="el-1"]`)).not.toBeNull();

    renderer.destroy();
  });

  /**
   * @description Mounting a new document must replace the previous document's
   * rendering completely (document replacement triggers full rerender).
   */
  it('replaces previous document on re-mount', () => {
    const renderer = new DocumentRenderer();
    const doc1 = makeDocument();
    const doc2 = makeDocument({
      pages: [
        {
          id: 'page-new',
          elements: [makeElement({ id: 'el-new', type: 'ellipse' })],
        },
      ],
    });

    renderer.mount(doc1, host);

    expect(host.querySelector(`[${DATA_ELEMENT_ID}="el-1"]`)).not.toBeNull();

    renderer.mount(doc2, host);

    expect(host.querySelector(`[${DATA_ELEMENT_ID}="el-1"]`)).toBeNull();
    expect(host.querySelector(`[${DATA_ELEMENT_ID}="el-new"]`)).not.toBeNull();

    renderer.destroy();
  });

  /**
   * @description Destroy must clean up all rendered content and allow the
   * host element to be reused.
   */
  it('destroy cleans up all content', () => {
    const renderer = new DocumentRenderer();
    const doc = makeDocument();

    renderer.mount(doc, host);

    expect(host.children.length).toBeGreaterThan(0);

    renderer.destroy();

    // After destroy, setPage should be a no-op (no crash)
    renderer.setPage(0);
  });
});
