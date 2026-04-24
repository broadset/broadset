/**
 * HTML standalone export test suite. SVG tests migrated to
 * `packages/formats/src/svg/svg-baseline.test.ts` when Phase 7.1
 * split SVG into its own module. This file pins the HTML-standalone
 * runtime shape per `project/spec/formats/web-vector.md`.
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

import { exportHtmlStandalone } from './index';

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

describe('HTML Standalone Export', () => {
  /** @description Validates that animation runtime with requestAnimationFrame and easing is embedded. */
  it('contains animation runtime with requestAnimationFrame and easing', () => {
    const doc = makeDocument({
      animations: [
        {
          elementId: 'el-1',
          config: {
            timelines: [
              {
                id: 'tl-1',
                name: 'idle',
                keyframes: [
                  {
                    name: 'start',
                    action: 'none' as const,
                    offsetMs: 0,
                    properties: {
                      opacity: { type: 'number' as const, value: 0, easing: 'linear' as const },
                    },
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
      elements: [makeElement({ id: 'el-1' })],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('requestAnimationFrame');
    expect(html).toContain('animations');
  });

  /** @description Validates that element IDs are present for animation targeting. */
  it('contains data-element-id attributes', () => {
    const doc = makeDocument({
      elements: [makeElement({ id: 'my-element' })],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('data-element-id="my-element"');
  });

  /** @description Validates inline SVG and clip-path styles in HTML output. */
  it('renders SVG and path elements with clip-path styles', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'svg-el',
          type: 'svg',
          content: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>',
        }),
        makeElement({
          id: 'path-el',
          type: 'path',
          content: 'M0,0 L10,10',
          style: makeStyle({ customClipPath: 'M0,0 L50,0 L50,50 Z' }),
        }),
      ],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('<svg');
    expect(html).toContain('clip-path');
  });

  /** @description Validates group hierarchy and 3D transform styles. */
  it('preserves group hierarchy and 3D transform styles', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'group-1',
          type: 'group',
          style: makeStyle({ rotateX: 15, rotateY: 30, rotateZ: 45 }),
        }),
        makeElement({
          id: 'child-1',
          type: 'rectangle',
          parentId: 'group-1',
        }),
      ],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('rotateX(15deg)');
    expect(html).toContain('rotateY(30deg)');
    expect(html).toContain('rotateZ(45deg)');
  });

  /** @description Validates #canvas container with transform-origin: top left. */
  it('contains #canvas container with transform-origin top left', () => {
    const doc = makeDocument();

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('id="canvas"');
    expect(html).toContain('transform-origin');
    expect(html).toContain('top left');
  });

  /** @description Validates viewport resize scaling logic. */
  it('contains viewport scaling logic with Math.min formula', () => {
    const doc = makeDocument();

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('Math.min');
    expect(html).toContain('innerWidth');
    expect(html).toContain('innerHeight');
  });

  /** @description Validates body overflow is hidden. */
  it('sets body overflow to hidden', () => {
    const doc = makeDocument();

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('overflow');
    expect(html).toContain('hidden');
  });
});

describe('HTML Runtime Feature Parity', () => {
  /** @description Validates OKLab color pipeline functions are present. */
  it('contains OKLab color functions', () => {
    const doc = makeDocument({ elements: [makeElement()] });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('srgbToLinear');
    expect(html).toContain('linearToSrgb');
    expect(html).toContain('rgbToOklab');
    expect(html).toContain('oklabToRgb');
  });

  /** @description Validates path morphing support with COMMAND_COORDS. */
  it('contains path morphing support', () => {
    const doc = makeDocument({ elements: [makeElement()] });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('COMMAND_COORDS');
    expect(html).toContain('reassemblePath');
  });

  /** @description Validates easing support with cubicBezierY and easeStep. */
  it('contains easing support functions', () => {
    const doc = makeDocument({ elements: [makeElement()] });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('cubicBezierY');
    expect(html).toContain('easeStep');
  });
});

describe('HTML Standalone Style Enrichments', () => {
  /**
   * @description Post-unit-8c, legacy CSS-string gradients are no longer
   * a supported model surface — the schema throws on parse per IO-D-18,
   * so the exporter never sees one. This test pins the rejection at the
   * model boundary rather than at the exporter.
   */
  it('rejects legacy CSS-string gradients at parse time', () => {
    expect(() =>
      makeStyle({ backgroundGradient: 'linear-gradient(to right, red, blue)' }),
    ).toThrow();
  });

  /** @description Structured BroadsetGradient objects must be converted to valid CSS gradient strings. */
  it('exports structured gradient objects as CSS', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
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

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('linear-gradient(90deg');
    expect(html).toContain('#ff0000 0%');
    expect(html).toContain('#0000ff 100%');
  });

  /** @description boxShadow must appear in the HTML output. */
  it('exports boxShadow CSS property', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'rectangle',
          style: makeStyle({ boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }),
        }),
      ],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('box-shadow:0 4px 6px rgba(0,0,0,0.1)');
  });

  /** @description textShadow must appear in the HTML text element output. */
  it('exports textShadow CSS property', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'text',
          content: 'Shadow',
          style: makeStyle({ textShadow: '2px 2px 4px black' }),
        }),
      ],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('text-shadow:2px 2px 4px black');
  });

  /** @description textStroke must appear as -webkit-text-stroke in the HTML text element output. */
  it('exports textStroke as -webkit-text-stroke', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'text',
          content: 'Stroke',
          style: makeStyle({ textStroke: '1px white' }),
        }),
      ],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('-webkit-text-stroke:1px white');
  });

  /** @description textTransform must appear in the HTML output. */
  it('exports textTransform CSS property', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'text',
          content: 'upper',
          style: makeStyle({ textTransform: 'uppercase' }),
        }),
      ],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('text-transform:uppercase');
  });

  /** @description filter CSS must appear in the HTML output. */
  it('exports filter CSS property', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'rectangle',
          style: makeStyle({ filter: 'blur(4px)' }),
        }),
      ],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('filter:blur(4px)');
  });

  /** @description Text typography properties must appear as inline styles. */
  it('exports text typography inline styles', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'text',
          content: 'Hello',
          style: makeStyle({
            fontFamily: 'Inter',
            fontSize: 24,
            fontColor: '#333333',
            fontWeight: 700,
            textAlignment: 'center',
          }),
        }),
      ],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('font-family:Inter');
    expect(html).toContain('font-size:24px');
    expect(html).toContain('color:#333333');
    expect(html).toContain('font-weight:700');
    expect(html).toContain('text-align:center');
  });
});

describe('HTML QR Code Rendering', () => {
  /** @description QR code elements must produce inline SVG in the HTML output. */
  it('renders qrcode elements as inline SVG', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'qr-1',
          type: 'qrcode',
          content: 'https://example.com',
        }),
      ],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('<svg');
    expect(html).toContain('viewBox=');
    expect(html).toContain('<rect');
  });

  /** @description QR code with empty content must render as empty div. */
  it('renders empty qrcode as empty div', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'qr-empty',
          type: 'qrcode',
          content: '',
        }),
      ],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).not.toContain('<svg');
    expect(html).toContain('data-element-id="qr-empty"');
  });

  /** @description Ellipse elements must render with border-radius:50%. */
  it('renders ellipse with border-radius:50%', () => {
    const doc = makeDocument({
      elements: [makeElement({ type: 'ellipse' })],
    });

    const html = exportHtmlStandalone(doc);

    expect(html).toContain('border-radius:50%');
  });
});
