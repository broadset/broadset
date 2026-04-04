import type { BroadsetDocument, Page } from '@broadset/model';
import { broadsetDocumentSchema, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import {
  exportDocumentJson,
  generateOgrafPackages,
  generateQrSvgFragment,
  importDocumentJson,
  isVideoExportSupported,
  sanitizeFilename,
} from './interchange';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @description Creates a minimal page with one element of the given type. */
function makeElement(type: string, id: string, content = ''): Page['elements'][number] {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    rotation: 0,
    content,
    parentId: null,
    groupId: null,
  };
}

/** @description Creates a valid BroadsetDocument with the given pages. */
function makeDocument(pages: readonly Page[]): BroadsetDocument {
  return {
    id: 'doc-1',
    documentMode: 'screen',
    canvas: { width: 1920, height: 1080, padding: [0, 0, 0, 0] },
    pages,
    animationRegistry: [],
  };
}

// ===========================================================================
// JSON Document Export
// ===========================================================================

describe('JSON Document Export', () => {
  /** @description Animation config must survive an export→import round-trip without data loss. */
  it('preserves animation registry on round-trip', () => {
    const doc: BroadsetDocument = {
      id: 'doc-anim',
      documentMode: 'screen',
      canvas: { width: 1920, height: 1080, padding: [0, 0, 0, 0] },
      pages: [{ id: 'p1', elements: [makeElement('text', 'el-1', 'hello')] }],
      animationRegistry: [
        {
          elementId: 'el-1',
          config: {
            timelines: [
              {
                id: 'IN',
                name: 'IN',
                entries: [
                  {
                    name: 'fade-start',
                    action: 'none' as const,
                    offsetMs: 0,
                    properties: { opacity: { value: 0, interpolation: 'linear' } },
                  },
                  {
                    name: 'fade-end',
                    action: 'none' as const,
                    offsetMs: 1000,
                    properties: { opacity: { value: 1, interpolation: 'linear' } },
                  },
                ],
              },
            ],
            stateTimelineBindings: [],
            modifierTimelineBindings: [],
          },
        },
      ],
    };
    const json = exportDocumentJson(doc);
    const parsed = importDocumentJson(json);

    expect(parsed.animationRegistry).toEqual(doc.animationRegistry);
  });

  /** @description Multi-page documents must retain all pages after export→import. */
  it('preserves all pages in multi-page document', () => {
    const doc = makeDocument([
      { id: 'p1', elements: [makeElement('text', 'el-1')] },
      { id: 'p2', elements: [makeElement('rectangle', 'el-2')] },
      { id: 'p3', elements: [makeElement('ellipse', 'el-3')] },
    ]);
    const json = exportDocumentJson(doc);
    const parsed = importDocumentJson(json);

    expect(parsed.pages).toHaveLength(3);
    expect(parsed.pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  /** @description All 8 built-in element types must survive a round-trip without type loss. */
  it('round-trips all 8 element types', () => {
    const types = ['text', 'image', 'rectangle', 'path', 'ellipse', 'svg', 'qrcode', 'group'] as const;
    const elements = types.map((t, i) => makeElement(t, `el-${String(i)}`));
    const doc = makeDocument([{ id: 'p1', elements }]);

    const json = exportDocumentJson(doc);
    const parsed = importDocumentJson(json);
    const resultTypes = parsed.pages[0]?.elements.map((e) => e.type);

    expect(resultTypes).toEqual([...types]);
  });

  /** @description An empty document (one page, zero elements) must preserve its structure. */
  it('round-trips empty document', () => {
    const doc = createEmptyBroadsetDocument();
    const json = exportDocumentJson(doc);
    const parsed = importDocumentJson(json);

    expect(parsed.id).toBe(doc.id);
    expect(parsed.documentMode).toBe(doc.documentMode);
    expect(parsed.canvas).toEqual(doc.canvas);
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0]?.elements).toHaveLength(0);
  });

  /** @description A 100-element stress test must round-trip without any data loss. */
  it('round-trips 100 elements without data loss', () => {
    const elements = Array.from({ length: 100 }, (_, i) =>
      makeElement('text', `el-${String(i)}`, `content-${String(i)}`),
    );
    const doc = makeDocument([{ id: 'p1', elements }]);
    const json = exportDocumentJson(doc);
    const parsed = importDocumentJson(json);

    expect(parsed.pages[0]?.elements).toHaveLength(100);
    parsed.pages[0]?.elements.forEach((el, i) => {
      expect(el.id).toBe(`el-${String(i)}`);
      expect(el.content).toBe(`content-${String(i)}`);
    });
  });

  /** @description The exported payload must be valid JSON parseable by the document schema. */
  it('produces valid BroadsetDocument JSON', () => {
    const doc = makeDocument([{ id: 'p1', elements: [makeElement('text', 'el-1', 'hi')] }]);
    const json = exportDocumentJson(doc);
    const raw = JSON.parse(json) as unknown;
    const result = broadsetDocumentSchema.safeParse(raw);

    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// OGraf Package Generation
// ===========================================================================

describe('OGraf Package Generation', () => {
  /** @description Each top-level element must produce its own OGraf package. */
  it('produces one package per top-level element', () => {
    const doc = makeDocument([
      {
        id: 'p1',
        elements: [
          makeElement('text', 'el-1', 'Score'),
          makeElement('image', 'el-2'),
          makeElement('rectangle', 'el-3'),
        ],
      },
    ]);
    const packages = generateOgrafPackages(doc);

    expect(packages).toHaveLength(3);
  });

  /** @description Text element content must be exposed as schema default values. */
  it('exposes text content as schema default values', () => {
    const doc = makeDocument([{ id: 'p1', elements: [makeElement('text', 'el-1', 'Hello World')] }]);
    const packages = generateOgrafPackages(doc);
    const pkg = packages[0];

    expect(pkg).toBeDefined();
    expect(pkg?.manifest.schema.some((s) => s.defaultValue === 'Hello World')).toBe(true);
  });

  /** @description Image elements must not be exposed as text data inputs. */
  it('does not expose image elements as text data inputs', () => {
    const doc = makeDocument([
      { id: 'p1', elements: [makeElement('image', 'el-img', 'https://example.com/photo.png')] },
    ]);
    const packages = generateOgrafPackages(doc);
    const pkg = packages[0];

    expect(pkg).toBeDefined();

    const textInputs = pkg?.manifest.schema.filter((s) => s.type === 'text');

    expect(textInputs).toHaveLength(0);
  });

  /** @description QR code elements must have pre-rendered inline SVG in the runtime. */
  it('pre-renders QR code element as inline SVG', () => {
    const doc = makeDocument([{ id: 'p1', elements: [makeElement('qrcode', 'el-qr', 'https://example.com')] }]);
    const packages = generateOgrafPackages(doc);
    const pkg = packages[0];

    expect(pkg).toBeDefined();
    expect(pkg?.runtime.inlineSvg).toBeDefined();
    expect(pkg?.runtime.inlineSvg).toContain('<svg');
  });
});

// ===========================================================================
// Video Export Support Detection
// ===========================================================================

describe('Video Export Support Detection', () => {
  /** @description JSDOM does not have VideoEncoder, so detection must return false. */
  it('returns false in JSDOM (no VideoEncoder)', () => {
    expect(isVideoExportSupported()).toBe(false);
  });

  /** @description When VideoEncoder is available, detection must return true. */
  it('returns true when VideoEncoder is defined', () => {
    const original = (globalThis as Record<string, unknown>)['VideoEncoder'];

    try {
      (globalThis as Record<string, unknown>)['VideoEncoder'] = function VideoEncoder(): void {};

      expect(isVideoExportSupported()).toBe(true);
    } finally {
      if (original === undefined) {
        delete (globalThis as Record<string, unknown>)['VideoEncoder'];
      } else {
        (globalThis as Record<string, unknown>)['VideoEncoder'] = original;
      }
    }
  });

  /** @description exportVideoBlob must reject when VideoEncoder is unavailable. */
  it('rejects when VideoEncoder is unavailable', async () => {
    const { exportVideoBlob } = await import('./interchange');

    await expect(exportVideoBlob()).rejects.toThrow();
  });
});

// ===========================================================================
// QR SVG Fragment Generation
// ===========================================================================

describe('QR SVG Fragment Generation', () => {
  /** @description Empty content must return null — no SVG should be generated. */
  it('returns null for empty content', () => {
    expect(generateQrSvgFragment('')).toBeNull();
  });

  /** @description Valid content must produce an SVG fragment with a white background and dark QR modules. */
  it('generates SVG with white background and dark QR modules', () => {
    const result = generateQrSvgFragment('https://example.com');

    expect(result).not.toBeNull();
    expect(result).toContain('<g fill="#000000">');
    expect(result).toContain('fill="#ffffff"');
  });
});

// ===========================================================================
// Filename Sanitization
// ===========================================================================

describe('Filename Sanitization', () => {
  /** @description Illegal filesystem characters must be stripped and spaces replaced with hyphens. */
  it('strips illegal characters and replaces spaces', () => {
    expect(sanitizeFilename('file<>:"/\\|?*name')).toBe('file-name');
  });

  /** @description Whitespace-only input must return empty string. */
  it('returns empty string for whitespace-only input', () => {
    expect(sanitizeFilename('   ')).toBe('');
  });

  /** @description Consecutive hyphens must be collapsed to a single hyphen. */
  it('collapses consecutive hyphens', () => {
    expect(sanitizeFilename('hello   world')).toBe('hello-world');
  });

  /** @description Leading and trailing hyphens must be trimmed. */
  it('trims leading and trailing hyphens', () => {
    expect(sanitizeFilename(' hello ')).toBe('hello');
  });
});
