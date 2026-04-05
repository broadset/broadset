import { describe, expect, it } from '@jest/globals';

import { broadsetDocumentSchema, createEmptyBroadsetDocument } from './index';

/** @description Helper to build a minimal valid document for mutation tests. */
function makeValidDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = createEmptyBroadsetDocument();
  const plain = {
    id: base.id,
    documentMode: base.documentMode,
    canvas: { ...base.canvas },
    pages: base.pages.map((page) => ({ ...page, elements: [...(page.elements ?? [])] })),
    animationRegistry: [...(base.animationRegistry ?? [])],
  };

  return { ...plain, ...overrides };
}

/** @description Document identity requires a non-empty id and a valid document mode. */
describe('Document identity', () => {
  /** @description `createEmptyBroadsetDocument` must yield a valid screen-mode document with a non-empty id. */
  it('creates a document with non-empty id and screen mode', () => {
    const doc = createEmptyBroadsetDocument();

    expect(typeof doc.id).toBe('string');
    expect(doc.id.length).toBeGreaterThan(0);
    expect(doc.documentMode).toBe('screen');
  });

  /** @description Unsupported document modes must be rejected during validation. */
  it('rejects invalid documentMode', () => {
    const result = broadsetDocumentSchema.safeParse(makeValidDoc({ documentMode: 'web' }));

    expect(result.success).toBe(false);
  });
});

/** @description Canvas dimensions and padding must stay finite, positive, and structurally valid. */
describe('Canvas validation', () => {
  /** @description Positive screen-like canvas dimensions must validate. */
  it('accepts positive dimensions', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        canvas: { width: 508, height: 285.75, padding: [0, 0, 0, 0] },
      }),
    );

    expect(result.success).toBe(true);
  });

  /** @description Zero, negative, and NaN dimensions must all fail validation. */
  it('rejects invalid dimensions', () => {
    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          canvas: { width: 0, height: 285.75, padding: [0, 0, 0, 0] },
        }),
      ).success,
    ).toBe(false);

    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          canvas: { width: 508, height: -10, padding: [0, 0, 0, 0] },
        }),
      ).success,
    ).toBe(false);

    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          canvas: { width: Number.NaN, height: 285.75, padding: [0, 0, 0, 0] },
        }),
      ).success,
    ).toBe(false);
  });

  /** @description Padding must be a non-negative four-tuple. */
  it('accepts valid padding and rejects malformed padding', () => {
    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          canvas: { width: 508, height: 285.75, padding: [10, 10, 10, 10] },
        }),
      ).success,
    ).toBe(true);

    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          canvas: { width: 508, height: 285.75, padding: [10, 10] },
        }),
      ).success,
    ).toBe(false);

    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          canvas: { width: 508, height: 285.75, padding: [10, -5, 10, 10] },
        }),
      ).success,
    ).toBe(false);
  });

  /** @description The documented 508mm × 285.75mm canvas matches 1920 × 1080 at 96 DPI. */
  it('supports the documented millimetre-to-pixel convention', () => {
    const pxWidth = 508 / (25.4 / 96);
    const pxHeight = 285.75 / (25.4 / 96);

    expect(pxWidth).toBeCloseTo(1920, 0);
    expect(pxHeight).toBeCloseTo(1080, 0);
  });
});

/** @description Documents must always contain at least one page and use a flat per-page element list. */
describe('Page and element structure', () => {
  /** @description New documents start with one page and validation rejects an empty page list. */
  it('requires at least one page', () => {
    const doc = createEmptyBroadsetDocument();

    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]?.elements).toEqual([]);
    expect(broadsetDocumentSchema.safeParse(makeValidDoc({ pages: [] })).success).toBe(false);
  });

  /** @description Parent/child relationships still live inside a flat array of elements on the page. */
  it('accepts a flat element tree with parent-child references', () => {
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

/** @description Element ids, geometry, and parent references must remain internally consistent. */
describe('Element integrity rules', () => {
  /** @description Duplicate ids on the same page must be rejected. */
  it('rejects duplicate element IDs on the same page', () => {
    const element = {
      id: 'a',
      type: 'rectangle',
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      rotation: 0,
      content: '',
      parentId: null,
      groupId: null,
      style: {},
    };
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        pages: [{ id: 'p1', elements: [element, element] }],
      }),
    );

    expect(result.success).toBe(false);
  });

  /** @description Zero-width elements must be rejected because they are geometrically degenerate. */
  it('rejects elements with zero width', () => {
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
                style: {},
              },
            ],
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });

  /** @description Parent references must be acyclic and stay within the same page. */
  it('rejects circular and cross-page parentId references', () => {
    expect(
      broadsetDocumentSchema.safeParse(
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
                  style: {},
                },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);

    expect(
      broadsetDocumentSchema.safeParse(
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
                  style: {},
                },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });
});

/** @description The document model intentionally avoids hard-coded page limits. */
describe('No hard page or element limits', () => {
  /** @description Large but structurally simple documents must still validate. */
  it('accepts a document with 200 pages', () => {
    const pages = Array.from({ length: 200 }, (_, index) => ({
      id: `p${String(index)}`,
      elements: [],
    }));
    const result = broadsetDocumentSchema.safeParse(makeValidDoc({ pages }));

    expect(result.success).toBe(true);
  });
});

/** @description The legacy animation registry still requires unique element ids for deterministic lookup. */
describe('Animation registry integrity', () => {
  /** @description Duplicate animation entries for the same element must be rejected. */
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
