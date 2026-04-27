/**
 * P7.7e — SVG shape positional attribute + polygon / polyline import.
 *
 * Covers third-party SVG positioning conventions the prior loops
 * silently dropped:
 *
 * - `<rect x="50" y="30" width="100" height="50"/>` — Illustrator
 *   and hand-authored SVG most commonly position rects via x/y
 *   attributes, NOT a wrapping `<g transform="translate(...)">`.
 * - `<circle cx cy r/>` and `<ellipse cx cy rx ry/>` — same pattern;
 *   centre at (cx, cy), Broadset stores top-left so we shift by r/rx/ry.
 * - `<polygon points="..."/>` and `<polyline points="..."/>` — every
 *   external SVG tool emits these; the prior importer dropped them
 *   into opaque-svg fallback.
 */
import { describe, expect, it } from 'vitest';

import { importSvgDocument } from './index';

describe('P7.7e — shape positional attributes', () => {
  /**
   * @description `<rect x="50" y="30">` MUST land at position
   * (50, 30) without a wrapping `transform=`.
   */
  it('imports <rect x y> at the declared corner', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect x="50" y="30" width="100" height="40"/>
    </svg>`;
    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');

    expect(rect?.position.x).toBeCloseTo(50, 1);
    expect(rect?.position.y).toBeCloseTo(30, 1);
    expect(rect?.width).toBeCloseTo(100, 1);
    expect(rect?.height).toBeCloseTo(40, 1);
  });

  /**
   * @description `<rect x y>` combines additively with a wrapping
   * `transform="translate"` so neither dominates.
   */
  it('combines <rect x y> with parent transform', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g transform="translate(10, 20)">
        <rect x="5" y="15" width="50" height="50"/>
      </g>
    </svg>`;
    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');

    expect(rect?.position.x).toBeCloseTo(15, 1);
    expect(rect?.position.y).toBeCloseTo(35, 1);
  });

  /**
   * @description `<circle cx="100" cy="50" r="20"/>` MUST land at
   * top-left (cx - r, cy - r) so the bounding box is consistent
   * with Broadset's `position` semantics.
   */
  it('imports <circle cx cy r> at the bounding-box top-left', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <circle cx="100" cy="50" r="20"/>
    </svg>`;
    const { document } = importSvgDocument(input);
    const ellipse = document.elements.find((el) => el.type === 'ellipse');

    expect(ellipse?.position.x).toBeCloseTo(80, 1);
    expect(ellipse?.position.y).toBeCloseTo(30, 1);
    expect(ellipse?.width).toBeCloseTo(40, 1);
    expect(ellipse?.height).toBeCloseTo(40, 1);
  });

  /**
   * @description `<ellipse cx cy rx ry/>` lands at top-left
   * (cx - rx, cy - ry) with width/height = 2 * radii.
   */
  it('imports <ellipse cx cy rx ry> at the bounding-box top-left', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <ellipse cx="100" cy="60" rx="40" ry="20"/>
    </svg>`;
    const { document } = importSvgDocument(input);
    const ellipse = document.elements.find((el) => el.type === 'ellipse');

    expect(ellipse?.position.x).toBeCloseTo(60, 1);
    expect(ellipse?.position.y).toBeCloseTo(40, 1);
    expect(ellipse?.width).toBeCloseTo(80, 1);
    expect(ellipse?.height).toBeCloseTo(40, 1);
  });
});

describe('P7.7e — third-party group hierarchy', () => {
  /**
   * @description A third-party SVG with `<g id="outer">` containing
   * `<rect>` MUST hydrate as two elements where the rect's
   * `parentId` references the imported group, NOT a flat list.
   * Closes the P7.7 review finding.
   */
  it('preserves <g id> parentId chain on third-party import', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g id="outer">
        <rect width="50" height="50"/>
        <rect width="50" height="50" x="60"/>
      </g>
    </svg>`;
    const { document } = importSvgDocument(input);

    const group = document.elements.find((el) => el.type === 'group');
    const rects = document.elements.filter((el) => el.type === 'rectangle');

    expect(group).toBeDefined();
    expect(rects).toHaveLength(2);
    expect(rects[0]?.parentId).toBe(group?.id);
    expect(rects[1]?.parentId).toBe(group?.id);
  });

  /**
   * @description An unnamed group's display `name` MUST be
   * `'Group'` rather than the synthetic path-derived id
   * (`g-0-2-1`). Closes the P7.7g review #4 cosmetic finding —
   * synthetic ids stay for round-trip stability but never reach
   * user-visible surfaces (layer panel, metadata).
   */
  it('uses a friendly Group name for unnamed third-party <g> elements', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <g><rect width="50" height="50"/></g>
    </svg>`;
    const { document } = importSvgDocument(input);
    const group = document.elements.find((el) => el.type === 'group');

    expect(group).toBeDefined();
    expect(group?.name).toBe('Group');
    expect(group?.id).toMatch(/^g-\d/); // structural id still preserved for round-trip
  });

  /**
   * @description An UNNAMED `<g>` (no `id` attribute, no
   * `data-bs-id`) — typical of Figma / Illustrator / Inkscape
   * exports — MUST still emit a Broadset `'group'` element with
   * its children linked via `parentId`, NOT silently flatten.
   * Closes the P7.7e review finding.
   */
  it('preserves <g> hierarchy even when neither data-bs-id nor id is present', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g transform="translate(10, 20)">
        <rect width="50" height="50"/>
        <rect width="50" height="50" x="60"/>
      </g>
    </svg>`;
    const { document } = importSvgDocument(input);
    const group = document.elements.find((el) => el.type === 'group');
    const rects = document.elements.filter((el) => el.type === 'rectangle');

    expect(group).toBeDefined();
    expect(rects).toHaveLength(2);
    expect(rects[0]?.parentId).toBe(group?.id);
    expect(rects[1]?.parentId).toBe(group?.id);
  });

  /**
   * @description Nested groups MUST nest in the resulting parentId
   * chain — the inner group's parentId references the outer group.
   */
  it('preserves nested <g id> hierarchy on third-party import', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g id="outer">
        <g id="inner">
          <rect width="50" height="50"/>
        </g>
      </g>
    </svg>`;
    const { document } = importSvgDocument(input);
    const groups = document.elements.filter((el) => el.type === 'group');
    const outer = groups.find((g) => g.id === 'outer');
    const inner = groups.find((g) => g.id === 'inner');
    const rect = document.elements.find((el) => el.type === 'rectangle');

    expect(outer).toBeDefined();
    expect(inner).toBeDefined();
    expect(inner?.parentId).toBe(outer?.id);
    expect(rect?.parentId).toBe(inner?.id);
  });
});

describe('P7.7e — polygon / polyline', () => {
  /**
   * @description `<polygon>` MUST import as a `path` element with
   * a closed `M ... L ... Z` d-string, NOT fall through to the
   * opaque-svg fallback.
   */
  it('imports <polygon> as a closed path', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <polygon points="10,10 50,10 50,50 10,50"/>
    </svg>`;
    const { document } = importSvgDocument(input);
    const path = document.elements.find((el) => el.type === 'path');

    expect(path).toBeDefined();
    expect(typeof path?.content).toBe('string');
    expect(path?.content).toMatch(/^M10,10/);
    expect(path?.content).toMatch(/Z$/);
  });

  /**
   * @description `<polyline>` MUST import as an OPEN path (no Z).
   */
  it('imports <polyline> as an open path', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <polyline points="10,10 50,10 50,50"/>
    </svg>`;
    const { document } = importSvgDocument(input);
    const path = document.elements.find((el) => el.type === 'path');

    expect(path).toBeDefined();
    expect(path?.content).toMatch(/^M10,10/);
    expect(path?.content).not.toMatch(/Z/);
  });

  /**
   * @description Comma-separated point lists (Illustrator default)
   * parse identically to whitespace-separated lists (Inkscape).
   */
  it('parses comma- and whitespace-separated point lists', () => {
    const wsInput = `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0 0 10 0 10 10"/></svg>`;
    const csInput = `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 10,0 10,10"/></svg>`;
    const ws = importSvgDocument(wsInput).document.elements.find((el) => el.type === 'path');
    const cs = importSvgDocument(csInput).document.elements.find((el) => el.type === 'path');

    expect(ws?.content).toBe(cs?.content);
  });
});
