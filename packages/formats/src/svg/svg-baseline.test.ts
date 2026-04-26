/**
 * P7.1 — SVG baseline regression suite.
 *
 * These tests migrated from `packages/formats/src/web-vector/web-vector.test.ts`
 * when the SVG module split off from web-vector. They pin the
 * current (pre-Phase-7.2) behaviour of the primitive exporter +
 * element extractor so the folder move and the
 * `exportSvg`→`exportSvgString` rename cannot regress existing
 * callers. Phase 7.2+ layers richer behaviour on top; when those
 * tests land they run alongside this file without replacing it.
 */
import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetElementStyleInput,
  type Canvas,
  rgbColor,
  styleSchema,
} from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportSvgString, importSvg } from './index';

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 800,
    height: 600,
    unit: 'px' as const,
    dpi: 72,
    padding: [0, 0, 0, 0] as [number, number, number, number],
    backgroundColor: '#ffffff',
    backgroundMode: 'solid' as const,
    ...overrides,
  };
}

function makeStyle(overrides: Partial<BroadsetElementStyleInput> = {}): BroadsetElementStyle {
  return styleSchema.parse({
    opacity: 1,
    ...overrides,
  });
}

function makeElement(overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id: `el-${String(Math.random()).slice(2, 8)}`,
    type: 'rectangle',
    name: 'Test Element',
    content: '',
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    rotation: 0,
    parentId: null,
    groupId: null,
    style: makeStyle(),
    assetId: null,
    dataField: null,
    visibleWhen: null,
    repeater: null,
    componentRef: null,
    typeConfig: null,
    autoSize: 'fixed' as const,
    locked: false,
    textPathElementId: null,
    booleanOperation: null,
    extensions: {},
    ...overrides,
  } as BroadsetElement;
}

function makeDocument(overrides: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return {
    id: 'doc-1',
    name: 'Test Document',
    documentMode: 'screen' as const,
    canvas: makeCanvas(),
    elements: [],
    animations: [],
    pages: [],
    dataSchema: { fields: [] },
    ...overrides,
  } as BroadsetDocument;
}

describe('SVG Path Export', () => {
  /** @description Validates that path elements produce <path> nodes with d, stroke, and fill. */
  it('exports path with d attribute and stroke color', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'path-1',
          type: 'path',
          content: 'M0,0 L40,20 Z',
          style: makeStyle({ stroke: '#ff0000', fill: 'none' }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('<path');
    expect(svg).toContain('d="M0,0 L40,20 Z"');
    expect(svg).toContain('stroke="#ff0000"');
  });
});

describe('SVG Clip-Path Export', () => {
  /** @description Validates that custom clip-paths produce <clipPath> defs and are referenced. */
  it('exports clipPath in defs and references via clip-path attribute', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'img-clip',
          type: 'image',
          content: 'https://example.com/photo.png',
          style: makeStyle({ customClipPath: 'M0,0 L100,0 L100,50 Z' }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('<clipPath');
    expect(svg).toContain('<defs>');
    expect(svg).toContain('clip-path="url(#');
  });
});

describe('SVG Text, Image, and Rotation Export', () => {
  /** @description Validates text as <text> and rotated image with rotate() transform. */
  it('exports text as <text> and image with rotate() transform', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'text-1',
          type: 'text',
          content: 'Hello World',
          style: makeStyle({ fontFamily: 'Arial', fontSize: 24 }),
        }),
        makeElement({
          id: 'img-1',
          type: 'image',
          content: 'https://example.com/photo.png',
          rotation: 45,
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('<text');
    expect(svg).toContain('Hello World');
    expect(svg).toContain('<image');
    expect(svg).toContain('rotate(45');
  });
});

describe('SVG Inline Payload Embedding', () => {
  /**
   * @description SVG-type payloads embed their sanitized content
   * inline — `<foreignObject>` is stripped per the Phase 7 importer
   * security contract (see `project/spec/formats/svg.md` →
   * "Requirement: Import Sanitization"), so benign inline shapes
   * survive but active-content carriers do not. The exporter MUST
   * also never wrap the payload in a `data:` URI reference; it emits
   * the sanitized markup inline.
   */
  it('embeds benign inline shapes and strips foreignObject active-content carriers', async () => {
    const svgPayload =
      '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="5"/><foreignObject width="100" height="50"><div>Hello</div></foreignObject></svg>';
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'svg-1',
          type: 'svg',
          content: svgPayload,
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('<circle');
    expect(svg).not.toContain('<foreignObject');
    expect(svg).not.toContain('href="data:image/svg+xml;utf8,');
  });
});

describe('SVG Import', () => {
  /** @description Validates rectangle import with translate and rotation recovery. */
  it('imports rect with translate and rotation', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <rect width="100" height="50" transform="translate(10,20) rotate(45)" fill="#00ff00"/>
    </svg>`;

    const result = importSvg(input);

    expect(result.elements).toHaveLength(1);

    const el = result.elements[0];

    expect(el).toBeDefined();
    expect(el?.type).toBe('rectangle');
    expect(el?.position.x).toBeCloseTo(10);
    expect(el?.position.y).toBeCloseTo(20);
    expect(el?.rotation).toBeCloseTo(45);
  });

  /** @description Validates path import with clip-path from defs. */
  it('imports path with clip-path resolved from defs', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <defs>
        <clipPath id="clip1"><rect width="50" height="50"/></clipPath>
      </defs>
      <path d="M0,0 L40,20 Z" stroke="#ff0000" fill="none" clip-path="url(#clip1)"/>
    </svg>`;

    const result = importSvg(input);

    expect(result.elements).toHaveLength(1);

    const el = result.elements[0];

    expect(el).toBeDefined();
    expect(el?.type).toBe('path');
    expect(el?.content).toBe('M0,0 L40,20 Z');
    expect(el?.style.customClipPath).toBeDefined();
  });

  /** @description Validates viewBox fallback when width/height are absent. */
  it('uses viewBox dimensions when width/height are absent', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"></svg>';

    const result = importSvg(input);

    expect(result.canvasWidth).toBe(1920);
    expect(result.canvasHeight).toBe(1080);
  });
});

describe('SVG Import Fallback Preservation', () => {
  /** @description Validates that native rect becomes rectangle and foreignObject becomes svg type. */
  it('converts rect to rectangle and foreignObject to svg element', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <rect width="100" height="50" fill="#ff0000"/>
      <foreignObject width="200" height="100"><div>Hello</div></foreignObject>
    </svg>`;

    const result = importSvg(input);

    const rectEl = result.elements.find((e) => e.type === 'rectangle');
    const svgEl = result.elements.find((e) => e.type === 'svg');

    expect(rectEl).toBeDefined();
    expect(svgEl).toBeDefined();
    expect(svgEl?.content).toContain('foreignObject');
  });

  /**
   * @description A decomposable matrix on a `<g>` (here just a
   * translate disguised as a matrix) MUST hydrate as a native
   * rectangle, NOT an opaque svg payload. P7.7e replaced the
   * blanket "anything containing 'matrix' gets preserved opaquely"
   * branch with a proper decomposition + bake pipeline.
   */
  it('decomposes a translate-only matrix on <g> to a native child', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <g transform="matrix(1,0,0,1,10,20)"><rect width="50" height="25"/></g>
    </svg>`;

    const result = importSvg(input);
    const rectEl = result.elements.find((e) => e.type === 'rectangle');
    const opaqueEl = result.elements.find((e) => e.type === 'svg');

    expect(rectEl?.position.x).toBeCloseTo(10, 1);
    expect(rectEl?.position.y).toBeCloseTo(20, 1);
    expect(opaqueEl).toBeUndefined();
  });

  /**
   * @description A non-decomposable matrix on a `<g>` (here scale)
   * MUST bake the transform into each child shape's geometry as a
   * `<path>`, NOT collapse to an opaque svg payload. P7.7e
   * propagates the cumulative matrix through `TransformState` so
   * leaf shapes pre-multiply their geometry.
   */
  it('propagates a baking matrix from <g> into child geometry', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <g transform="scale(2, 1)"><rect width="50" height="25"/></g>
    </svg>`;

    const result = importSvg(input);
    const pathEl = result.elements.find((e) => e.type === 'path');
    const opaqueEl = result.elements.find((e) => e.type === 'svg');

    expect(pathEl).toBeDefined();
    expect(opaqueEl).toBeUndefined();
  });

  /** @description Validates that simple groups are flattened so supported children import natively. */
  it('flattens simple groups and imports their supported children', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <g transform="translate(10,20)">
        <rect width="50" height="25" fill="#ff0000"/>
      </g>
    </svg>`;

    const result = importSvg(input);

    expect(result.elements).toHaveLength(1);

    const rectEl = result.elements[0];

    expect(rectEl?.type).toBe('rectangle');
    expect(rectEl?.position.x).toBe(10);
    expect(rectEl?.position.y).toBe(20);
  });

  /** @description Validates that unsupported elements are preserved as svg payload fallbacks with warnings. */
  it('preserves unsupported elements as svg payload fallback and emits warning', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <meshgradient id="mg-1"><meshrow/></meshgradient>
    </svg>`;

    const result = importSvg(input);

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]?.type).toBe('svg');
    expect(result.elements[0]?.content).toContain('<meshgradient');
    expect(result.warnings.some((warning) => warning.includes('Preserved unsupported SVG element as payload'))).toBe(
      true,
    );
  });
});

describe('SVG Import Error Recovery', () => {
  /** @description Validates partial import — valid elements imported, invalid skipped. */
  it('imports valid elements and skips invalid ones with warnings', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <rect width="100" height="50" fill="#ff0000"/>
      <invalid-element width="100" height="50"/>
      <rect width="200" height="100" fill="#00ff00"/>
    </svg>`;

    const result = importSvg(input);

    expect(result.elements.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  /** @description Validates that completely invalid XML fails with descriptive error. */
  it('fails with descriptive error on invalid XML', () => {
    const input = 'this is not xml at all <><>';

    expect(() => importSvg(input)).toThrow();
  });
});

describe('SVG Export Style Enrichments', () => {
  /** @description Linear gradient must produce a linearGradient def and fill reference. */
  it('exports linearGradient def for backgroundGradient', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'rect-grad',
          type: 'rectangle',
          style: makeStyle({
            backgroundGradient: {
              type: 'linear',
              angle: 90,
              stops: [
                { color: rgbColor('#ff0000'), position: 0 },
                { color: rgbColor('#0000ff'), position: 1 },
              ],
            },
          }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('<linearGradient id="grad-rect-grad"');
    expect(svg).toContain('stop-color="#ff0000"');
    expect(svg).toContain('stop-color="#0000ff"');
    expect(svg).toContain('fill="url(#grad-rect-grad)"');
  });

  /** @description Radial gradient must produce a radialGradient def. */
  it('exports radialGradient def for backgroundGradient', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'ellipse-grad',
          type: 'ellipse',
          style: makeStyle({
            backgroundGradient: {
              type: 'radial',
              stops: [
                { color: rgbColor('#00ff00'), position: 0 },
                { color: rgbColor('#ff00ff'), position: 1 },
              ],
            },
          }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('<radialGradient id="grad-ellipse-grad"');
    expect(svg).toContain('fill="url(#grad-ellipse-grad)"');
  });

  /** @description boxShadow must produce an SVG filter def with feDropShadow. */
  it('exports boxShadow as SVG filter', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'shadow-el',
          type: 'rectangle',
          style: makeStyle({ boxShadow: '2px 4px 6px #000000' }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('<filter id="shadow-shadow-el"');
    expect(svg).toContain('feDropShadow');
    expect(svg).toContain('dx="2"');
    expect(svg).toContain('dy="4"');
    expect(svg).toContain('filter="url(#shadow-shadow-el)"');
  });

  /** @description QR code elements must produce inline SVG content. */
  it('exports qrcode elements as svg content', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'qr-svg',
          type: 'qrcode',
          content: 'https://example.com',
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('id="qr-svg"');
    expect(svg).toContain('<rect');
  });

  /** @description Image elements must include preserveAspectRatio. */
  it('exports image with preserveAspectRatio', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'image',
          content: 'https://img.example.com/pic.png',
          style: makeStyle({ objectFit: 'contain' }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  /** @description Text elements must include fontStyle and textDecoration attributes. */
  it('exports text with fontStyle and textDecoration', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'text',
          content: 'Fancy',
          style: makeStyle({
            fontStyle: 'italic',
            textDecoration: 'underline',
            letterSpacing: 2,
          }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('text-decoration="underline"');
    expect(svg).toContain('letter-spacing="2"');
  });

  /** @description QR code with empty content must produce empty group. */
  it('exports empty qrcode as empty group', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'qr-empty',
          type: 'qrcode',
          content: '',
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('id="qr-empty"');
    expect(svg).toContain('<g id="qr-empty"');
  });
});
