import { type BroadsetElementStyleInput } from '@broadset/model';
import { compose as composeMatrix, type Matrix } from 'transformation-matrix';

import { type TransformState } from './import-types';
import { type DecomposedTransform, decomposeMatrix, parseAndDecomposeTransform } from './transform';

export const IDENTITY_MATRIX: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function parseTransform(transformStr: string): {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly requiresBake: boolean;
  readonly matrix: DecomposedTransform['matrix'];
} {
  const decomposed = parseAndDecomposeTransform(transformStr);

  return {
    x: decomposed.tx,
    y: decomposed.ty,
    rotation: decomposed.rotation,
    requiresBake: decomposed.requiresBake,
    matrix: decomposed.matrix,
  };
}

export function combineTransform(base: TransformState, next: TransformState): TransformState {
  // Always compose matrices and re-decompose. The previous
  // additive fast-path (when neither side baked) silently dropped
  // the cumulative matrix to identity, causing ancestor translates
  // to vanish the moment a descendant baked (P7 review finding).
  // Matrix composition is cheap and the decomposition pipeline is
  // shared with `parseAndDecomposeTransform` so the skew / NaN
  // logic lives in one place.
  const composed = composeMatrix(base.matrix, next.matrix);
  const decomposed = decomposeMatrix(composed);

  return {
    x: decomposed.tx,
    y: decomposed.ty,
    rotation: decomposed.rotation,
    matrix: decomposed.matrix,
    // The CUMULATIVE matrix is the source of truth - its
    // `requiresBake` flag captures whether the composed scale /
    // skew survives. ORing in `base.requiresBake` was wrong: a
    // `<g scale(2)><g scale(0.5)>` chain composes to identity, no
    // bake needed, but the sticky OR baked the leaf to a path
    // anyway (P7 review finding). Trust the decomposition.
    requiresBake: decomposed.requiresBake,
  };
}

export function getAttr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

/**
 * Look up `name` on `el`; if absent, walk `parentElement` up
 * until a value is found or the root is hit. Implements SVG 1.1
 * presentation-attribute inheritance (section 6.4 / 11.4) - without
 * this, real-world icon fixtures lose root-level `stroke` / `fill`
 * / `stroke-width` declared on the wrapping `<svg>`.
 */
export function getInheritedAttr(el: Element, name: string): string | null {
  let cursor: Element | null = el;

  while (cursor !== null) {
    const value = cursor.getAttribute(name);

    if (value !== null && value !== '') {
      return value;
    }

    cursor = cursor.parentElement;
  }

  return null;
}

/**
 * Read inherited stroke style overrides (`stroke-width`,
 * `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`,
 * `stroke-dasharray`, `stroke-dashoffset`) from the element or
 * any ancestor. Each maps to the camelCase Broadset style key.
 * Returns an object that's spread into the importer's
 * `baseStyle`; absent attrs are omitted entirely.
 */
export function readInheritedStrokeStyle(el: Element): Partial<BroadsetElementStyleInput> {
  const out: Record<string, string | number> = {};
  const widthRaw = getInheritedAttr(el, 'stroke-width');
  const linecap = getInheritedAttr(el, 'stroke-linecap');
  const linejoin = getInheritedAttr(el, 'stroke-linejoin');
  const miterRaw = getInheritedAttr(el, 'stroke-miterlimit');
  const dasharray = getInheritedAttr(el, 'stroke-dasharray');
  const dashoffsetRaw = getInheritedAttr(el, 'stroke-dashoffset');

  if (widthRaw !== null) {
    const width = parseFloat(widthRaw);

    if (Number.isFinite(width)) out['strokeWidth'] = width;
  }

  if (linecap === 'butt' || linecap === 'round' || linecap === 'square') {
    out['strokeLinecap'] = linecap;
  }

  if (linejoin === 'miter' || linejoin === 'round' || linejoin === 'bevel') {
    out['strokeLinejoin'] = linejoin;
  }

  if (miterRaw !== null) {
    const miter = parseFloat(miterRaw);

    if (Number.isFinite(miter)) out['strokeMiterlimit'] = miter;
  }

  if (dasharray !== null && dasharray !== '') {
    out['strokeDasharray'] = dasharray;
  }

  if (dashoffsetRaw !== null) {
    const dashoffset = parseFloat(dashoffsetRaw);

    if (Number.isFinite(dashoffset)) out['strokeDashoffset'] = dashoffset;
  }

  return out;
}

export function getNumAttr(el: Element, name: string, defaultVal: number): number {
  const val = el.getAttribute(name);

  return val !== null ? parseFloat(val) : defaultVal;
}
