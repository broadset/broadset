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
import { type FilterStack } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { importSvgDocument } from './index';

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
  it('hydrates feColorMatrix type="matrix" as a color-matrix primitive', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><filter id="cm"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" filter="url(#cm)"/>
    </svg>`;
    const { document } = importSvgDocument(svg);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const stack = expectFilterStack(rect?.style.filter);
    const first = stack[0];

    if (first?.kind === 'color-matrix') {
      expect(first.matrix).toHaveLength(20);
      expect(first.matrix[0]).toBeCloseTo(1, 5);
    } else {
      throw new Error('expected color-matrix primitive');
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
