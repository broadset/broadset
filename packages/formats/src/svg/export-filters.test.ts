/**
 * P7.7h — SVG export of structured `FilterStack` primitives.
 *
 * Per `project/spec/formats/svg.md` feature matrix, the exporter
 * MUST emit native SVG filter primitives for every Broadset
 * `FilterPrimitive`:
 *
 * - `blur` → `<feGaussianBlur>`
 * - `color-matrix` → `<feColorMatrix>` with the supplied matrix
 * - `hue-rotate` → `<feColorMatrix type="hueRotate">`
 * - `saturate` / `grayscale` / `sepia` → `<feColorMatrix>` (the
 *   browser-canonical matrix forms)
 * - `invert` / `brightness` / `contrast` → `<feComponentTransfer>`
 *   with linear funcR / funcG / funcB
 * - `drop-shadow` → `<feDropShadow>` (already shipping via
 *   `boxShadow`; this path covers the structured primitive too)
 *
 * Earlier loops only shipped `boxShadow` → `<feDropShadow>`. Other
 * filter primitives produced no SVG primitive — silent visual loss.
 * The feature matrix promised "native" coverage; this suite holds
 * the implementation to that.
 */
import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetElementStyleInput,
  type Canvas,
  styleSchema,
} from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportSvgString } from './index';

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 400,
    height: 300,
    unit: 'px',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundColor: '#ffffff',
    backgroundMode: 'solid',
    ...overrides,
  };
}

function makeStyle(overrides: Partial<BroadsetElementStyleInput> = {}): BroadsetElementStyle {
  return styleSchema.parse({ opacity: 1, ...overrides });
}

function makeElement(overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id: `el-${String(Math.random()).slice(2, 8)}`,
    type: 'rectangle',
    name: '',
    content: '',
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
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
    autoSize: 'fixed',
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
    name: 'T',
    documentMode: 'screen',
    canvas: makeCanvas(),
    elements: [],
    animations: [],
    pages: [],
    dataSchema: { fields: [] },
    ...overrides,
  } as BroadsetDocument;
}

describe('P7.7h — Filter primitive export', () => {
  /**
   * @description A structured `blur` primitive on `style.filter`
   * MUST emit a `<feGaussianBlur>` primitive in the element's
   * `<filter>` def with the supplied `stdDeviation`.
   */
  it('emits <feGaussianBlur> for a blur filter primitive', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'rect-blur',
          style: makeStyle({ filter: [{ kind: 'blur', stdDeviation: 4 }] }),
        }),
      ],
    });
    const svg = await exportSvgString(doc);
    const filterMatch = /<filter id="(filter-[^"]+)"/.exec(svg);

    expect(filterMatch).not.toBeNull();
    expect(svg).toMatch(/<feGaussianBlur[^/]*stdDeviation="4"/);
    expect(svg).toContain(`filter="url(#${filterMatch?.[1] ?? ''})"`);
  });

  /**
   * @description `hue-rotate` MUST emit `<feColorMatrix
   * type="hueRotate" values="${deg}">`. Pinning the exact attr
   * shape because consumer browsers reject `values` as a number
   * vs string ambiguity in some renderers.
   */
  it('emits <feColorMatrix type="hueRotate"> for a hue-rotate primitive', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'rect-hr',
          style: makeStyle({ filter: [{ kind: 'hue-rotate', amount: 45 }] }),
        }),
      ],
    });
    const svg = await exportSvgString(doc);

    expect(svg).toMatch(/<feColorMatrix[^/]*type="hueRotate"[^/]*values="45"/);
  });

  /**
   * @description `saturate` MUST emit `<feColorMatrix
   * type="saturate" values="${amount}">` (the SVG-native form).
   */
  it('emits <feColorMatrix type="saturate"> for a saturate primitive', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'rect-sat',
          style: makeStyle({ filter: [{ kind: 'saturate', amount: 2 }] }),
        }),
      ],
    });
    const svg = await exportSvgString(doc);

    expect(svg).toMatch(/<feColorMatrix[^/]*type="saturate"[^/]*values="2"/);
  });

  /**
   * @description `grayscale(1)` MUST emit a 4x5 luminance matrix
   * via `<feColorMatrix type="matrix">`. Browsers handle this
   * uniformly; emitting the matrix form is portable.
   */
  it('emits <feColorMatrix type="matrix"> for grayscale', async () => {
    const doc = makeDocument({
      elements: [makeElement({ id: 'rect-gs', style: makeStyle({ filter: [{ kind: 'grayscale', amount: 1 }] }) })],
    });
    const svg = await exportSvgString(doc);

    expect(svg).toMatch(/<feColorMatrix[^/]*type="matrix"[^/]*values="[\d. -]+"/);
  });

  /**
   * @description A structured `color-matrix` MUST emit its raw
   * `matrix` array verbatim into `values=`. The exporter is a
   * pass-through for caller-authored matrices.
   */
  it('emits <feColorMatrix> for a structured color-matrix primitive', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'rect-cm',
          // Identity 4x5 matrix
          style: makeStyle({
            filter: [{ kind: 'color-matrix', matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] }],
          }),
        }),
      ],
    });
    const svg = await exportSvgString(doc);

    expect(svg).toMatch(/<feColorMatrix[^/]*values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/);
  });

  /**
   * @description `invert(1)` and `brightness(0.5)` MUST emit
   * `<feComponentTransfer>` with linear funcR / funcG / funcB
   * (the SVG canonical form for amount-based RGB shifts).
   */
  it('emits <feComponentTransfer> for invert and brightness', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'rect-iv', style: makeStyle({ filter: [{ kind: 'invert', amount: 1 }] }) }),
        makeElement({ id: 'rect-br', style: makeStyle({ filter: [{ kind: 'brightness', amount: 0.5 }] }) }),
      ],
    });
    const svg = await exportSvgString(doc);

    expect(svg).toMatch(/<feComponentTransfer[\s\S]*<feFuncR/);
  });

  /**
   * @description Two elements that share the same FilterStack
   * MUST share a single `<filter>` def by content hash — same
   * deduplication contract as gradients / clip-paths / shadows.
   */
  it('deduplicates identical filter stacks across elements', async () => {
    const sharedFilter = [{ kind: 'blur', stdDeviation: 4 }] as const;
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'a', style: makeStyle({ filter: [...sharedFilter] }) }),
        makeElement({ id: 'b', style: makeStyle({ filter: [...sharedFilter] }) }),
      ],
    });
    const svg = await exportSvgString(doc);
    const filters = svg.match(/<filter /g) ?? [];
    const filterRefs = svg.match(/filter="url\(#filter-[^)]+\)"/g) ?? [];

    expect(filters).toHaveLength(1);
    expect(filterRefs).toHaveLength(2);
    expect(new Set(filterRefs).size).toBe(1);
  });
});

describe('P7.7h — Pattern fill export', () => {
  /**
   * @description A `pattern` fill referencing an asset MUST emit
   * a `<pattern>` def in `<defs>` and reference it via
   * `fill="url(#…)"`. The pattern body uses the asset id (looked
   * up by the consumer) — for standalone SVGs the consumer needs
   * the asset registry; we still emit the structural reference.
   */
  it('emits <pattern> def for fill.kind === "pattern"', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'rect-p',
          style: makeStyle({
            fill: { kind: 'pattern', assetId: 'tile-1', repeat: 'repeat' },
          }),
        }),
      ],
    });
    const svg = await exportSvgString(doc);
    const patternMatch = /<pattern id="(pattern-[^"]+)"/.exec(svg);

    expect(patternMatch).not.toBeNull();
    expect(svg).toContain(`fill="url(#${patternMatch?.[1] ?? ''})"`);
    // Pattern body references the asset id so consumers can resolve.
    expect(svg).toMatch(/<image[^/]*href="[^"]*tile-1[^"]*"/);
  });

  /**
   * @description A `picture` fill (single image, no repeat) MUST
   * emit a `<pattern>` def as well — the same shape, with
   * `width` / `height` matching the element so the image stretches
   * to the box without tiling.
   */
  it('emits <pattern> def for fill.kind === "picture"', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'rect-pic',
          style: makeStyle({
            fill: { kind: 'picture', assetId: 'photo-1', mode: 'stretch' },
          }),
        }),
      ],
    });
    const svg = await exportSvgString(doc);

    expect(svg).toMatch(/<pattern id="pattern-/);
    expect(svg).toMatch(/<image[^/]*href="[^"]*photo-1[^"]*"/);
  });
});

describe('P7.7h — Mask export', () => {
  /**
   * @description An element with `style.maskType !== 'none'` AND
   * a `customClipPath` MUST emit a `<mask>` def carrying the
   * clip path geometry, and reference it via `mask="url(#…)"`.
   * Closes the spec feature-matrix `<mask>` row.
   */
  it('emits <mask> def for elements with a custom mask shape', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'rect-m',
          style: makeStyle({
            maskType: 'alpha',
            customClipPath: 'M0,0 L100,0 L100,100 L0,100 Z',
          }),
        }),
      ],
    });
    const svg = await exportSvgString(doc);
    const maskMatch = /<mask id="(mask-[^"]+)"/.exec(svg);

    expect(maskMatch).not.toBeNull();
    expect(svg).toContain(`mask="url(#${maskMatch?.[1] ?? ''})"`);
    expect(svg).toMatch(/<mask[^>]*>[\s\S]*<path[^/]*d="M0,0 L100,0 L100,100 L0,100 Z"[\s\S]*<\/mask>/);
  });
});
