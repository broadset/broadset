import type { BroadsetDocument, BroadsetElement, BroadsetElementStyle, Canvas } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

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

function makeStyle(overrides: Partial<BroadsetElementStyle> = {}): BroadsetElementStyle {
  return {
    opacity: 1,
    ...overrides,
  };
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
