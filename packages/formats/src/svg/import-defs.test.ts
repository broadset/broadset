/**
 * P7.7l — `<filter>` / `<mask>` / `<pattern>` import.
 *
 * Per `project/spec/formats/svg.md` feature matrix, the SVG track
 * promises native round-trip for filter stacks, custom masks, and
 * pattern fills. Earlier loops emitted these on export but never
 * read them on import — re-importing a Broadset-exported SVG
 * silently lost every filter / mask / pattern. This unit closes
 * the asymmetry: a `<filter>` def referenced via `filter="url(#…)"`
 * hydrates back into a `style.filter` `FilterStack`; a `<mask>`
 * referenced via `mask="url(#…)"` hydrates the path back into
 * `customClipPath` and flips `maskType` to `'alpha'`; a `<pattern>`
 * fill referenced via `fill="url(#…)"` hydrates as a `pattern`
 * fill carrying the inner `<image href>` as the asset id.
 *
 * Closes the P7.7l fresh-review blocker #4 (filter / mask /
 * pattern import is missing entirely).
 */
import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetElementStyleInput,
  type Canvas,
  type FilterStack,
  styleSchema,
} from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportSvgString, importSvgDocument } from './index';

function makeCanvas(o: Partial<Canvas> = {}): Canvas {
  return {
    width: 200,
    height: 100,
    unit: 'px',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundColor: '#ffffff',
    backgroundMode: 'solid',
    ...o,
  };
}

function makeStyle(o: Partial<BroadsetElementStyleInput> = {}): BroadsetElementStyle {
  return styleSchema.parse({ opacity: 1, ...o });
}

function makeElement(o: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id: 'r',
    type: 'rectangle',
    name: '',
    content: '',
    position: { x: 0, y: 0 },
    width: 50,
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
    autoSize: 'fixed',
    locked: false,
    textPathElementId: null,
    booleanOperation: null,
    extensions: {},
    ...o,
  } as BroadsetElement;
}

function makeDocument(o: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return {
    id: 'd',
    name: '',
    documentMode: 'screen',
    canvas: makeCanvas(),
    elements: [],
    animations: [],
    pages: [],
    dataSchema: { fields: [] },
    ...o,
  } as BroadsetDocument;
}

function expectFilterStack(stack: FilterStack | undefined): FilterStack {
  if (stack === undefined) {
    throw new Error('expected style.filter to be defined');
  }

  return stack;
}

describe('P7.7l — <filter> import', () => {
  /**
   * @description `<feGaussianBlur stdDeviation="N">` MUST hydrate
   * as a `blur` primitive with the same `stdDeviation`.
   */
  it('hydrates feGaussianBlur as a blur FilterPrimitive', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="blur1"><feGaussianBlur stdDeviation="3.5"/></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" filter="url(#blur1)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);
    const first = stack[0];

    expect(stack).toHaveLength(1);

    if (first?.kind === 'blur') {
      expect(first.stdDeviation).toBeCloseTo(3.5, 5);
    } else {
      throw new Error('expected blur primitive');
    }
  });

  /**
   * @description `<feDropShadow dx dy stdDeviation flood-color>` MUST
   * hydrate as a `drop-shadow` primitive with the same offsets,
   * doubled stdDeviation (matching the export's halving), and color.
   */
  it('hydrates feDropShadow as a drop-shadow FilterPrimitive', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="ds"><feDropShadow dx="2" dy="4" stdDeviation="3" flood-color="#000000"/></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#ff0000" filter="url(#ds)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);
    const first = stack[0];

    if (first?.kind === 'drop-shadow') {
      expect(first.offsetX).toBeCloseTo(2, 5);
      expect(first.offsetY).toBeCloseTo(4, 5);
      // Export halves the blur (`stdDeviation = blur / 2`); import
      // doubles it back to recover the original CSS-equivalent value.
      expect(first.blur).toBeCloseTo(6, 5);
    } else {
      throw new Error('expected drop-shadow primitive');
    }
  });

  /**
   * @description `<feColorMatrix type="hueRotate" values="N">` MUST
   * hydrate as a `hue-rotate` SimpleAmountFilter (NOT a generic
   * `color-matrix` — the exporter emits the named hueRotate type
   * and the importer should round-trip it symmetrically).
   */
  it('hydrates feColorMatrix type="hueRotate" as a hue-rotate primitive', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="hr"><feColorMatrix type="hueRotate" values="45"/></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" filter="url(#hr)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);
    const first = stack[0];

    if (first?.kind === 'hue-rotate') {
      expect(first.amount).toBeCloseTo(45, 5);
    } else {
      throw new Error('expected hue-rotate primitive');
    }
  });

  /**
   * @description `<feColorMatrix type="matrix" values="…">` (the
   * generic 4×5 matrix form) MUST hydrate as a `color-matrix`
   * primitive carrying the matrix verbatim.
   */
  it('hydrates non-canonical feColorMatrix type="matrix" as a color-matrix primitive', () => {
    // A deliberately non-CSS-Filter-Effects-1 matrix (channel
    // mixing the importer cannot recover into grayscale/sepia)
    // MUST fall through to the generic `color-matrix` primitive
    // carrying the values verbatim.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="cm"><feColorMatrix type="matrix" values="0.5 0.5 0 0 0 0 0.5 0.5 0 0 0.5 0 0.5 0 0 0 0 0 1 0"/></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" filter="url(#cm)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);
    const first = stack[0];

    if (first?.kind === 'color-matrix') {
      expect(first.matrix).toHaveLength(20);
      expect(first.matrix[0]).toBeCloseTo(0.5, 5);
    } else {
      throw new Error(`expected color-matrix primitive, got ${first?.kind ?? 'undefined'}`);
    }
  });

  /**
   * @description An unrecognised filter primitive (e.g.,
   * `<feTurbulence>`) MUST hydrate as a `custom-svg` primitive
   * carrying the source markup verbatim, so re-export round-trips
   * the visual identity even when Broadset has no structured
   * representation.
   */
  it('hydrates unknown filter primitives as custom-svg', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="tu"><feTurbulence baseFrequency="0.05" numOctaves="2"/></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" filter="url(#tu)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);
    const first = stack[0];

    if (first?.kind === 'custom-svg') {
      expect(first.svg).toContain('feTurbulence');
    } else {
      throw new Error('expected custom-svg primitive for feTurbulence');
    }
  });

  /**
   * @description `<feComponentTransfer>` functions that use
   * non-linear transfer types (`gamma`, `table`, `discrete`) are
   * not representable by Broadset's named primitives and MUST
   * preserve as `custom-svg` so re-export keeps full visual/structural
   * fidelity.
   */
  it('hydrates non-linear feComponentTransfer as custom-svg', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="x1"><feComponentTransfer><feFuncR type="gamma" amplitude="1" exponent="0.8" offset="0"/><feFuncG type="gamma" amplitude="1" exponent="0.8" offset="0"/><feFuncB type="gamma" amplitude="1" exponent="0.8" offset="0"/></feComponentTransfer></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" filter="url(#x1)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);
    const first = stack[0];

    if (first?.kind === 'custom-svg') {
      expect(first.svg).toContain('feComponentTransfer');
      expect(first.svg).toContain('type="gamma"');
    } else {
      throw new Error(`expected custom-svg primitive, got ${first?.kind ?? 'undefined'}`);
    }
  });

  /**
   * @description Per-channel-different linear transfers cannot map
   * to a single named primitive and MUST preserve as `custom-svg`.
   */
  it('hydrates per-channel divergent feComponentTransfer as custom-svg', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="x2"><feComponentTransfer><feFuncR type="linear" slope="0.5" intercept="0.25"/><feFuncG type="linear" slope="0.4" intercept="0.3"/><feFuncB type="linear" slope="0.5" intercept="0.25"/></feComponentTransfer></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" filter="url(#x2)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);
    const first = stack[0];

    if (first?.kind === 'custom-svg') {
      expect(first.svg).toContain('feComponentTransfer');
      expect(first.svg).toContain('feFuncG');
    } else {
      throw new Error(`expected custom-svg primitive, got ${first?.kind ?? 'undefined'}`);
    }
  });

  /**
   * @description Multiple primitives in one `<filter>` MUST hydrate
   * as multiple entries in the FilterStack array, in source order.
   */
  it('hydrates multi-primitive filters as a FilterStack of multiple entries', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="m1"><feGaussianBlur stdDeviation="2"/><feColorMatrix type="hueRotate" values="90"/></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" filter="url(#m1)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);

    expect(stack).toHaveLength(2);
    expect(stack[0]?.kind).toBe('blur');
    expect(stack[1]?.kind).toBe('hue-rotate');
  });
});

describe('P7.7l — <mask> import', () => {
  /**
   * @description `mask="url(#m)"` referencing a `<mask>` def MUST
   * hydrate the inner `<path d>` into `style.customClipPath` AND
   * flip `style.maskType` to `'alpha'` (matching the export's
   * round-trip contract — see `renderMaskDef`).
   */
  it('hydrates mask url(#) → customClipPath + maskType="alpha"', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><mask id="m1" maskUnits="userSpaceOnUse"><path d="M 0 0 L 50 0 L 50 50 Z" fill="#ffffff"/></mask></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" mask="url(#m1)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');

    expect(rect?.style.customClipPath).toBe('M 0 0 L 50 0 L 50 50 Z');
    expect(rect?.style.maskType).toBe('alpha');
  });
});

describe('P7.7m — Filter structural fidelity (named-primitive recovery)', () => {
  /**
   * @description The exporter emits `grayscale(a)` as a 4×5
   * `<feColorMatrix>` (W3C canonical CSS Filter Effects 1
   * algorithm). The importer MUST recognise that canonical form
   * and recover the named `grayscale` primitive — otherwise a
   * single Broadset → SVG → Broadset round-trip downgrades the
   * structured filter to a generic `color-matrix` blob. Closes
   * the P7.7 production-grade gap #1.
   */
  it.each([
    ['grayscale', 0.5],
    ['grayscale', 0.25],
    ['sepia', 0.5],
    ['sepia', 0.8],
  ] as const)('round-trips %s(%s) as a named primitive after export → import', async (kind, amount) => {
    const doc = makeDocument({
      elements: [makeElement({ style: makeStyle({ filter: [{ kind, amount }] }) })],
    });
    const exported = await exportSvgString(doc);
    const { document } = importSvgDocument(exported);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const first = rect?.style.filter?.[0];

    expect(first?.kind).toBe(kind);

    if (first?.kind === kind) {
      expect((first as { readonly amount: number }).amount).toBeCloseTo(amount, 3);
    }
  });

  /**
   * @description `brightness(a)`, `contrast(a)`, `invert(a)` import
   * via `<feComponentTransfer>` with linear funcR/G/B. The
   * importer recovers the named primitive by inverting the
   * exporter's slope/intercept formulas:
   * - brightness: slope=a, intercept=0
   * - contrast:   slope=a, intercept=(1-a)/2  (same matrix as
   *               `invert((1-a)/2)`; the importer prefers
   *               `contrast` for non-negative slope)
   * - invert:     slope=1-2a, intercept=a (uniquely identifiable
   *               when slope < 0)
   */
  it('recovers brightness from feComponentTransfer (slope-only)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="b1"><feComponentTransfer><feFuncR type="linear" slope="1.4"/><feFuncG type="linear" slope="1.4"/><feFuncB type="linear" slope="1.4"/></feComponentTransfer></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" filter="url(#b1)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);
    const first = stack[0];

    if (first?.kind === 'brightness') {
      expect(first.amount).toBeCloseTo(1.4, 3);
    } else {
      throw new Error(`expected brightness, got ${first?.kind ?? 'undefined'}`);
    }
  });

  it('recovers invert from feComponentTransfer with negative slope', () => {
    // invert(0.7): slope = 1 - 2*0.7 = -0.4, intercept = 0.7
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="i1"><feComponentTransfer><feFuncR type="linear" slope="-0.4" intercept="0.7"/><feFuncG type="linear" slope="-0.4" intercept="0.7"/><feFuncB type="linear" slope="-0.4" intercept="0.7"/></feComponentTransfer></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" filter="url(#i1)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);
    const first = stack[0];

    if (first?.kind === 'invert') {
      expect(first.amount).toBeCloseTo(0.7, 3);
    } else {
      throw new Error(`expected invert, got ${first?.kind ?? 'undefined'}`);
    }
  });

  it('recovers contrast from feComponentTransfer with non-zero intercept', () => {
    // contrast(0.5): slope = 0.5, intercept = (1-0.5)/2 = 0.25
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="c1"><feComponentTransfer><feFuncR type="linear" slope="0.5" intercept="0.25"/><feFuncG type="linear" slope="0.5" intercept="0.25"/><feFuncB type="linear" slope="0.5" intercept="0.25"/></feComponentTransfer></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" filter="url(#c1)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);
    const first = stack[0];

    if (first?.kind === 'contrast') {
      expect(first.amount).toBeCloseTo(0.5, 3);
    } else {
      throw new Error(`expected contrast, got ${first?.kind ?? 'undefined'}`);
    }
  });

  /**
   * @description In the ambiguous `slope >= 0` + non-zero-intercept
   * region, `invert(a)` and `contrast(1 - 2a)` are mathematically
   * equivalent. Broadset-exported component transfers carry
   * `data-bs-filter-primitive` so importer recovery preserves the
   * authored primitive kind across round-trip.
   */
  it('prefers exporter hint for ambiguous invert/contrast component-transfer forms', () => {
    // invert(0.3) and contrast(0.4) both produce slope=0.4, intercept=0.3
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="amb"><feComponentTransfer data-bs-filter-primitive="invert"><feFuncR type="linear" slope="0.4" intercept="0.3"/><feFuncG type="linear" slope="0.4" intercept="0.3"/><feFuncB type="linear" slope="0.4" intercept="0.3"/></feComponentTransfer></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" filter="url(#amb)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);
    const first = stack[0];

    if (first?.kind === 'invert') {
      expect(first.amount).toBeCloseTo(0.3, 3);
    } else {
      throw new Error(`expected invert, got ${first?.kind ?? 'undefined'}`);
    }
  });
});

describe('P7.7m — Pattern transform + multi-shape mask', () => {
  /**
   * @description `<pattern patternTransform="…">` MUST round-trip
   * the affine into `style.fill.transform`. SVG `patternTransform`
   * is the same form as the element-level `transform` attr; the
   * importer parses it through the shared transform parser and
   * stores the 6-tuple matrix on the `PatternFill`. Closes the
   * P7.7 production-grade gap #2.
   */
  it('reads patternTransform into PatternFill.transform', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><pattern id="p1" patternUnits="userSpaceOnUse" width="50" height="50" patternTransform="translate(10 20) scale(2)"><image href="data:image/png;base64,iVBORw0KGgo" width="50" height="50"/></pattern></defs>
      <rect x="0" y="0" width="50" height="50" fill="url(#p1)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    if (fill?.kind === 'pattern' && fill.transform !== undefined) {
      // translate(10 20) ∘ scale(2) → matrix [2, 0, 0, 2, 10, 20]
      expect(fill.transform[0]).toBeCloseTo(2, 3);
      expect(fill.transform[3]).toBeCloseTo(2, 3);
      expect(fill.transform[4]).toBeCloseTo(10, 3);
      expect(fill.transform[5]).toBeCloseTo(20, 3);
    } else {
      throw new Error('expected pattern fill with transform');
    }
  });

  /**
   * @description A `<mask>` containing multiple shapes (e.g., a
   * `<rect>` and a `<path>`) MUST hydrate as a compound `d`
   * carrying both sub-paths concatenated. Earlier loops kept only
   * the first descendant `<path>` and silently dropped composite
   * masks. Closes the P7.7 production-grade gap #3.
   */
  it('reads multi-shape masks as a compound customClipPath', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><mask id="m1" maskUnits="userSpaceOnUse"><rect x="0" y="0" width="20" height="20" fill="#ffffff"/><circle cx="40" cy="10" r="10" fill="#ffffff"/></mask></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" mask="url(#m1)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const path = rect?.style.customClipPath ?? '';

    // Compound path: rect's `d` followed by circle's `d` — at least
    // two `M` commands must appear.
    const moveCount = (path.match(/M/g) ?? []).length;

    expect(moveCount).toBeGreaterThanOrEqual(2);
    expect(rect?.style.maskType).toBe('alpha');
  });
});

describe('P7.7l — <pattern> fill import', () => {
  /**
   * @description `fill="url(#p1)"` referencing a `<pattern>` whose
   * inner `<image href>` is a `data:image/png;base64,…` URI MUST
   * hydrate as a `pattern` fill carrying the data URI as the asset
   * id (so re-export round-trips byte-stably without a registry).
   */
  it('hydrates pattern fill with data: URI image as a pattern fill', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><pattern id="p1" patternUnits="userSpaceOnUse" width="50" height="50"><image href="${dataUri}" width="50" height="50"/></pattern></defs>
      <rect x="0" y="0" width="50" height="50" fill="url(#p1)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    expect(fill?.kind).toBe('pattern');

    if (fill?.kind === 'pattern') {
      expect(fill.assetId).toBe(dataUri);
    }
  });

  /**
   * @description A `<pattern>` whose inner `<image href>` is a
   * relative URL (e.g., `tile.png`) hydrates as a `pattern` fill
   * carrying the URL as the asset id — the round-trip preserves
   * the reference even though the bytes live elsewhere.
   */
  it('hydrates pattern fill with relative URL image as a pattern fill', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><pattern id="p2" patternUnits="userSpaceOnUse" width="50" height="50"><image href="tile.png" width="50" height="50"/></pattern></defs>
      <rect x="0" y="0" width="50" height="50" fill="url(#p2)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    if (fill?.kind === 'pattern') {
      expect(fill.assetId).toBe('tile.png');
    } else {
      throw new Error('expected pattern fill');
    }
  });
});
