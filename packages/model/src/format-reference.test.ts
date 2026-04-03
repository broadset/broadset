import { describe, expect, it } from '@jest/globals';

import { fullDocumentSchema, COMMON_CANVAS_SIZES } from './format-reference';

/** @description Helper to build the minimal valid document from the spec example */
function minimalDoc(): Record<string, unknown> {
  return {
    id: 'minimal-template',
    documentMode: 'screen',
    canvas: { width: 508, height: 285.75, padding: [0, 0, 0, 0] },
    pages: [
      {
        id: 'page-1',
        elements: [
          {
            id: 'title',
            type: 'text',
            position: { x: 100, y: 120 },
            width: 300,
            height: 50,
            rotation: 0,
            content: 'Hello World',
            style: {
              opacity: 1,
              fontFamily: 'Arial',
              fontSize: 36,
              fontColor: '#ffffff',
              textAlignment: 'center',
            },
            screen: {
              name: 'Title',
              anchorX: 'left',
              anchorY: 'top',
              visibility: 'onscreen',
              activeState: null,
              modifiers: [],
              locked: false,
              maskType: 'none',
              rotateX: 0,
              rotateY: 0,
              rotateZ: 0,
              translateZ: 0,
              clipChildren: false,
              customClipPath: '',
            },
            parentId: null,
            groupId: null,
          },
        ],
      },
    ],
    animationRegistry: [],
  };
}

/** @description Common canvas sizes from the spec must all validate correctly */
describe('Common canvas sizes', () => {
  /** @description Full HD (1920×1080) → 508mm × 285.75mm validates */
  it('validates Full HD canvas size', () => {
    const doc = {
      ...minimalDoc(),
      canvas: { width: 508, height: 285.75, padding: [0, 0, 0, 0] },
    };

    expect(fullDocumentSchema.safeParse(doc).success).toBe(true);
  });

  /** @description 4K UHD (3840×2160) → 1016mm × 571.5mm validates */
  it('validates 4K UHD canvas size', () => {
    const doc = {
      ...minimalDoc(),
      canvas: { width: 1016, height: 571.5, padding: [0, 0, 0, 0] },
    };

    expect(fullDocumentSchema.safeParse(doc).success).toBe(true);
  });

  /** @description A4 portrait (210×297mm) validates */
  it('validates A4 portrait canvas size', () => {
    const doc = {
      ...minimalDoc(),
      canvas: { width: 210, height: 297, padding: [0, 0, 0, 0] },
    };

    expect(fullDocumentSchema.safeParse(doc).success).toBe(true);
  });

  /** @description COMMON_CANVAS_SIZES has entries for the documented sizes */
  it('includes documented canvas size presets', () => {
    expect(COMMON_CANVAS_SIZES.length).toBeGreaterThanOrEqual(4);

    const labels = COMMON_CANVAS_SIZES.map((s) => s.label);

    expect(labels).toContain('Full HD (1920×1080)');
    expect(labels).toContain('A4 Portrait');
  });
});

/** @description The minimal example from the spec format reference must be accepted */
describe('Complete minimal example', () => {
  /** @description Minimal doc with one text element validates */
  it('accepts the minimal spec example', () => {
    const result = fullDocumentSchema.safeParse(minimalDoc());

    expect(result.success).toBe(true);
  });
});

/** @description Invalid documents are rejected with structured errors */
describe('Structured error rejection', () => {
  /** @description Missing id is rejected */
  it('rejects document without id', () => {
    const doc = minimalDoc();

    delete doc['id'];

    const result = fullDocumentSchema.safeParse(doc);

    expect(result.success).toBe(false);
  });

  /** @description Invalid element style (opacity > 1) is rejected */
  it('rejects element with invalid opacity', () => {
    const doc = minimalDoc();
    const pages = doc['pages'] as Array<{ elements: Array<Record<string, unknown>> }>;

    pages[0]!.elements[0]!['style'] = { opacity: 2 };

    const result = fullDocumentSchema.safeParse(doc);

    expect(result.success).toBe(false);
  });

  /** @description Invalid screen property (bad anchorX) is rejected */
  it('rejects element with invalid screen anchorX', () => {
    const doc = minimalDoc();
    const pages = doc['pages'] as Array<{ elements: Array<Record<string, unknown>> }>;

    pages[0]!.elements[0]!['screen'] = {
      ...(pages[0]!.elements[0]!['screen'] as Record<string, unknown>),
      anchorX: 'middle',
    };

    const result = fullDocumentSchema.safeParse(doc);

    expect(result.success).toBe(false);
  });

  /** @description Negative element width is rejected */
  it('rejects element with negative width', () => {
    const doc = minimalDoc();
    const pages = doc['pages'] as Array<{ elements: Array<Record<string, unknown>> }>;

    pages[0]!.elements[0]!['width'] = -10;

    const result = fullDocumentSchema.safeParse(doc);

    expect(result.success).toBe(false);
  });

  /** @description Duplicate element IDs are rejected */
  it('rejects duplicate element IDs on a page', () => {
    const doc = minimalDoc();
    const pages = doc['pages'] as Array<{ elements: unknown[] }>;
    const el = pages[0]!.elements[0]!;

    pages[0]!.elements = [el, el];

    const result = fullDocumentSchema.safeParse(doc);

    expect(result.success).toBe(false);
  });

  /** @description Error result includes issue details */
  it('returns structured error with issue details', () => {
    const result = fullDocumentSchema.safeParse({});

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

/** @description Metadata is optional */
describe('Metadata support', () => {
  /** @description Document with metadata validates */
  it('accepts document with metadata', () => {
    const doc = {
      ...minimalDoc(),
      metadata: {
        name: 'My Template',
        createdAtIso: '2026-01-15T10:30:00Z',
        updatedAtIso: '2026-03-17T14:00:00Z',
      },
    };

    const result = fullDocumentSchema.safeParse(doc);

    expect(result.success).toBe(true);
  });

  /** @description Document without metadata validates */
  it('accepts document without metadata', () => {
    const result = fullDocumentSchema.safeParse(minimalDoc());

    expect(result.success).toBe(true);
  });
});
