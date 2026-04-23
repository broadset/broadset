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

import { exportHtmlStandalone, exportSvg, importSvg } from './index';

/* ------------------------------------------------------------------ */
/*  Test Helpers                                                     */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  SVG Path Export                                                  */
/* ------------------------------------------------------------------ */

describe('SVG Path Export', () => {
  /** @description Validates that path elements produce <path> nodes with d, stroke, and fill. */
  it('exports path with d attribute and stroke color', () => {
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

    const svg = exportSvg(doc);

    expect(svg).toContain('<path');
    expect(svg).toContain('d="M0,0 L40,20 Z"');
    expect(svg).toContain('stroke="#ff0000"');
  });
});

/* ------------------------------------------------------------------ */
/*  SVG Clip-Path Export                                             */
/* ------------------------------------------------------------------ */

describe('SVG Clip-Path Export', () => {
  /** @description Validates that custom clip-paths produce <clipPath> defs and are referenced. */
  it('exports clipPath in defs and references via clip-path attribute', () => {
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

    const svg = exportSvg(doc);

    expect(svg).toContain('<clipPath');
    expect(svg).toContain('<defs>');
    expect(svg).toContain('clip-path="url(#');
  });
});

/* ------------------------------------------------------------------ */
/*  SVG Text, Image, and Rotation Export                             */
/* ------------------------------------------------------------------ */

describe('SVG Text, Image, and Rotation Export', () => {
  /** @description Validates text as <text> and rotated image with rotate() transform. */
  it('exports text as <text> and image with rotate() transform', () => {
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

    const svg = exportSvg(doc);

    expect(svg).toContain('<text');
    expect(svg).toContain('Hello World');
    expect(svg).toContain('<image');
    expect(svg).toContain('rotate(45');
  });
});

/* ------------------------------------------------------------------ */
/*  SVG Inline Payload Embedding                                     */
/* ------------------------------------------------------------------ */

describe('SVG Inline Payload Embedding', () => {
  /** @description Validates that SVG elements embed inline content including foreignObject. */
  it('embeds foreignObject directly without data URI', () => {
    const svgPayload =
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="100" height="50"><div>Hello</div></foreignObject></svg>';
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'svg-1',
          type: 'svg',
          content: svgPayload,
        }),
      ],
    });

    const svg = exportSvg(doc);

    expect(svg).toContain('<foreignObject');
    expect(svg).not.toContain('href="data:image/svg+xml;utf8,');
  });
});

/* ------------------------------------------------------------------ */
/*  SVG Import                                                       */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  SVG Import Fallback Preservation                                 */
/* ------------------------------------------------------------------ */

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

  /** @description Validates that transformed matrix groups are preserved as svg element type. */
  it('preserves transformed matrix groups as svg element type', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <g transform="matrix(1,0,0,1,10,20)"><rect width="50" height="25"/></g>
    </svg>`;

    const result = importSvg(input);

    const svgEl = result.elements.find((e) => e.type === 'svg');

    expect(svgEl).toBeDefined();
    expect(svgEl?.content).toContain('<g');
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

/* ------------------------------------------------------------------ */
/*  SVG Import Error Recovery                                        */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  SVG Export Style Enrichments (C9)                                */
/* ------------------------------------------------------------------ */

describe('SVG Export Style Enrichments', () => {
  /** @description Linear gradient must produce a linearGradient def and fill reference. */
  it('exports linearGradient def for backgroundGradient', () => {
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

    const svg = exportSvg(doc);

    expect(svg).toContain('<linearGradient id="grad-rect-grad"');
    expect(svg).toContain('stop-color="#ff0000"');
    expect(svg).toContain('stop-color="#0000ff"');
    expect(svg).toContain('fill="url(#grad-rect-grad)"');
  });

  /** @description Radial gradient must produce a radialGradient def. */
  it('exports radialGradient def for backgroundGradient', () => {
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

    const svg = exportSvg(doc);

    expect(svg).toContain('<radialGradient id="grad-ellipse-grad"');
    expect(svg).toContain('fill="url(#grad-ellipse-grad)"');
  });

  /** @description boxShadow must produce an SVG filter def with feDropShadow. */
  it('exports boxShadow as SVG filter', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'shadow-el',
          type: 'rectangle',
          style: makeStyle({ boxShadow: '2px 4px 6px #000000' }),
        }),
      ],
    });

    const svg = exportSvg(doc);

    expect(svg).toContain('<filter id="shadow-shadow-el"');
    expect(svg).toContain('feDropShadow');
    expect(svg).toContain('dx="2"');
    expect(svg).toContain('dy="4"');
    expect(svg).toContain('filter="url(#shadow-shadow-el)"');
  });

  /** @description QR code elements must produce inline SVG content. */
  it('exports qrcode elements as svg content', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'qr-svg',
          type: 'qrcode',
          content: 'https://example.com',
        }),
      ],
    });

    const svg = exportSvg(doc);

    expect(svg).toContain('id="qr-svg"');
    expect(svg).toContain('<rect');
  });

  /** @description Image elements must include preserveAspectRatio. */
  it('exports image with preserveAspectRatio', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'image',
          content: 'https://img.example.com/pic.png',
          style: makeStyle({ objectFit: 'contain' }),
        }),
      ],
    });

    const svg = exportSvg(doc);

    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  /** @description Text elements must include fontStyle and textDecoration attributes. */
  it('exports text with fontStyle and textDecoration', () => {
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

    const svg = exportSvg(doc);

    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('text-decoration="underline"');
    expect(svg).toContain('letter-spacing="2"');
  });

  /** @description QR code with empty content must produce empty group. */
  it('exports empty qrcode as empty group', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'qr-empty',
          type: 'qrcode',
          content: '',
        }),
      ],
    });

    const svg = exportSvg(doc);

    expect(svg).toContain('id="qr-empty"');
    expect(svg).toContain('<g id="qr-empty"');
  });
});

/* ------------------------------------------------------------------ */
/*  HTML Standalone Export                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  HTML Runtime Feature Parity                                      */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  HTML Standalone Style Enrichments (C8)                           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  HTML QR Code Rendering (C8)                                      */
/* ------------------------------------------------------------------ */

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
