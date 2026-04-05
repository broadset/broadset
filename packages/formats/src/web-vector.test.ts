import type { AnimationRegistryEntry, BroadsetDocument, BroadsetElement, PageElement } from '@broadset/model';
import { createDefaultElement, createDefaultScreenProps } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { exportHtmlStandalone, exportSvg, importSvg } from './web-vector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @description Converts a BroadsetElement to a PageElement for document assembly. */
function toPageElement(el: BroadsetElement): PageElement {
  return {
    id: el.id,
    type: el.type,
    position: el.position,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    content: el.content,
    parentId: el.parentId,
    groupId: el.groupId,
    screen: el.screen as unknown as Record<string, unknown>,
    style: el.style as unknown as Record<string, unknown>,
  };
}

/** @description Creates a minimal valid BroadsetDocument for testing. */
function makeDoc(
  elements: readonly BroadsetElement[],
  animationRegistry: readonly AnimationRegistryEntry[] = [],
): BroadsetDocument {
  return {
    id: 'doc-1',
    documentMode: 'screen',
    canvas: { width: 800, height: 600, padding: [0, 0, 0, 0] },
    pages: [{ id: 'page-1', elements: elements.map(toPageElement) }],
    animationRegistry,
  };
}

/** @description Creates a path element with custom d, stroke, and fill. */
function makePathElement(opts: {
  readonly id?: string;
  readonly d: string;
  readonly stroke?: string;
  readonly fill?: string;
}): BroadsetElement {
  const style: Record<string, unknown> = { opacity: 1 };

  if (opts.stroke !== undefined) style['stroke'] = opts.stroke;
  if (opts.fill !== undefined) style['fill'] = opts.fill;

  return {
    ...createDefaultElement('path', { id: opts.id ?? 'path-1', content: opts.d }),
    style: style as unknown as BroadsetElement['style'],
  };
}

/** @description Creates a text element with content. */
function makeTextElement(id: string, text: string): BroadsetElement {
  return createDefaultElement('text', { id, content: text });
}

/** @description Creates an image element with a src URL. */
function makeImageElement(id: string, src: string, rotation = 0): BroadsetElement {
  return createDefaultElement('image', { id, content: src, rotation });
}

// ===========================================================================
// SVG Path Export
// ===========================================================================

describe('SVG Path Export', () => {
  /**
   * @description A path element with d and stroke attributes must produce
   * an SVG <path> node with matching d and stroke attributes.
   */
  it('exports path with d and stroke', () => {
    const el = makePathElement({ d: 'M0,0 L40,20 Z', stroke: '#ff0000' });
    const svg = exportSvg(makeDoc([el]));

    expect(svg).toContain('<path');
    expect(svg).toContain('d="M0,0 L40,20 Z"');
    expect(svg).toContain('stroke="#ff0000"');
  });
});

// ===========================================================================
// SVG Clip-Path Export
// ===========================================================================

describe('SVG Clip-Path Export', () => {
  /**
   * @description An image element with a custom clip-path must produce
   * a <clipPath> in <defs> and the element must reference it via clip-path.
   */
  it('exports image with custom clip-path via defs', () => {
    const el: BroadsetElement = {
      ...createDefaultElement('image', { id: 'img-clip', content: 'https://example.com/pic.jpg' }),
      screen: {
        ...createDefaultScreenProps(),
        customClipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)',
      },
    };
    const svg = exportSvg(makeDoc([el]));

    expect(svg).toContain('<clipPath');
    expect(svg).toContain('clip-path="url(#');
  });
});

// ===========================================================================
// SVG Text, Image, and Rotation Export
// ===========================================================================

describe('SVG Text, Image, and Rotation Export', () => {
  /**
   * @description Text elements must be rendered as <text> nodes.
   * Rotated image elements must have a rotate() transform.
   */
  it('exports text and rotated image', () => {
    const text = makeTextElement('txt-1', 'Hello World');
    const img = makeImageElement('img-1', 'https://example.com/pic.png', 45);
    const svg = exportSvg(makeDoc([text, img]));

    expect(svg).toContain('<text');
    expect(svg).toContain('Hello World');
    expect(svg).toContain('<image');
    expect(svg).toContain('rotate(45');
  });
});

// ===========================================================================
// SVG Inline Payload Embedding
// ===========================================================================

describe('SVG Inline Payload Embedding', () => {
  /**
   * @description SVG elements with inline content containing foreignObject
   * must embed the content directly without converting to data URIs.
   */
  it('preserves foreignObject in inline SVG', () => {
    const svgContent =
      '<foreignObject width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml">Hello</div></foreignObject>';
    const el = createDefaultElement('svg', { id: 'svg-inline', content: svgContent });
    const svg = exportSvg(makeDoc([el]));

    expect(svg).toContain('<foreignObject');
    expect(svg).not.toContain('href="data:image/svg+xml;utf8,');
  });
});

// ===========================================================================
// SVG Import
// ===========================================================================

describe('SVG Import', () => {
  /**
   * @description A <rect> with translate(10,20) rotate(45) must import as
   * a rectangle element with translated position and rotation 45.
   */
  it('imports rect with translate and rotate', () => {
    const svgInput = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <rect id="r1" width="100" height="50" transform="translate(10,20) rotate(45)" />
      </svg>
    `;
    const result = importSvg(svgInput);

    expect(result.elements.length).toBe(1);

    const el = result.elements[0];

    expect(el).toBeDefined();

    if (el === undefined) return;

    expect(el.type).toBe('rectangle');
    expect(el.position.x).toBe(10);
    expect(el.position.y).toBe(20);
    expect(el.rotation).toBe(45);
  });

  /**
   * @description A <path> referencing a <clipPath> in <defs> must import
   * with correct content and custom clip-path.
   */
  it('imports path with clip-path from defs', () => {
    const svgInput = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <defs>
          <clipPath id="clip1">
            <circle cx="50" cy="50" r="50" />
          </clipPath>
        </defs>
        <path d="M0,0 L100,100" clip-path="url(#clip1)" stroke="#00ff00" />
      </svg>
    `;
    const result = importSvg(svgInput);

    expect(result.elements.length).toBe(1);

    const el = result.elements[0];

    expect(el).toBeDefined();

    if (el === undefined) return;

    expect(el.type).toBe('path');
    expect(el.content).toBe('M0,0 L100,100');
    expect(el.screen.customClipPath).not.toBe('');
  });

  /**
   * @description SVG with only viewBox (no width/height) must use viewBox
   * dimensions for the document.
   */
  it('uses viewBox dimensions when width/height absent', () => {
    const svgInput = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
        <rect width="100" height="100" />
      </svg>
    `;
    const result = importSvg(svgInput);

    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });
});

// ===========================================================================
// SVG Import Fallback Preservation
// ===========================================================================

describe('SVG Import Fallback Preservation', () => {
  /**
   * @description Native SVG primitives (rect) must become proper element
   * types, while unsupported fragments (foreignObject) must be preserved
   * as svg type elements with their markup.
   */
  it('converts rect to rectangle and foreignObject to svg type', () => {
    const svgInput = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <rect id="r1" width="100" height="50" />
        <foreignObject id="fo1" width="200" height="100">
          <div xmlns="http://www.w3.org/1999/xhtml">Hello</div>
        </foreignObject>
      </svg>
    `;
    const result = importSvg(svgInput);

    const rect = result.elements.find((e) => e.type === 'rectangle');
    const fo = result.elements.find((e) => e.type === 'svg');

    expect(rect).toBeDefined();
    expect(fo).toBeDefined();

    if (fo === undefined) return;

    expect(fo.content).toContain('foreignObject');
  });

  /**
   * @description Transformed groups with matrix() transforms must be
   * preserved as svg type elements with their full markup intact.
   */
  it('preserves transformed groups as svg type', () => {
    const svgInput = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <g transform="matrix(1,0,0,1,10,20)">
          <rect width="50" height="50" />
          <circle cx="25" cy="25" r="10" />
        </g>
      </svg>
    `;
    const result = importSvg(svgInput);

    const group = result.elements.find((e) => e.type === 'svg');

    expect(group).toBeDefined();

    if (group === undefined) return;

    expect(group.content).toContain('<rect');
    expect(group.content).toContain('<circle');
  });
});

// ===========================================================================
// HTML Standalone Export
// ===========================================================================

describe('HTML Standalone Export', () => {
  const animRegistry: readonly AnimationRegistryEntry[] = [
    {
      elementId: 'el-1',
      config: {
        timelines: [
          {
            id: 'tl-1',
            name: 'Timeline 1',
            entries: [
              { name: 'KF1', action: 'setState', offsetMs: 0, properties: {} },
              { name: 'KF2', action: 'setState', offsetMs: 1000, properties: {} },
            ],
          },
        ],
        stateTimelineBindings: [],
        modifierTimelineBindings: [],
      },
    },
  ];

  const docWithAnim = makeDoc([createDefaultElement('rectangle', { id: 'el-1' })], animRegistry);
  const docPlain = makeDoc([
    createDefaultElement('rectangle', { id: 'el-1' }),
    createDefaultElement('text', { id: 'el-2', content: 'Hello' }),
  ]);

  /**
   * @description The HTML output must contain the animation runtime
   * (requestAnimationFrame, easing functions, serialized registry JSON).
   */
  it('embeds animation runtime', () => {
    const html = exportHtmlStandalone(docWithAnim);

    expect(html).toContain('requestAnimationFrame');
    expect(html).toContain(JSON.stringify(animRegistry));
  });

  /**
   * @description Every element in the HTML output must have a
   * data-element-id attribute for animation targeting.
   */
  it('includes data-element-id attributes', () => {
    const html = exportHtmlStandalone(docPlain);

    expect(html).toContain('data-element-id="el-1"');
    expect(html).toContain('data-element-id="el-2"');
  });

  /**
   * @description SVG and path elements with clip-path styles must render
   * inline SVG markup and apply clip-path styles in the HTML output.
   */
  it('renders SVG and path elements with clip-path', () => {
    const pathEl = makePathElement({ id: 'p-1', d: 'M0,0 L50,50 Z', stroke: '#000' });
    const svgEl = createDefaultElement('svg', { id: 'svg-1', content: '<circle cx="25" cy="25" r="20" />' });
    const clipEl: BroadsetElement = {
      ...pathEl,
      screen: { ...createDefaultScreenProps(), customClipPath: 'circle(50%)' },
    };
    const html = exportHtmlStandalone(makeDoc([clipEl, svgEl]));

    expect(html).toContain('<svg');
    expect(html).toContain('clip-path');
  });

  /**
   * @description Rotated and 3D-transformed group elements must preserve
   * their transform styles in the HTML output.
   */
  it('preserves group hierarchy and 3D transforms', () => {
    const parent = createDefaultElement('group', { id: 'g-1' });
    const child: BroadsetElement = {
      ...createDefaultElement('rectangle', { id: 'child-1' }),
      parentId: 'g-1',
      screen: { ...createDefaultScreenProps(), rotateX: 30, rotateY: 15, translateZ: 10 },
    };
    const html = exportHtmlStandalone(makeDoc([parent, child]));

    expect(html).toContain('rotateX(30deg)');
    expect(html).toContain('rotateY(15deg)');
    expect(html).toContain('translateZ(10px)');
  });

  /**
   * @description The HTML output must include a #canvas container
   * positioned with transform-origin: top left.
   */
  it('has #canvas with transform-origin top left', () => {
    const html = exportHtmlStandalone(docPlain);

    expect(html).toContain('id="canvas"');
    expect(html).toContain('transform-origin: top left');
  });

  /**
   * @description The viewport resize handler must scale the canvas to fit
   * using min(viewportWidth/baseWidth, viewportHeight/baseHeight).
   */
  it('includes viewport resize scaling logic', () => {
    const html = exportHtmlStandalone(docPlain);

    expect(html).toContain('Math.min');
    expect(html).toContain('innerWidth');
    expect(html).toContain('innerHeight');
  });

  /**
   * @description The HTML body must have overflow: hidden to prevent
   * scrollbars during playback.
   */
  it('sets overflow hidden on body', () => {
    const html = exportHtmlStandalone(docPlain);

    expect(html).toContain('overflow: hidden');
    // Also verify it's in a style context (body or html)
    expect(html).toMatch(/body\s*\{[^}]*overflow:\s*hidden/);
  });
});

// ===========================================================================
// HTML Runtime Feature Parity
// ===========================================================================

describe('HTML Runtime Feature Parity', () => {
  const doc = makeDoc(
    [createDefaultElement('rectangle', { id: 'el-1' })],
    [
      {
        elementId: 'el-1',
        config: {
          timelines: [{ id: 'tl-1', name: 'TL', entries: [] }],
          stateTimelineBindings: [],
          modifierTimelineBindings: [],
        },
      },
    ],
  );

  /**
   * @description The embedded runtime must contain OKLab color pipeline
   * functions: srgbToLinear, linearToSrgb, rgbToOklab, oklabToRgb.
   */
  it('contains OKLab color pipeline functions', () => {
    const html = exportHtmlStandalone(doc);

    expect(html).toContain('srgbToLinear');
    expect(html).toContain('linearToSrgb');
    expect(html).toContain('rgbToOklab');
    expect(html).toContain('oklabToRgb');
  });

  /**
   * @description The embedded runtime must contain SVG path morphing
   * support including COMMAND_COORDS lookup table and reassemblePath.
   */
  it('contains path morphing functions', () => {
    const html = exportHtmlStandalone(doc);

    expect(html).toContain('COMMAND_COORDS');
    expect(html).toContain('reassemblePath');
  });

  /**
   * @description The embedded runtime must contain cubic-bezier Newton
   * solver and step easing function.
   */
  it('contains cubic-bezier and step easing', () => {
    const html = exportHtmlStandalone(doc);

    expect(html).toContain('cubicBezierY');
    expect(html).toContain('easeStep');
  });
});

// ===========================================================================
// SVG Import Error Recovery
// ===========================================================================

describe('SVG Import Error Recovery', () => {
  /**
   * @description Partially invalid SVG input must import valid elements
   * and skip invalid ones, returning warnings for skipped elements.
   */
  it('imports valid elements and skips invalid ones with warnings', () => {
    const svgInput = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <rect id="valid1" width="100" height="50" />
        <rect id="valid2" width="200" height="100" />
        <unknownElement id="bad1" />
        <unknownElement id="bad2" />
      </svg>
    `;
    const result = importSvg(svgInput);

    expect(result.elements.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  /**
   * @description Completely invalid XML input must result in an import
   * failure with a descriptive error.
   */
  it('fails with descriptive error on invalid XML', () => {
    expect(() => importSvg('<not valid xml><<<')).toThrow();
  });
});
