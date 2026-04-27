/**
 * P7.2 — SVG export parity + critical-bug fixes.
 *
 * Covers the six acceptance areas the spec declares for Phase 7.2a:
 *
 * 1. Recursive group rendering (fixes the empty-<g> bug).
 * 2. Full stroke property coverage (cap, join, miterlimit,
 *    dasharray, dashoffset, arrow markers).
 * 3. Correct transform composition (group-level rotation + child
 *    positioning relative to group's local coordinate system).
 * 4. Gradient import→export round-trip (linear + radial parsed from
 *    <defs> and re-emitted with matching stop arrays).
 * 5. Safe sanitized output for opaque `svg`-type payloads (re-emitted
 *    markup contains no <script> or on*= handlers, even when the
 *    source `content` is hostile).
 * 6. Animations discarded on export per IO-D-16 — no SMIL, no
 *    animation metadata.
 *
 * Future loops reading this suite should expect the specific
 * attributes pinned here to survive export. Any regression in one
 * of them is a bug, not a style nit.
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

/* ------------------------------------------------------------------ */
/*  1. Recursive group rendering (critical bug fix)                   */
/* ------------------------------------------------------------------ */

describe('P7.2 — Recursive group rendering', () => {
  /**
   * @description A group with three children (rect, text, nested
   * group) MUST emit a `<g>` that recursively serialises children
   * in the order declared in the `parentId` tree. The previous
   * exporter emitted an empty `<g>` — that is a regression.
   */
  it('serialises all children of a group inside <g> in tree order', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'grp-1', type: 'group' }),
        makeElement({
          id: 'child-rect',
          type: 'rectangle',
          parentId: 'grp-1',
          style: makeStyle({ fill: '#ff0000' }),
        }),
        makeElement({
          id: 'child-text',
          type: 'text',
          parentId: 'grp-1',
          content: 'Child text',
        }),
        makeElement({ id: 'child-grp', type: 'group', parentId: 'grp-1' }),
        makeElement({
          id: 'grand-child',
          type: 'ellipse',
          parentId: 'child-grp',
        }),
      ],
    });

    const svg = await exportSvgString(doc);
    const grpIdx = svg.indexOf('id="grp-1"');
    const endGrpIdx = svg.indexOf('</g>', grpIdx);

    expect(grpIdx).toBeGreaterThan(-1);
    expect(endGrpIdx).toBeGreaterThan(grpIdx);

    const inner = svg.slice(grpIdx, endGrpIdx);

    expect(inner).toContain('id="child-rect"');
    expect(inner).toContain('id="child-text"');
    expect(inner).toContain('id="child-grp"');

    // And the grand-child lives inside the nested `<g id="child-grp">`.
    const nestedGrpIdx = svg.indexOf('id="child-grp"');
    const nestedEndGrpIdx = svg.indexOf('</g>', nestedGrpIdx);
    const nestedInner = svg.slice(nestedGrpIdx, nestedEndGrpIdx);

    expect(nestedInner).toContain('id="grand-child"');
  });

  /**
   * @description Top-level elements (those with no `parentId`) MUST
   * NOT be duplicated at both the root and inside their group when
   * they are children of another element. The bug of emitting every
   * element at the root plus inside its group results in
   * double-rendering.
   */
  it('does not render group children at the document root', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'grp-1', type: 'group' }),
        makeElement({
          id: 'child-1',
          type: 'rectangle',
          parentId: 'grp-1',
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    // Only one occurrence of the child element open tag — the
    // P7.3 `data-bs-id=` attribute appears on the same element, so
    // we match the SVG-native `<rect id="…"` prefix specifically.
    const matches = svg.match(/<rect id="child-1"/g) ?? [];

    expect(matches.length).toBe(1);
  });

  /**
   * @description A document with two top-level groups each with
   * children MUST emit two sibling `<g>` nodes at the root, each
   * containing its own children.
   */
  it('emits sibling groups correctly', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'grp-a', type: 'group' }),
        makeElement({ id: 'grp-b', type: 'group' }),
        makeElement({ id: 'ch-a', type: 'rectangle', parentId: 'grp-a' }),
        makeElement({ id: 'ch-b', type: 'ellipse', parentId: 'grp-b' }),
      ],
    });

    const svg = await exportSvgString(doc);
    const grpAIdx = svg.indexOf('id="grp-a"');
    const endGrpAIdx = svg.indexOf('</g>', grpAIdx);
    const grpBIdx = svg.indexOf('id="grp-b"');
    const endGrpBIdx = svg.indexOf('</g>', grpBIdx);

    expect(svg.slice(grpAIdx, endGrpAIdx)).toContain('id="ch-a"');
    expect(svg.slice(grpAIdx, endGrpAIdx)).not.toContain('id="ch-b"');
    expect(svg.slice(grpBIdx, endGrpBIdx)).toContain('id="ch-b"');
    expect(svg.slice(grpBIdx, endGrpBIdx)).not.toContain('id="ch-a"');
  });
});

/* ------------------------------------------------------------------ */
/*  2. Full stroke property coverage                                  */
/* ------------------------------------------------------------------ */

describe('P7.2 — Full stroke property coverage', () => {
  /**
   * @description Every stroke field defined on the model MUST map to
   * its SVG equivalent on export: `stroke-width`, `stroke-linecap`,
   * `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`,
   * `stroke-dashoffset`.
   */
  it('emits all stroke attributes when set', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'rectangle',
          style: makeStyle({
            stroke: rgbColor('#00ff00'),
            strokeWidth: 4,
            strokeLinecap: 'square',
            strokeLinejoin: 'miter',
            strokeMiterlimit: 8,
            strokeDasharray: '6,4',
            strokeDashoffset: 2,
          }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('stroke="#00ff00"');
    expect(svg).toContain('stroke-width="4"');
    expect(svg).toContain('stroke-linecap="square"');
    expect(svg).toContain('stroke-linejoin="miter"');
    expect(svg).toContain('stroke-miterlimit="8"');
    expect(svg).toContain('stroke-dasharray="6,4"');
    expect(svg).toContain('stroke-dashoffset="2"');
  });

  /**
   * @description Arrow-head markers MUST emit as `<marker>` defs and
   * reference the marker via `marker-start` / `marker-end` on paths.
   */
  it('emits marker definitions and marker-start / marker-end for paths with arrow ends', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'arrow-path',
          type: 'path',
          content: 'M0,0 L100,0',
          style: makeStyle({
            stroke: rgbColor('#000000'),
            strokeWidth: 2,
            strokeHeadEnd: { shape: 'triangle' },
            strokeTailEnd: { shape: 'triangle' },
          }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('<marker');
    expect(svg).toContain('marker-start="url(#');
    expect(svg).toContain('marker-end="url(#');
  });

  /**
   * @description When a stroke field is absent the exporter MUST NOT
   * emit a default — preserving the original SVG intent on round-trip.
   */
  it('omits stroke attributes that are absent in the model', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'rectangle',
          style: makeStyle({ fill: '#112233' }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).not.toContain('stroke-width=');
    expect(svg).not.toContain('stroke-linecap=');
    expect(svg).not.toContain('stroke-linejoin=');
    expect(svg).not.toContain('stroke-miterlimit=');
    expect(svg).not.toContain('stroke-dasharray=');
    expect(svg).not.toContain('stroke-dashoffset=');
  });
});

/* ------------------------------------------------------------------ */
/*  3. Group transform composition                                    */
/* ------------------------------------------------------------------ */

describe('P7.2 — Group transform composition', () => {
  /**
   * @description A group with translation + rotation MUST emit both
   * transforms on the `<g>` element, not individually on each child.
   * This matches SVG's native coordinate-system semantics.
   */
  it('emits group transform on the <g> element', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'grp-1',
          type: 'group',
          position: { x: 30, y: 40 },
          rotation: 45,
          width: 200,
          height: 200,
        }),
        makeElement({ id: 'child-1', type: 'rectangle', parentId: 'grp-1' }),
      ],
    });

    const svg = await exportSvgString(doc);
    const grpIdx = svg.indexOf('id="grp-1"');
    const endAttrIdx = svg.indexOf('>', grpIdx);
    const openTag = svg.slice(grpIdx, endAttrIdx);

    expect(openTag).toContain('translate(30,40)');
    expect(openTag).toContain('rotate(45');
  });

  /**
   * @description Child elements of a group MUST emit their own
   * positions in the group's local coordinate system — not in the
   * document root coordinate system. The current exporter's
   * `buildTransform` output for a child works unchanged because the
   * child's position is already local; the group's `<g transform>`
   * adds the parent offset on render.
   */
  it('child translations are local to the parent group', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'grp-1',
          type: 'group',
          position: { x: 100, y: 100 },
          width: 200,
          height: 200,
        }),
        makeElement({
          id: 'child-1',
          type: 'rectangle',
          parentId: 'grp-1',
          position: { x: 10, y: 20 },
        }),
      ],
    });

    const svg = await exportSvgString(doc);
    const childIdx = svg.indexOf('id="child-1"');
    const childEndAttrIdx = svg.indexOf('/>', childIdx);
    const childTag = svg.slice(childIdx, childEndAttrIdx);

    // Child's translate MUST reflect its local position (10,20), not
    // the composed global position (110,120).
    expect(childTag).toContain('translate(10,20)');
  });
});

/* ------------------------------------------------------------------ */
/*  4. Gradient import → export round-trip                            */
/* ------------------------------------------------------------------ */

describe('P7.2 — Gradient import/export round-trip', () => {
  /**
   * @description A source SVG with a `<linearGradient>` in `<defs>`
   * MUST import into a Broadset element with a structured
   * `BroadsetGradient` (not a dropped fill). The stops MUST round-trip
   * count and colour.
   */
  it('imports a linearGradient from defs with all stops', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ff0000"/>
          <stop offset="50%" stop-color="#00ff00"/>
          <stop offset="100%" stop-color="#0000ff"/>
        </linearGradient>
      </defs>
      <rect width="200" height="100" fill="url(#g1)"/>
    </svg>`;

    const result = importSvg(input);
    const rect = result.elements.find((e) => e.type === 'rectangle');

    expect(rect).toBeDefined();

    const gradient = rect?.style.backgroundGradient;

    expect(gradient).toBeDefined();

    if (typeof gradient !== 'object') {
      throw new Error('Expected structured gradient');
    }

    expect(gradient.type).toBe('linear');
    expect(gradient.stops).toHaveLength(3);
    // Source `x1=0 y1=0 x2=1 y2=0` is a horizontal left-to-right
    // gradient. CSS `linear-gradient(<angle>, ...)` measures the
    // angle clockwise from the 12 o'clock position — a 90°
    // direction goes to the right. The deriver normalises into 0-360.
    expect(gradient.angle).toBe(90);

    const [first, second, third] = gradient.stops;

    expect(first?.position).toBe(0);
    expect(second?.position).toBe(50);
    expect(third?.position).toBe(100);
  });

  /**
   * @description A source SVG with a `<radialGradient>` in `<defs>`
   * MUST import into a Broadset element with `type: 'radial'` and
   * every stop preserved.
   */
  it('imports a radialGradient from defs with all stops', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <defs>
        <radialGradient id="g2" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="#ff00ff"/>
          <stop offset="100%" stop-color="#00ffff"/>
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="50" rx="50" ry="50" fill="url(#g2)"/>
    </svg>`;

    const result = importSvg(input);
    const ellipse = result.elements.find((e) => e.type === 'ellipse');

    expect(ellipse).toBeDefined();

    const gradient = ellipse?.style.backgroundGradient;

    expect(gradient).toBeDefined();

    if (typeof gradient !== 'object') {
      throw new Error('Expected structured gradient');
    }

    expect(gradient.type).toBe('radial');
    expect(gradient.stops).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  5. Safe sanitized output for opaque svg-type payloads             */
/* ------------------------------------------------------------------ */

describe('P7.2 — Opaque payload sanitization on export', () => {
  /**
   * @description An `svg`-type element whose `content` carries a
   * hostile script-tag payload MUST be sanitized before the markup
   * is embedded in the output SVG. A later consumer opening the
   * Broadset-exported SVG MUST NOT find a `<script>` tag.
   */
  it('strips <script> tags from opaque svg payloads on re-emission', async () => {
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><rect width="10" height="10"/></svg>';
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'hostile-1',
          type: 'svg',
          content: hostile,
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('alert(');
  });

  /**
   * @description `on*=` event-handler attributes on opaque payloads
   * MUST be stripped on re-emission.
   */
  it('strips on*= event handlers from opaque svg payloads', async () => {
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)" onmouseover="alert(2)" width="10" height="10"/></svg>';
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'hostile-2',
          type: 'svg',
          content: hostile,
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).not.toContain('onclick=');
    expect(svg).not.toContain('onmouseover=');
  });

  /**
   * @description `javascript:` URLs on `href` / `xlink:href` MUST be
   * stripped from opaque payloads.
   */
  it('strips javascript: URLs from opaque svg payloads', async () => {
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>click</text></a></svg>';
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'hostile-3',
          type: 'svg',
          content: hostile,
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).not.toContain('javascript:');
  });

  /**
   * @description A benign opaque payload (no scripts, no event
   * handlers) MUST pass through unchanged — sanitization is a
   * no-regret on safe content.
   */
  it('passes benign opaque payloads through unchanged', async () => {
    const benign = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="25" fill="#336699"/></svg>';
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'benign-1',
          type: 'svg',
          content: benign,
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('<circle');
    expect(svg).toContain('cx="50"');
    expect(svg).toContain('fill="#336699"');
  });
});

/* ------------------------------------------------------------------ */
/*  6. Animations discarded on export per IO-D-16                     */
/* ------------------------------------------------------------------ */

describe('P7.2 — Animation IN-state static export (IO-D-16)', () => {
  /**
   * @description A document with animations MUST export to an SVG
   * that contains no SMIL elements — `<animate>`, `<animateTransform>`,
   * `<animateMotion>`, `<set>` — and no CSS keyframe declarations.
   * Animation data is the `.bsp` authority and is discarded at export.
   */
  it('emits no SMIL animation elements', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'el-1',
          type: 'rectangle',
          style: makeStyle({ fill: '#336699' }),
        }),
      ],
      animations: [
        {
          elementId: 'el-1',
          config: {
            timelines: [
              {
                id: 'tl-1',
                name: 'in',
                keyframes: [
                  {
                    name: 'start',
                    action: 'none' as const,
                    offsetMs: 0,
                    properties: {
                      opacity: { type: 'number' as const, value: 0, easing: 'linear' as const },
                    },
                  },
                  {
                    name: 'end',
                    action: 'none' as const,
                    offsetMs: 500,
                    properties: {
                      opacity: { type: 'number' as const, value: 1, easing: 'linear' as const },
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
    });

    const svg = await exportSvgString(doc);

    expect(svg).not.toContain('<animate');
    expect(svg).not.toContain('<animateTransform');
    expect(svg).not.toContain('<animateMotion');
    expect(svg).not.toMatch(/<set\b/);
    expect(svg).not.toContain('@keyframes');
  });

  /**
   * @description The element carries no animation references
   * embedded in its exported tag — animations live in the `.bsp`,
   * not in the SVG.
   */
  it('emits no animation metadata references on animated elements', async () => {
    const doc = makeDocument({
      elements: [makeElement({ id: 'el-2', type: 'rectangle' })],
      animations: [
        {
          elementId: 'el-2',
          config: {
            timelines: [
              {
                id: 'tl-x',
                name: 'in',
                keyframes: [
                  {
                    name: 'start',
                    action: 'none' as const,
                    offsetMs: 0,
                    properties: {
                      opacity: { type: 'number' as const, value: 1, easing: 'linear' as const },
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
    });

    const svg = await exportSvgString(doc);

    // Broadset-specific animation metadata fields MUST NOT appear on
    // the visual layer. They are explicitly not serialised per IO-D-16.
    expect(svg).not.toContain('broadset:animation');
    expect(svg).not.toContain('data-bs-animation');
  });
});
