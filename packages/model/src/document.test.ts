import { describe, expect, it } from '@jest/globals';

import {
  broadsetDocumentSchema,
  createDefaultAnimationConfig,
  createDefaultElement,
  createEmptyBroadsetDocument,
} from './index';

/** @description Helper to build a minimal valid current-format document for mutation tests. */
function makeValidDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = createEmptyBroadsetDocument();

  return {
    id: base.id,
    name: base.name,
    documentMode: base.documentMode,
    canvas: { ...base.canvas },
    elements: [...base.elements],
    animations: [...base.animations],
    pages: base.pages.map((page) => ({ ...page, overrides: [...page.overrides] })),
    dataSchema: { ...base.dataSchema, fields: [...base.dataSchema.fields] },
    ...overrides,
  };
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

  /** @description Runtime attempts to mutate documentMode after creation must be rejected to preserve document invariants. */
  it('rejects runtime mutation of documentMode after creation', () => {
    const document = createEmptyBroadsetDocument();
    const mutableDocument: { documentMode: 'print' | 'screen' } = document;

    expect(() => {
      mutableDocument.documentMode = 'print';
    }).toThrow(TypeError);
    expect(document.documentMode).toBe('screen');
  });
});

/** @description Canvas dimensions and padding must stay finite, positive, and structurally valid. */
describe('Canvas validation', () => {
  /** @description Positive screen-like canvas dimensions must validate. */
  it('accepts positive dimensions', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        canvas: { width: 508, height: 285.75, unit: 'mm', dpi: 96, padding: [0, 0, 0, 0] },
      }),
    );

    expect(result.success).toBe(true);
  });

  /** @description Zero, negative, and NaN dimensions must all fail validation. */
  it('rejects invalid dimensions', () => {
    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          canvas: { width: 0, height: 285.75, unit: 'mm', dpi: 96, padding: [0, 0, 0, 0] },
        }),
      ).success,
    ).toBe(false);

    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          canvas: { width: 508, height: -10, unit: 'mm', dpi: 96, padding: [0, 0, 0, 0] },
        }),
      ).success,
    ).toBe(false);

    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          canvas: { width: Number.NaN, height: 285.75, unit: 'mm', dpi: 96, padding: [0, 0, 0, 0] },
        }),
      ).success,
    ).toBe(false);
  });

  /** @description Padding must be a non-negative four-tuple. */
  it('accepts valid padding and rejects malformed padding', () => {
    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          canvas: { width: 508, height: 285.75, unit: 'mm', dpi: 96, padding: [10, 10, 10, 10] },
        }),
      ).success,
    ).toBe(true);

    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          canvas: { width: 508, height: 285.75, unit: 'mm', dpi: 96, padding: [10, 10] },
        }),
      ).success,
    ).toBe(false);

    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          canvas: { width: 508, height: 285.75, unit: 'mm', dpi: 96, padding: [10, -5, 10, 10] },
        }),
      ).success,
    ).toBe(false);
  });
});

/** @description Documents must always contain at least one page and keep elements on the document itself. */
describe('Page and element structure', () => {
  /** @description New documents start with one default page and an empty document-level element array. */
  it('requires at least one page', () => {
    const doc = createEmptyBroadsetDocument();

    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]?.overrides).toEqual([]);
    expect(doc.elements).toEqual([]);
    expect(broadsetDocumentSchema.safeParse(makeValidDoc({ pages: [] })).success).toBe(false);
  });

  /** @description Parent/child relationships must live in the flat document element array via parentId references. */
  it('accepts a flat document-level element tree with parent-child references', () => {
    const doc = makeValidDoc({
      elements: [
        createDefaultElement('group', { id: 'parent' }),
        createDefaultElement('text', { id: 'child', parentId: 'parent', content: 'hello' }),
      ],
    });
    const result = broadsetDocumentSchema.safeParse(doc);

    expect(result.success).toBe(true);
  });
});

/** @description Element ids, geometry, and page override references must remain internally consistent. */
describe('Element integrity rules', () => {
  /** @description Duplicate ids in the document-level element array must be rejected. */
  it('rejects duplicate element IDs in the document', () => {
    const element = createDefaultElement('rectangle', { id: 'a' });
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        elements: [element, element],
      }),
    );

    expect(result.success).toBe(false);
  });

  /** @description Zero-width elements must be rejected because they are geometrically degenerate. */
  it('rejects elements with zero width', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        elements: [createDefaultElement('rectangle', { id: 'e1', width: 0 })],
      }),
    );

    expect(result.success).toBe(false);
  });

  /** @description Parent references must be acyclic and stay within the same document element set. */
  it('rejects circular and missing parentId references', () => {
    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          elements: [
            createDefaultElement('rectangle', { id: 'a', parentId: 'b' }),
            createDefaultElement('rectangle', { id: 'b', parentId: 'a' }),
          ],
        }),
      ).success,
    ).toBe(false);

    expect(
      broadsetDocumentSchema.safeParse(
        makeValidDoc({
          elements: [createDefaultElement('rectangle', { id: 'a', parentId: 'missing-parent' })],
        }),
      ).success,
    ).toBe(false);
  });

  /** @description Page overrides must reference existing document-level elements. */
  it('rejects page overrides for missing elements', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        elements: [createDefaultElement('text', { id: 'title' })],
        pages: [
          {
            id: 'page-1',
            name: 'Default',
            overrides: [{ elementId: 'subtitle', content: 'Hidden' }],
            locale: null,
            extensions: {},
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });
});

/** @description The document model intentionally avoids hard-coded page limits. */
describe('No hard page or element limits', () => {
  /** @description Large but structurally simple documents must still validate. */
  it('accepts a document with 200 pages', () => {
    const pages = Array.from({ length: 200 }, (_, index) => ({
      id: `p${String(index)}`,
      name: `Page ${String(index + 1)}`,
      overrides: [],
      locale: null,
      extensions: {},
    }));
    const result = broadsetDocumentSchema.safeParse(makeValidDoc({ pages }));

    expect(result.success).toBe(true);
  });
});

/** @description Animation definitions are stored as a flat document-level array keyed by elementId. */
describe('Document animations integrity', () => {
  /** @description Duplicate animation entries for the same element must be rejected. */
  it('rejects duplicate elementId in animations', () => {
    const entry = {
      elementId: 'e1',
      config: createDefaultAnimationConfig(),
    };
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        animations: [entry, entry],
      }),
    );

    expect(result.success).toBe(false);
  });
});
