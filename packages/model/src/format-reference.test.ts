import { describe, expect, it } from 'vitest';

import { broadsetProjectSchema, COMMON_CANVAS_SIZES, createDefaultElement, fullDocumentSchema } from './index';

type MinimalDocument = {
  id?: string;
  name: string;
  documentMode: 'screen';
  canvas: {
    width: number;
    height: number;
    unit: 'px' | 'mm' | 'in';
    dpi: number;
    padding: [number, number, number, number];
    backgroundMode: 'transparent' | 'solid';
  };
  elements: Array<ReturnType<typeof createDefaultElement>>;
  animations: [];
  pages: Array<{
    id: string;
    name: string;
    elements: Array<{
      elementId: string;
      transform: {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        scale: { x: number; y: number; z: number };
      };
      visible: boolean;
    }>;
    locale: null;
    extensions: Record<string, unknown>;
  }>;
  dataSchema: { fields: [] };
  extensions: Record<string, unknown>;
};

/** @description Helper to build a minimal valid current-format document from the spec example. */
function minimalDoc(): MinimalDocument {
  return {
    id: 'minimal-template',
    name: 'Minimal Template',
    documentMode: 'screen',
    canvas: {
      width: 1920,
      height: 1080,
      unit: 'px',
      dpi: 96,
      padding: [0, 0, 0, 0],
      backgroundMode: 'transparent',
    },
    elements: [
      createDefaultElement('text', {
        id: 'title',
        name: 'Title',
        position: { x: 100, y: 120 },
        width: 300,
        height: 50,
        content: 'Hello World',
        style: {
          opacity: 1,
          fontFamily: 'Arial',
          fontSize: 36,
          fontColor: '#ffffff',
          textAlignment: 'center',
        },
      }),
    ],
    animations: [],
    pages: [
      {
        id: 'page-1',
        name: 'Default',
        elements: [],
        locale: null,
        extensions: {},
      },
    ],
    dataSchema: { fields: [] },
    extensions: {},
  };
}

/** @description Helper to get the first document-level element for mutation tests. */
function getFirstElement(doc: MinimalDocument): ReturnType<typeof createDefaultElement> {
  const firstElement = doc.elements[0];

  if (firstElement === undefined) {
    throw new Error('Expected at least one element in the document');
  }

  return firstElement;
}

/** @description Helper to build a minimal valid project using the current format reference. */
function minimalProject() {
  return {
    schemaVersion: 1 as const,
    id: 'project-1',
    name: 'My Show',
    createdAt: '2026-04-05T12:00:00Z',
    updatedAt: '2026-04-05T12:00:00Z',
    settings: {
      fonts: [],
      palette: [],
      defaultDocumentMode: 'screen' as const,
    },
    assets: [],
    documents: [minimalDoc()],
  };
}

/** @description Common canvas sizes from the spec must all validate correctly. */
describe('Common canvas sizes', () => {
  /** @description The exported preset list must include the documented screen and print sizes. */
  it('includes documented canvas size presets', () => {
    expect(COMMON_CANVAS_SIZES.length).toBeGreaterThanOrEqual(4);

    const labels = COMMON_CANVAS_SIZES.map((size: (typeof COMMON_CANVAS_SIZES)[number]) => size.label);

    expect(labels).toContain('Full HD (1920×1080)');
    expect(labels).toContain('A4 Portrait');
  });

  /** @description Representative screen and print presets must validate when used in a current-format document. */
  it.each([
    ['Full HD (1920×1080)', { width: 1920, height: 1080, unit: 'px' as const, dpi: 96 }],
    ['4K UHD (3840×2160)', { width: 3840, height: 2160, unit: 'px' as const, dpi: 96 }],
    ['A4 Portrait', { width: 210, height: 297, unit: 'mm' as const, dpi: 300 }],
  ])('validates %s canvas size', (_label, canvas) => {
    const doc: MinimalDocument = {
      ...minimalDoc(),
      canvas: { ...minimalDoc().canvas, ...canvas },
    };

    expect(fullDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

/** @description The minimal examples from the format reference must be accepted in the current document and project shapes. */
describe('Complete minimal examples', () => {
  /** @description A minimal document with one text element validates. */
  it('accepts the minimal document example', () => {
    const result = fullDocumentSchema.safeParse(minimalDoc());

    expect(result.success).toBe(true);
  });

  /** @description A minimal project with one document validates against the project root schema. */
  it('accepts the minimal project example', () => {
    const result = broadsetProjectSchema.safeParse(minimalProject());

    expect(result.success).toBe(true);
  });
});

/** @description Invalid current-format documents and projects are rejected with structured errors. */
describe('Structured error rejection', () => {
  /** @description Missing id is rejected. */
  it('rejects document without id', () => {
    const doc = minimalDoc() as MinimalDocument & { id?: string };

    delete doc.id;

    const result = fullDocumentSchema.safeParse(doc);

    expect(result.success).toBe(false);
  });

  /** @description Invalid element style (opacity > 1) is rejected. */
  it('rejects element with invalid opacity', () => {
    const doc = minimalDoc();
    const element = getFirstElement(doc);

    const result = fullDocumentSchema.safeParse({
      ...doc,
      elements: [{ ...element, style: { opacity: 2 } }],
    });

    expect(result.success).toBe(false);
  });

  /** @description Invalid custom clip-path data is rejected by the full document schema. */
  it('rejects element with invalid customClipPath data', () => {
    const doc = minimalDoc();
    const element = getFirstElement(doc);

    const result = fullDocumentSchema.safeParse({
      ...doc,
      elements: [
        {
          ...element,
          style: {
            ...element.style,
            customClipPath: 'not a path',
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  /** @description Negative element width is rejected. */
  it('rejects element with negative width', () => {
    const doc = minimalDoc();
    const element = getFirstElement(doc);

    const result = fullDocumentSchema.safeParse({
      ...doc,
      elements: [{ ...element, width: -10 }],
    });

    expect(result.success).toBe(false);
  });

  /** @description Duplicate document-level element ids are rejected. */
  it('rejects duplicate element IDs in the document', () => {
    const doc = minimalDoc();
    const element = getFirstElement(doc);

    doc.elements = [element, element];

    const result = fullDocumentSchema.safeParse(doc);

    expect(result.success).toBe(false);
  });

  /** @description Invalid project timestamps are rejected at the project root. */
  it('rejects projects with malformed timestamps', () => {
    const project = {
      ...minimalProject(),
      createdAt: 'not-a-date',
    };
    const result = broadsetProjectSchema.safeParse(project);

    expect(result.success).toBe(false);
  });

  /** @description Error results must expose issue details for debugging and UI display. */
  it('returns structured error details', () => {
    const result = fullDocumentSchema.safeParse({});

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

/** @description Template group validation tests ensure referential integrity and uniqueness constraints. */
describe('Template group validation', () => {
  /** @description A valid template group with members referencing existing documents validates. */
  it('accepts valid template group with existing document references', () => {
    const project = {
      ...minimalProject(),
      templateGroups: [
        {
          groupId: 'tg-1',
          name: 'Scorebug',
          members: [{ documentId: 'minimal-template', role: '16:9' as const }],
        },
      ],
    };
    const result = broadsetProjectSchema.safeParse(project);

    expect(result.success).toBe(true);
  });

  /** @description A member referencing a non-existent document must cause validation to fail. */
  it('rejects member referencing non-existent document', () => {
    const project = {
      ...minimalProject(),
      templateGroups: [
        {
          groupId: 'tg-1',
          name: 'Scorebug',
          members: [{ documentId: 'doc-missing', role: '16:9' as const }],
        },
      ],
    };
    const result = broadsetProjectSchema.safeParse(project);

    expect(result.success).toBe(false);
  });

  /** @description Duplicate groupId values must cause validation to fail. */
  it('rejects duplicate groupId values', () => {
    const project = {
      ...minimalProject(),
      templateGroups: [
        {
          groupId: 'tg-dup',
          name: 'Group A',
          members: [{ documentId: 'minimal-template', role: '16:9' as const }],
        },
        {
          groupId: 'tg-dup',
          name: 'Group B',
          members: [{ documentId: 'minimal-template', role: '9:16' as const }],
        },
      ],
    };
    const result = broadsetProjectSchema.safeParse(project);

    expect(result.success).toBe(false);
  });

  /** @description An empty templateGroups array is valid. */
  it('accepts empty templateGroups array', () => {
    const project = {
      ...minimalProject(),
      templateGroups: [],
    };
    const result = broadsetProjectSchema.safeParse(project);

    expect(result.success).toBe(true);
  });

  /** @description A document appearing in multiple template groups is valid. */
  it('accepts document in multiple template groups', () => {
    const project = {
      ...minimalProject(),
      templateGroups: [
        {
          groupId: 'tg-1',
          name: 'Group A',
          members: [{ documentId: 'minimal-template', role: '16:9' as const }],
        },
        {
          groupId: 'tg-2',
          name: 'Group B',
          members: [{ documentId: 'minimal-template', role: '1:1' as const }],
        },
      ],
    };
    const result = broadsetProjectSchema.safeParse(project);

    expect(result.success).toBe(true);
  });

  /** @description A template group with custom role and label validates. */
  it('accepts template group with custom role', () => {
    const project = {
      ...minimalProject(),
      templateGroups: [
        {
          groupId: 'tg-1',
          name: 'Banner',
          members: [{ documentId: 'minimal-template', role: 'custom' as const, label: 'Ultra-wide Banner' }],
        },
      ],
    };
    const result = broadsetProjectSchema.safeParse(project);

    expect(result.success).toBe(true);
  });

  /** @description Template group data round-trips through schema serialization. */
  it('preserves template group data on round-trip', () => {
    const project = {
      ...minimalProject(),
      templateGroups: [
        {
          groupId: 'tg-1',
          name: 'Scorebug',
          members: [
            { documentId: 'minimal-template', role: '16:9' as const },
            { documentId: 'minimal-template', role: '9:16' as const, label: 'Social Vertical' },
          ],
        },
      ],
    };
    const result = broadsetProjectSchema.safeParse(project);

    expect(result.success).toBe(true);

    if (result.success) {
      const tg = result.data.templateGroups?.[0];

      expect(tg?.groupId).toBe('tg-1');
      expect(tg?.name).toBe('Scorebug');
      expect(tg?.members).toHaveLength(2);
      expect(tg?.members[1]?.label).toBe('Social Vertical');
    }
  });
});
