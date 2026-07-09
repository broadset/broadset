import { afterEach, describe, expect, it } from 'vitest';

import {
  BROADSET_FORMAT_IDS,
  broadsetDocumentSchema,
  broadsetFormatExtensionsBaseSchema,
  createDefaultAnimationConfig,
  createDefaultElement,
  createEmptyBroadsetDocument,
  registerExtensionsSchema,
  rgbColor,
  unregisterExtensionsSchema,
} from './index';

function makePageElementInstance(elementId: string): Record<string, unknown> {
  return {
    elementId,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
  };
}

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
    pages: base.pages.map((page) => ({ ...page, elements: [...page.elements] })),
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

  /** @description Canvas backgrounds may carry structured gradients for native importer/exporter round-trip. */
  it('accepts structured gradient canvas backgrounds', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        canvas: {
          width: 508,
          height: 285.75,
          unit: 'mm',
          dpi: 96,
          padding: [0, 0, 0, 0],
          backgroundMode: 'gradient',
          backgroundGradient: {
            type: 'linear',
            angle: 90,
            stops: [
              { color: rgbColor('#ff0000'), position: 0 },
              { color: rgbColor('#0000ff'), position: 100 },
            ],
          },
        },
      }),
    );

    expect(result.success).toBe(true);
    expect(result.data?.canvas.backgroundMode).toBe('gradient');
    expect(result.data?.canvas.backgroundGradient?.type).toBe('linear');
  });

  /** @description Gradient mode must carry a structured gradient so exporters do not silently drop the background. */
  it('rejects gradient canvas mode without a gradient payload', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        canvas: {
          width: 508,
          height: 285.75,
          unit: 'mm',
          dpi: 96,
          padding: [0, 0, 0, 0],
          backgroundMode: 'gradient',
        },
      }),
    );

    expect(result.success).toBe(false);
  });
});

/** @description Documents must always contain at least one page and keep elements on the document itself. */
describe('Page and element structure', () => {
  /** @description New documents start with one default page and an empty document-level element array. */
  it('requires at least one page', () => {
    const doc = createEmptyBroadsetDocument();

    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]?.elements).toEqual([]);
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

/** @description Element ids, geometry, and page element references must remain internally consistent. */
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

  /** @description Page element instances must reference existing root document elements. */
  it('rejects page instances for missing elements', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({
        elements: [createDefaultElement('text', { id: 'title' })],
        pages: [
          {
            id: 'page-1',
            name: 'Default',
            elements: [makePageElementInstance('subtitle')],
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
      elements: [],
      locale: null,
      extensions: {},
    }));
    const result = broadsetDocumentSchema.safeParse(makeValidDoc({ pages }));

    expect(result.success).toBe(true);
  });
});

/** @description Animation definitions are stored as a flat document-level array keyed by elementId. */
/**
 * @description Print prepress boxes (bleed, trim, safeArea) ride on the canvas
 * alongside the screen safeAreas field so a single document can target PDF
 * (BleedBox / TrimBox / MediaBox / CropBox) and broadcast (title-safe,
 * action-safe) simultaneously without either format's concept interfering with
 * the other.
 */
describe('Canvas prepress insets', () => {
  /** @description All three insets are optional — a canvas without any prepress still validates. */
  it('accepts a canvas with no prepress insets', () => {
    const doc = makeValidDoc();

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(true);
  });

  /** @description Every inset is a [top, right, bottom, left] tuple of non-negative numbers in the canvas-declared unit. */
  it('accepts valid bleed, trim, and safeArea tuples', () => {
    const base = createEmptyBroadsetDocument();
    const doc = makeValidDoc({
      canvas: {
        ...base.canvas,
        bleed: [3, 3, 3, 3],
        trim: [0, 0, 0, 0],
        safeArea: [5, 10, 5, 10],
      },
    });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(true);
  });

  /** @description Negative inset values must be rejected since a prepress box can never extend past the media box. */
  it('rejects negative bleed values', () => {
    const base = createEmptyBroadsetDocument();
    const doc = makeValidDoc({
      canvas: {
        ...base.canvas,
        bleed: [-1, 3, 3, 3],
      },
    });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(false);
  });

  /** @description A non-tuple shape for any prepress inset must be rejected. */
  it('rejects non-tuple prepress values', () => {
    const base = createEmptyBroadsetDocument();
    const doc = makeValidDoc({
      canvas: {
        ...base.canvas,
        trim: '3 3 3 3',
      },
    });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(false);
  });

  /** @description Prepress insets and the existing broadcast `safeAreas` field coexist on the same canvas. */
  it('accepts prepress insets alongside broadcast safeAreas', () => {
    const base = createEmptyBroadsetDocument();
    const doc = makeValidDoc({
      canvas: {
        ...base.canvas,
        bleed: [3, 3, 3, 3],
        safeAreas: {
          actionSafe: [3, 3, 3, 3],
          titleSafe: [5, 5, 5, 5],
        },
      },
    });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

/**
 * @description Page speaker notes ride on the `Page` entry so PPTX
 * `notesSlide*.xml` and PDF speaker-note annotations round-trip against a
 * single universal shape. PSD and SVG exporters ignore this field.
 */
describe('Page speaker notes', () => {
  /** @description `notes` is optional; an omitted value validates. */
  it('accepts a page without notes', () => {
    const doc = makeValidDoc();

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(true);
  });

  /** @description A string value validates and is preserved through parse. */
  it('accepts string speaker notes and preserves them', () => {
    const base = createEmptyBroadsetDocument();
    const doc = makeValidDoc({
      pages: base.pages.map((page) => ({ ...page, notes: 'Presenter reminder: slow down on this slide.' })),
    });
    const result = broadsetDocumentSchema.safeParse(doc);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.pages[0]?.notes).toBe('Presenter reminder: slow down on this slide.');
    }
  });

  /** @description Non-string notes must be rejected (TextBody support lands with the text-model unit; until then, string only). */
  it('rejects non-string notes values', () => {
    const base = createEmptyBroadsetDocument();
    const doc = makeValidDoc({
      pages: base.pages.map((page) => ({ ...page, notes: 123 })),
    });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(false);
  });
});

/**
 * @description `PageElementInstance` may carry per-page overrides for
 * `content`, `style`, and `assetId` in addition to `transform` + `visible`.
 * Per-page overrides let a single document-level element render with
 * page-specific copy / styling / asset references (PPTX page-override
 * materialization, SVG / PDF page-variant export, repeating-data renders).
 * All three fields are optional and absent values fall through to the
 * element-level value.
 */
describe('Page element instance overrides', () => {
  /** @description Building a Page with all three overrides round-trips through Zod parse with values preserved. */
  it('round-trips content + style + assetId overrides through Zod parse', () => {
    const element = createDefaultElement('text', { id: 'shared-element', content: 'base copy' });
    const doc = makeValidDoc({
      elements: [element],
      pages: [
        {
          id: 'page-1',
          name: 'Default',
          elements: [
            {
              elementId: 'shared-element',
              transform: {
                position: { x: 12, y: 34, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
              visible: true,
              content: 'page-1 copy',
              style: { fontSize: 24, opacity: 0.75 },
              assetId: 'asset-page-1',
            },
          ],
          locale: null,
          extensions: {},
        },
      ],
    });
    const result = broadsetDocumentSchema.safeParse(doc);

    expect(result.success).toBe(true);

    if (result.success) {
      const instance = result.data.pages[0]?.elements[0];

      expect(instance?.content).toBe('page-1 copy');
      expect(instance?.style).toEqual({ fontSize: 24, opacity: 0.75 });
      expect(instance?.assetId).toBe('asset-page-1');
    }
  });

  /** @description A `content`-only override leaves `style` and `assetId` undefined on the parsed instance. */
  it('accepts a content-only override and leaves the other override fields unset', () => {
    const element = createDefaultElement('text', { id: 'shared-element' });
    const doc = makeValidDoc({
      elements: [element],
      pages: [
        {
          id: 'page-1',
          name: 'Default',
          elements: [
            {
              ...makePageElementInstance('shared-element'),
              content: 'overridden copy',
            },
          ],
          locale: null,
          extensions: {},
        },
      ],
    });
    const result = broadsetDocumentSchema.safeParse(doc);

    expect(result.success).toBe(true);

    if (result.success) {
      const instance = result.data.pages[0]?.elements[0];

      expect(instance?.content).toBe('overridden copy');
      expect(instance?.style).toBeUndefined();
      expect(instance?.assetId).toBeUndefined();
    }
  });

  /** @description A `style`-only override leaves `content` and `assetId` undefined on the parsed instance. */
  it('accepts a style-only override and leaves the other override fields unset', () => {
    const element = createDefaultElement('rectangle', { id: 'shared-element' });
    const doc = makeValidDoc({
      elements: [element],
      pages: [
        {
          id: 'page-1',
          name: 'Default',
          elements: [
            {
              ...makePageElementInstance('shared-element'),
              style: { opacity: 0.5 },
            },
          ],
          locale: null,
          extensions: {},
        },
      ],
    });
    const result = broadsetDocumentSchema.safeParse(doc);

    expect(result.success).toBe(true);

    if (result.success) {
      const instance = result.data.pages[0]?.elements[0];

      expect(instance?.content).toBeUndefined();
      expect(instance?.style).toEqual({ opacity: 0.5 });
      expect(instance?.assetId).toBeUndefined();
    }
  });

  /** @description An `assetId`-only override leaves `content` and `style` undefined on the parsed instance. */
  it('accepts an assetId-only override and leaves the other override fields unset', () => {
    const element = createDefaultElement('image', { id: 'shared-element', content: 'https://example/img.png' });
    const doc = makeValidDoc({
      elements: [element],
      pages: [
        {
          id: 'page-1',
          name: 'Default',
          elements: [
            {
              ...makePageElementInstance('shared-element'),
              assetId: 'asset-variant-a',
            },
          ],
          locale: null,
          extensions: {},
        },
      ],
    });
    const result = broadsetDocumentSchema.safeParse(doc);

    expect(result.success).toBe(true);

    if (result.success) {
      const instance = result.data.pages[0]?.elements[0];

      expect(instance?.content).toBeUndefined();
      expect(instance?.style).toBeUndefined();
      expect(instance?.assetId).toBe('asset-variant-a');
    }
  });

  /** @description Empty `style` override (`{}`) is permitted — it merges to a no-op at the boundary. */
  it('accepts an empty style override object', () => {
    const element = createDefaultElement('rectangle', { id: 'shared-element' });
    const doc = makeValidDoc({
      elements: [element],
      pages: [
        {
          id: 'page-1',
          name: 'Default',
          elements: [{ ...makePageElementInstance('shared-element'), style: {} }],
          locale: null,
          extensions: {},
        },
      ],
    });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(true);
  });

  /** @description Omitting all override fields keeps the existing minimal `PageElementInstance` shape valid. */
  it('keeps the override fields absent on a baseline instance', () => {
    const element = createDefaultElement('rectangle', { id: 'shared-element' });
    const doc = makeValidDoc({
      elements: [element],
      pages: [
        {
          id: 'page-1',
          name: 'Default',
          elements: [makePageElementInstance('shared-element')],
          locale: null,
          extensions: {},
        },
      ],
    });
    const result = broadsetDocumentSchema.safeParse(doc);

    expect(result.success).toBe(true);

    if (result.success) {
      const instance = result.data.pages[0]?.elements[0];

      expect(instance?.content).toBeUndefined();
      expect(instance?.style).toBeUndefined();
      expect(instance?.assetId).toBeUndefined();
    }
  });

  /** @description An empty `assetId` string is rejected — the asset registry contract requires a non-empty id. */
  it('rejects an empty-string assetId override', () => {
    const element = createDefaultElement('image', { id: 'shared-element', content: 'https://example/img.png' });
    const doc = makeValidDoc({
      elements: [element],
      pages: [
        {
          id: 'page-1',
          name: 'Default',
          elements: [{ ...makePageElementInstance('shared-element'), assetId: '' }],
          locale: null,
          extensions: {},
        },
      ],
    });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(false);
  });
});

/**
 * @description Dublin Core metadata lets importers and exporters round-trip
 * title / author / subject / keywords / rights / producer across every
 * format — PDF XMP, PSD XMP, SVG `<metadata>`, PPTX `docProps/core.xml`.
 */
describe('Document metadata', () => {
  /** @description Metadata is optional; an omitted value validates. */
  it('accepts a document without metadata', () => {
    expect(broadsetDocumentSchema.safeParse(makeValidDoc()).success).toBe(true);
  });

  /** @description Every Dublin Core field accepts a string; `keywords` is an array of strings. */
  it('accepts a fully populated metadata block', () => {
    const doc = makeValidDoc({
      metadata: {
        title: 'Quarterly Report',
        author: 'Jane Doe',
        subject: 'Q4 results',
        keywords: ['finance', 'Q4', '2026'],
        rights: '© 2026 Acme Corp',
        producer: 'Broadset',
      },
    });
    const result = broadsetDocumentSchema.safeParse(doc);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.metadata?.title).toBe('Quarterly Report');
      expect(result.data.metadata?.keywords).toEqual(['finance', 'Q4', '2026']);
    }
  });

  /** @description `keywords` must be an array of strings, not a comma-separated string, so importers / exporters can round-trip lossless. */
  it('rejects a non-array keywords value', () => {
    const doc = makeValidDoc({
      metadata: { keywords: 'finance, Q4' },
    });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(false);
  });

  /** @description Empty metadata object is accepted — every field is individually optional. */
  it('accepts an empty metadata object', () => {
    const doc = makeValidDoc({ metadata: {} });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

/**
 * @description Output intent carries a document-level ICC profile reference
 * plus target color space — fed to PDF `/OutputIntent`, PSD's embedded ICC
 * on CMYK/Lab documents, and any other format that needs a canonical
 * document color space. The `iccProfileAssetId` references an asset added
 * in Phase 4; for now the validator accepts any non-empty string.
 */
describe('Document output intent', () => {
  /** @description Output intent is optional; omitted → no constraint. */
  it('accepts a document without outputIntent', () => {
    expect(broadsetDocumentSchema.safeParse(makeValidDoc()).success).toBe(true);
  });

  /** @description All four supported color spaces validate. */
  it.each(['rgb', 'cmyk', 'gray', 'lab'])('accepts colorSpace %s', (colorSpace) => {
    const doc = makeValidDoc({
      outputIntent: { iccProfileAssetId: 'asset-1', colorSpace },
    });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(true);
  });

  /** @description The optional `identifier` (e.g. `"sRGB IEC61966-2.1"`) is preserved. */
  it('preserves the identifier string', () => {
    const doc = makeValidDoc({
      outputIntent: {
        iccProfileAssetId: 'asset-srgb-2014',
        colorSpace: 'rgb',
        identifier: 'sRGB IEC61966-2.1',
      },
    });
    const result = broadsetDocumentSchema.safeParse(doc);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.outputIntent?.identifier).toBe('sRGB IEC61966-2.1');
    }
  });

  /** @description `iccProfileAssetId` is required when outputIntent is set — omitting it fails validation. */
  it('rejects outputIntent without iccProfileAssetId', () => {
    const doc = makeValidDoc({
      outputIntent: { colorSpace: 'rgb' },
    });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(false);
  });

  /** @description An empty `iccProfileAssetId` string is not a valid reference — reject it as well. */
  it('rejects outputIntent with an empty iccProfileAssetId', () => {
    const doc = makeValidDoc({
      outputIntent: { iccProfileAssetId: '', colorSpace: 'rgb' },
    });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(false);
  });

  /** @description Unknown color spaces are rejected. */
  it('rejects unknown colorSpace values', () => {
    const doc = makeValidDoc({
      outputIntent: { iccProfileAssetId: 'asset-1', colorSpace: 'xyz' },
    });

    expect(broadsetDocumentSchema.safeParse(doc).success).toBe(false);
  });
});

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

/** @description Document parsing wires the extensions registry per IO-D-11 — registered schemas fail loudly on stale data. */
describe('Document extensions validation (IO-D-11)', () => {
  afterEach(() => {
    for (const id of BROADSET_FORMAT_IDS) {
      unregisterExtensionsSchema(id);
    }
  });

  /** @description A document with a registered extensions namespace + valid payload parses successfully. */
  it('accepts valid registered extensions', () => {
    registerExtensionsSchema(
      'pdf',
      broadsetFormatExtensionsBaseSchema,
    );

    const result = broadsetDocumentSchema.safeParse(makeValidDoc({ extensions: { pdf: { dirty: false } } }));

    expect(result.success).toBe(true);
  });

  /** @description A document whose registered extensions payload fails its schema is rejected with an extensions-rooted issue path that names the failing format id. */
  it('rejects a document whose registered extensions payload is invalid and reports the formatId in the path', () => {
    registerExtensionsSchema(
      'pdf',
      broadsetFormatExtensionsBaseSchema,
    );

    const result = broadsetDocumentSchema.safeParse(makeValidDoc({ extensions: { pdf: { dirty: 'not a boolean' } } }));

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'extensions' && issue.path[1] === 'pdf')).toBe(true);
    }
  });

  /** @description A document with an extensions namespace for which no schema is registered passes (forward-compat for deployments without that format package loaded). */
  it('accepts extensions namespaces without a registered schema', () => {
    const result = broadsetDocumentSchema.safeParse(
      makeValidDoc({ extensions: { svg: { dirty: false, raw: 'unknown shape allowed' } } }),
    );

    expect(result.success).toBe(true);
  });
});
