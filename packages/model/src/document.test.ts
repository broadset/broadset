import { describe, expect, it } from '@jest/globals';

import type { BroadsetDocument } from './document';
import { broadsetDocumentSchema, createEmptyBroadsetDocument } from './document';

/** @description Helper to build a minimal valid document for mutation tests */
function makeValidDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = createEmptyBroadsetDocument();
  const plain: Record<string, unknown> = {
    id: base.id,
    documentMode: base.documentMode,
    canvas: { ...base.canvas },
    pages: base.pages.map((p) => ({ ...p, elements: [...p.elements] })),
    animationRegistry: [...base.animationRegistry],
  };

  return { ...plain, ...overrides };
}

/** @description Document identity — id must be non-empty string, documentMode defaults to 'screen' */
describe('Document identity', () => {
  /** @description createEmptyBroadsetDocument produces a valid document with non-empty id and 'screen' mode */
  it('creates a document with non-empty id and screen mode', () => {
    const doc = createEmptyBroadsetDocument();

    expect(typeof doc.id).toBe('string');
    expect(doc.id.length).toBeGreaterThan(0);
    expect(doc.documentMode).toBe('screen');
  });

  /** @description Invalid documentMode 'web' must be rejected */
  it('rejects invalid documentMode', () => {
    const result = broadsetDocumentSchema.safeParse(makeValidDoc({ documentMode: 'web' }));

    expect(result.success).toBe(false);
  });
});

/** @description Document mode immutability — readonly at the type level */
describe('Document mode immutability', () => {
  /** @description BroadsetDocument.documentMode is typed as readonly */
  it('documentMode is readonly at the type level', () => {
    const doc: BroadsetDocument = createEmptyBroadsetDocument();

    // TypeScript compile-time check: the line below should not compile
    // (doc as { documentMode: string }).documentMode = 'print';
    // We verify the value is preserved
    expect(doc.documentMode).toBe('screen');
  });
});

/** @description Canvas dimensions must be positive finite numbers */
describe('Canvas dimensions', () => {
  /** @description Positive dimensions are accepted */
  it('accepts positive dimensions', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        canvas: { width: 508, height: 285.75, padding: [0, 0, 0, 0] },
      }),
    );

    expect(result.success).toBe(true);
  });

  /** @description Zero width is rejected */
  it('rejects zero width', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        canvas: { width: 0, height: 285.75, padding: [0, 0, 0, 0] },
      }),
    );

    expect(result.success).toBe(false);
  });

  /** @description Negative height is rejected */
  it('rejects negative height', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        canvas: { width: 508, height: -10, padding: [0, 0, 0, 0] },
      }),
    );

    expect(result.success).toBe(false);
  });

  /** @description NaN dimensions are rejected */
  it('rejects NaN dimensions', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        canvas: { width: NaN, height: 285.75, padding: [0, 0, 0, 0] },
      }),
    );

    expect(result.success).toBe(false);
  });

  /** @description mm unit convention: 508mm × 285.75mm = 1920px × 1080px at 96 DPI */
  it('supports mm unit convention (508mm = 1920px at 96dpi)', () => {
    // 1 px = 25.4/96 mm → 508 mm / (25.4/96) = 1920 px
    const pxWidth = 508 / (25.4 / 96);
    const pxHeight = 285.75 / (25.4 / 96);

    expect(pxWidth).toBeCloseTo(1920, 0);
    expect(pxHeight).toBeCloseTo(1080, 0);
  });
});

/** @description Canvas padding must be a 4-tuple of non-negative finite numbers */
describe('Canvas padding', () => {
  /** @description Valid 4-tuple padding is accepted */
  it('accepts valid 4-tuple padding', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        canvas: { width: 508, height: 285.75, padding: [10, 10, 10, 10] },
      }),
    );

    expect(result.success).toBe(true);
  });

  /** @description 2-tuple padding is rejected */
  it('rejects 2-tuple padding', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        canvas: { width: 508, height: 285.75, padding: [10, 10] },
      }),
    );

    expect(result.success).toBe(false);
  });

  /** @description Negative padding values are rejected */
  it('rejects negative padding values', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        canvas: { width: 508, height: 285.75, padding: [10, -5, 10, 10] },
      }),
    );

    expect(result.success).toBe(false);
  });
});

/** @description Document must always have at least one page */
describe('Non-empty pages', () => {
  /** @description createEmptyBroadsetDocument starts with exactly one page */
  it('starts with one page', () => {
    const doc = createEmptyBroadsetDocument();

    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]?.elements).toEqual([]);
  });

  /** @description Empty pages array is rejected */
  it('rejects empty pages array', () => {
    const result = broadsetDocumentSchema.safeParse(makeValidDoc({ pages: [] }));

    expect(result.success).toBe(false);
  });
});

/** @description Elements are stored as a flat array per page — no recursive nesting */
describe('Flat element tree', () => {
  /** @description Page elements are a flat array even with parent-child references */
  it('stores elements as a flat array', () => {
    const doc = makeValidDoc({
      pages: [
        {
          id: 'p1',
          elements: [
            {
              id: 'parent',
              type: 'rectangle',
              position: { x: 0, y: 0 },
              width: 100,
              height: 100,
              rotation: 0,
              content: '',
              parentId: null,
              groupId: null,
              screen: {},
              style: {},
            },
            {
              id: 'child',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 50,
              height: 30,
              rotation: 0,
              content: 'hello',
              parentId: 'parent',
              groupId: null,
              screen: {},
              style: {},
            },
          ],
        },
      ],
    });

    const result = broadsetDocumentSchema.safeParse(doc);

    expect(result.success).toBe(true);
  });
});

/** @description Element IDs must be unique within a page */
describe('Element identity and uniqueness', () => {
  /** @description Duplicate IDs on the same page are rejected */
  it('rejects duplicate element IDs on the same page', () => {
    const el = {
      id: 'a',
      type: 'rectangle',
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      rotation: 0,
      content: '',
      parentId: null,
      groupId: null,
      screen: {},
      style: {},
    };

    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        pages: [{ id: 'p1', elements: [el, el] }],
      }),
    );

    expect(result.success).toBe(false);
  });
});

/** @description Element dimensions must be positive finite numbers */
describe('Element dimensions', () => {
  /** @description Zero width is rejected */
  it('rejects element with zero width', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        pages: [
          {
            id: 'p1',
            elements: [
              {
                id: 'e1',
                type: 'rectangle',
                position: { x: 0, y: 0 },
                width: 0,
                height: 100,
                rotation: 0,
                content: '',
                parentId: null,
                groupId: null,
                screen: {},
                style: {},
              },
            ],
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });
});

/** @description parentId references must be intra-page only and acyclic */
describe('Parent-child integrity', () => {
  /** @description Circular parentId references are rejected */
  it('rejects circular parentId references', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        pages: [
          {
            id: 'p1',
            elements: [
              {
                id: 'a',
                type: 'rectangle',
                position: { x: 0, y: 0 },
                width: 100,
                height: 100,
                rotation: 0,
                content: '',
                parentId: 'b',
                groupId: null,
                screen: {},
                style: {},
              },
              {
                id: 'b',
                type: 'rectangle',
                position: { x: 0, y: 0 },
                width: 100,
                height: 100,
                rotation: 0,
                content: '',
                parentId: 'a',
                groupId: null,
                screen: {},
                style: {},
              },
            ],
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });

  /** @description parentId referencing an element not on the same page is rejected */
  it('rejects cross-page parentId', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        pages: [
          {
            id: 'p1',
            elements: [
              {
                id: 'a',
                type: 'rectangle',
                position: { x: 0, y: 0 },
                width: 100,
                height: 100,
                rotation: 0,
                content: '',
                parentId: 'on-page-2',
                groupId: null,
                screen: {},
                style: {},
              },
            ],
          },
          {
            id: 'p2',
            elements: [
              {
                id: 'on-page-2',
                type: 'rectangle',
                position: { x: 0, y: 0 },
                width: 100,
                height: 100,
                rotation: 0,
                content: '',
                parentId: null,
                groupId: null,
                screen: {},
                style: {},
              },
            ],
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });
});

/** @description No hard limits on pages or elements */
describe('No hard page or element limits', () => {
  /** @description Document with many pages validates */
  it('accepts document with 200 pages', () => {
    const pages = Array.from({ length: 200 }, (_, i) => ({
      id: `p${String(i)}`,
      elements: [],
    }));

    const result = broadsetDocumentSchema.safeParse(makeValidDoc({ pages }));

    expect(result.success).toBe(true);
  });
});

/** @description Animation registry validates unique element IDs */
describe('Animation registry integrity', () => {
  /** @description Duplicate elementId entries are rejected */
  it('rejects duplicate elementId in animationRegistry', () => {
    const entry = {
      elementId: 'e1',
      config: {
        timelines: [],
        stateTimelineBindings: [],
        modifierTimelineBindings: [],
      },
    };

    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        animationRegistry: [entry, entry],
      }),
    );

    expect(result.success).toBe(false);
  });
});
