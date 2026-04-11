import {
  type BroadsetDocument,
  broadsetDocumentSchema,
  type BroadsetElement,
  type BroadsetProject,
  broadsetProjectSchema,
  createEmptyBroadsetDocument,
} from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import {
  exportProjectJson,
  exportVideoBlob,
  generateOGrafPackages,
  generateQrSvgFragment,
  isVideoExportSupported,
  sanitizeFilename,
} from './interchange';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Returns the first element of an array, throwing if the array is empty. */
function first<T>(arr: readonly T[]): T {
  const item = arr[0];

  if (item === undefined) {
    throw new Error('Expected non-empty array');
  }

  return item;
}

function makeElement(overrides: Partial<BroadsetElement> & { readonly type: string }): BroadsetElement {
  return {
    id: `el-${String(Math.random()).slice(2, 8)}`,
    name: overrides.type,
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    rotation: 0,
    locked: false,
    visible: true,
    content: '',
    style: {},
    parentId: null,
    groupId: null,
    assetId: null,
    dataField: null,
    visibleWhen: null,
    repeater: null,
    ...overrides,
  } as BroadsetElement;
}

function makeDocument(overrides: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return broadsetDocumentSchema.parse({
    ...createEmptyBroadsetDocument(),
    ...overrides,
  });
}

function makeProject(documents: readonly BroadsetDocument[] = [makeDocument()]): BroadsetProject {
  return broadsetProjectSchema.parse({
    schemaVersion: 1,
    id: 'proj-test',
    name: 'Test Project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {},
    assets: [],
    documents: [...documents],
  });
}

/* ------------------------------------------------------------------ */
/*  JSON Document Export                                              */
/* ------------------------------------------------------------------ */

describe('JSON Document Export', () => {
  /** @description Validates that a document with animations survives JSON round-trip with schema and animation config intact. */
  it('preserves animations through JSON round-trip', () => {
    const doc = makeDocument({
      elements: [makeElement({ type: 'text', id: 'el-1', content: 'Hello' })],
      animations: [
        {
          elementId: 'el-1',
          config: {
            timelines: [
              {
                id: 'tl-fade',
                name: 'fade',
                durationMs: 1000,
                keyframes: [
                  {
                    name: 'start',
                    action: 'none',
                    offsetMs: 0,
                    properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
                  },
                  {
                    name: 'end',
                    action: 'none',
                    offsetMs: 1000,
                    properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
                  },
                ],
              },
            ],
            stateTimelineBindings: [],
            modifierTimelineBindings: [],
            textAnimator: null,
          },
        },
      ],
    });
    const project = makeProject([doc]);
    const json = exportProjectJson(project);
    const parsed = broadsetProjectSchema.parse(JSON.parse(json));

    const doc0 = first(parsed.documents);

    expect(doc0.animations).toHaveLength(1);
    expect(first(doc0.animations).config.timelines).toHaveLength(1);
    expect(first(first(doc0.animations).config.timelines).keyframes).toHaveLength(2);
  });

  /** @description Validates that all pages are preserved through JSON export for a multi-page document. */
  it('preserves all pages in a multi-page document', () => {
    const doc = makeDocument({
      pages: [
        { id: 'page-1', name: 'Intro', overrides: [], locale: null, extensions: {} },
        { id: 'page-2', name: 'Main', overrides: [], locale: null, extensions: {} },
        { id: 'page-3', name: 'Outro', overrides: [], locale: null, extensions: {} },
      ],
    });
    const project = makeProject([doc]);
    const json = exportProjectJson(project);
    const parsed = broadsetProjectSchema.parse(JSON.parse(json));

    const doc0 = first(parsed.documents);

    expect(doc0.pages).toHaveLength(3);
    expect(doc0.pages.map((p) => p.name)).toEqual(['Intro', 'Main', 'Outro']);
  });

  /** @description Validates that all 11 element types survive JSON round-trip without data loss. */
  it('round-trips all 11 element types', () => {
    const types = [
      'text',
      'image',
      'rectangle',
      'path',
      'ellipse',
      'svg',
      'qrcode',
      'group',
      'video',
      'clock',
      'ticker',
    ] as const;
    const elements = types.map((type) =>
      makeElement({
        type,
        id: `el-${type}`,
        name: type,
        content: type === 'qrcode' ? 'https://example.com' : '',
      }),
    );
    const doc = makeDocument({ elements: [...elements] });
    const project = makeProject([doc]);
    const json = exportProjectJson(project);
    const parsed = broadsetProjectSchema.parse(JSON.parse(json));
    const roundTrippedTypes = first(parsed.documents).elements.map((e) => e.type);

    for (const type of types) {
      expect(roundTrippedTypes).toContain(type);
    }
  });

  /** @description Validates that an empty document round-trips with structure preserved. */
  it('round-trips an empty document', () => {
    const doc = makeDocument({ elements: [] });
    const project = makeProject([doc]);
    const json = exportProjectJson(project);
    const parsed = broadsetProjectSchema.parse(JSON.parse(json));

    expect(parsed.documents).toHaveLength(1);
    expect(first(parsed.documents).elements).toHaveLength(0);
  });

  /** @description Stress test: 100 elements round-trip without data loss. */
  it('round-trips 100 elements without data loss', () => {
    const elements = Array.from({ length: 100 }, (_, i) =>
      makeElement({ type: 'rectangle', id: `el-${String(i)}`, name: `rect-${String(i)}` }),
    );
    const doc = makeDocument({ elements: [...elements] });
    const project = makeProject([doc]);
    const json = exportProjectJson(project);
    const parsed = broadsetProjectSchema.parse(JSON.parse(json));

    expect(first(parsed.documents).elements).toHaveLength(100);
  });

  /** @description Validates that the JSON payload is valid BroadsetProject JSON. */
  it('produces valid BroadsetProject JSON', () => {
    const project = makeProject();
    const json = exportProjectJson(project);

    expect(() => broadsetProjectSchema.parse(JSON.parse(json))).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  OGraf Package Generation                                         */
/* ------------------------------------------------------------------ */

describe('OGraf Package Generation', () => {
  /** @description Validates that one OGraf package is generated per top-level element. */
  it('produces one package per top-level element', () => {
    const elements = [
      makeElement({ type: 'text', id: 'el-1', content: 'Hello' }),
      makeElement({ type: 'rectangle', id: 'el-2' }),
      makeElement({ type: 'image', id: 'el-3' }),
    ];
    const doc = makeDocument({ elements: [...elements] });
    const packages = generateOGrafPackages(doc);

    expect(packages).toHaveLength(3);
  });

  /** @description Validates that text content is exposed as default values in the OGraf schema. */
  it('exposes text content as schema default values', () => {
    const doc = makeDocument({
      elements: [makeElement({ type: 'text', id: 'el-1', content: 'Hello World' })],
    });
    const packages = generateOGrafPackages(doc);
    const pkg = first(packages);

    expect(pkg.schema.defaults).toBeDefined();
    expect(Object.values(pkg.schema.defaults)).toContain('Hello World');
  });

  /** @description Validates that image elements are NOT exposed as text data inputs. */
  it('does not expose image elements as text data inputs', () => {
    const doc = makeDocument({
      elements: [makeElement({ type: 'image', id: 'el-img', content: 'https://example.com/img.png' })],
    });
    const packages = generateOGrafPackages(doc);
    const pkg = first(packages);
    const textInputTypes = pkg.schema.inputs.map((i: { readonly type: string }) => i.type);

    expect(textInputTypes).not.toContain('text');
  });

  /** @description Validates that QR elements produce pre-rendered inline SVG in the runtime. */
  it('pre-renders QR elements to inline SVG', () => {
    const doc = makeDocument({
      elements: [makeElement({ type: 'qrcode', id: 'el-qr', content: 'https://example.com' })],
    });
    const packages = generateOGrafPackages(doc);
    const pkg = first(packages);

    expect(pkg.runtime).toContain('<svg');
    expect(pkg.runtime).toContain('</svg>');
  });
});

/* ------------------------------------------------------------------ */
/*  Video Export Support Detection                                   */
/* ------------------------------------------------------------------ */

describe('Video Export Support Detection', () => {
  /** @description Validates that JSDOM without VideoEncoder reports unsupported. */
  it('returns false in JSDOM (no VideoEncoder)', () => {
    expect(isVideoExportSupported()).toBe(false);
  });

  /** @description Validates that a mock VideoEncoder reports supported. */
  it('returns true when VideoEncoder is defined', () => {
    const original = (globalThis as Record<string, unknown>)['VideoEncoder'];

    try {
      (globalThis as Record<string, unknown>)['VideoEncoder'] = { isSupported: () => true };
      expect(isVideoExportSupported()).toBe(true);
    } finally {
      if (original === undefined) {
        delete (globalThis as Record<string, unknown>)['VideoEncoder'];
      } else {
        (globalThis as Record<string, unknown>)['VideoEncoder'] = original;
      }
    }
  });

  /** @description Validates that exportVideoBlob rejects when VideoEncoder is unavailable. */
  it('rejects with an error when VideoEncoder is not available', async () => {
    await expect(exportVideoBlob()).rejects.toThrow('VideoEncoder API is unavailable');
  });
});

/* ------------------------------------------------------------------ */
/*  QR SVG Fragment Generation                                       */
/* ------------------------------------------------------------------ */

describe('QR SVG Fragment Generation', () => {
  /** @description Validates that empty content returns null. */
  it('returns null for empty content', () => {
    expect(generateQrSvgFragment('')).toBeNull();
  });

  /** @description Validates that valid content produces an SVG fragment with expected structure. */
  it('produces SVG with dark modules and white background for valid content', () => {
    const fragment = generateQrSvgFragment('https://example.com');

    expect(fragment).not.toBeNull();
    expect(fragment).toContain('<g fill="#000000">');
    expect(fragment).toContain('<rect');
  });
});

/* ------------------------------------------------------------------ */
/*  Filename Sanitization                                            */
/* ------------------------------------------------------------------ */

describe('Filename Sanitization', () => {
  /** @description Validates that illegal filesystem characters are stripped and spaces become hyphens. */
  it('strips illegal characters', () => {
    expect(sanitizeFilename('file<>:"/\\|?*name')).toBe('file-name');
  });

  /** @description Validates that whitespace-only input returns empty string. */
  it('returns empty string for whitespace-only input', () => {
    expect(sanitizeFilename('   ')).toBe('');
  });

  /** @description Validates that consecutive hyphens are collapsed and leading/trailing trimmed. */
  it('collapses consecutive hyphens and trims edges', () => {
    expect(sanitizeFilename('--hello---world--')).toBe('hello-world');
  });
});

/* ------------------------------------------------------------------ */
/*  Export Progress Reporting                                        */
/* ------------------------------------------------------------------ */

describe('Export Progress Reporting', () => {
  /** @description Validates that exports complete without error when no progress callback is provided. */
  it('completes without error when no onProgress is provided', () => {
    const project = makeProject();

    expect(() => exportProjectJson(project)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  Export Error Handling                                             */
/* ------------------------------------------------------------------ */

describe('Export Error Handling', () => {
  /** @description Validates that JSON export wraps serialization errors in a descriptive Error. */
  it('rejects with descriptive error on serialization failure', () => {
    const circular = {} as Record<string, unknown>;

    circular['self'] = circular;

    expect(() => exportProjectJson(circular as unknown as BroadsetProject)).toThrow('JSON export failed:');
  });
});
