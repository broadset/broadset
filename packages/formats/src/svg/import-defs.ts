/**
 * Importer-side `<defs>` reading. Owns gradient / clipPath /
 * filter / mask / pattern reconstruction so the orchestrator
 * (`import.ts`) stays focused on the element walk. Every entry
 * point on this module is pure: it consumes a parsed `Document`
 * and returns lookup maps the orchestrator threads through the
 * walk via the `DefsBundle` struct.
 *
 * Split out of `import.ts` in P7.7m to bring the orchestrator
 * back under the 500-line soft limit.
 */
import { buildClipPathsMap, buildMasksMap, buildPatternsMap } from './import-defs-geometry';
import {
  createSvgSourceColor,
  type SvgSourceColor,
  type SvgSourceFilterPrimitive,
  type SvgSourceFilterStack,
  type SvgSourceGradient,
  type SvgSourceGradientStop,
  type SvgSourcePatternFill,
} from './source-model';

/**
 * The collection of `<defs>` resolutions a single import pass
 * shares across every element. Bundled into one struct so the
 * recursive walk doesn't grow a parameter list every time we
 * support a new defs surface.
 */
export interface DefsBundle {
  readonly clipPaths: ReadonlyMap<string, string>;
  readonly gradients: ReadonlyMap<string, SvgSourceGradient>;
  readonly filters: ReadonlyMap<string, SvgSourceFilterStack>;
  readonly masks: ReadonlyMap<string, string>;
  readonly patterns: ReadonlyMap<string, SvgSourcePatternFill>;
}

/* ------------------------------------------------------------------ */
/*  Public entry points                                               */
/* ------------------------------------------------------------------ */

export function buildDefsBundle(doc: Document): DefsBundle {
  return {
    clipPaths: buildClipPathsMap(doc),
    gradients: buildGradientsMap(doc),
    filters: buildFiltersMap(doc),
    masks: buildMasksMap(doc),
    patterns: buildPatternsMap(doc),
  };
}

export function resolveClipPath(el: Element, clipPaths: ReadonlyMap<string, string>): string | undefined {
  const clipRef = el.getAttribute('clip-path');

  if (clipRef === null || clipRef === '') return undefined;

  const idMatch = /url\(#([^)]+)\)/.exec(clipRef);
  const clipId = idMatch?.[1];

  if (clipId !== undefined && clipPaths.has(clipId)) {
    return clipPaths.get(clipId);
  }

  return clipRef;
}

export function resolveGradientFill(
  fillAttr: string | null,
  gradients: ReadonlyMap<string, SvgSourceGradient>,
): SvgSourceGradient | undefined {
  const id = parseUrlRef(fillAttr);

  if (id === undefined) return undefined;

  return gradients.get(id);
}

export function resolveFilterStack(
  filterAttr: string | null,
  filters: ReadonlyMap<string, SvgSourceFilterStack>,
): SvgSourceFilterStack | undefined {
  const id = parseUrlRef(filterAttr);

  if (id === undefined) return undefined;

  return filters.get(id);
}

export function resolveMaskPath(maskAttr: string | null, masks: ReadonlyMap<string, string>): string | undefined {
  const id = parseUrlRef(maskAttr);

  if (id === undefined) return undefined;

  return masks.get(id);
}

export function resolvePatternFill(
  fillAttr: string | null,
  patterns: ReadonlyMap<string, SvgSourcePatternFill>,
): SvgSourcePatternFill | undefined {
  const id = parseUrlRef(fillAttr);

  if (id === undefined) return undefined;

  return patterns.get(id);
}

/* ------------------------------------------------------------------ */
/*  url(#id) reference parsing                                        */
/* ------------------------------------------------------------------ */

/**
 * Extract the id from a `url(#foo)` paint-server / filter / mask
 * reference. Returns `undefined` when the attribute is null or not
 * a `url(#…)` reference. Shared by gradient / filter / mask /
 * pattern resolvers — every SVG def reference uses this form.
 */
function parseUrlRef(attr: string | null): string | undefined {
  if (attr === null) return undefined;

  const match = /url\(\s*#([^)\s]+)\s*\)/.exec(attr);

  return match?.[1];
}

/* ------------------------------------------------------------------ */
/*  Gradient defs                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build a map of gradient id to source gradient data from every
 * `<linearGradient>` and `<radialGradient>` in the source. Both
 * top-level and `<defs>`-nested gradients are collected so inherited
 * `xlink:href` chains resolve correctly.
 */
function buildGradientsMap(doc: Document): ReadonlyMap<string, SvgSourceGradient> {
  const gradients = new Map<string, SvgSourceGradient>();

  collectLinearGradients(doc, gradients);
  collectRadialGradients(doc, gradients);

  return gradients;
}

function collectLinearGradients(doc: Document, out: Map<string, SvgSourceGradient>): void {
  const linears = doc.getElementsByTagName('linearGradient');

  for (let i = 0; i < linears.length; i++) {
    const el = linears[i];

    if (el === undefined) continue;

    const id = el.getAttribute('id');

    if (id === null || id === '') continue;

    const stops = parseGradientStops(el);

    if (stops.length < 2) continue;

    out.set(id, { type: 'linear', angle: deriveLinearAngle(el), stops });
  }
}

function collectRadialGradients(doc: Document, out: Map<string, SvgSourceGradient>): void {
  const radials = doc.getElementsByTagName('radialGradient');

  for (let i = 0; i < radials.length; i++) {
    const el = radials[i];

    if (el === undefined) continue;

    const id = el.getAttribute('id');

    if (id === null || id === '') continue;

    const stops = parseGradientStops(el);

    if (stops.length < 2) continue;

    const cx = parseFloat(el.getAttribute('cx') ?? '0.5');
    const cy = parseFloat(el.getAttribute('cy') ?? '0.5');

    out.set(id, { type: 'radial', center: [cx * 100, cy * 100], stops });
  }
}

/**
 * Parse the `<stop>` children of a gradient element into the
 * Broadset structured stop array. `stop-color` accepts any CSS
 * colour; unparsable values default to opaque black so the stop is
 * never silently dropped per IO-D-18.
 */
function parseGradientStops(gradientEl: Element): readonly SvgSourceGradientStop[] {
  const stops: SvgSourceGradientStop[] = [];
  const children = gradientEl.getElementsByTagName('stop');

  for (let i = 0; i < children.length; i++) {
    const stop = children[i];

    if (stop === undefined) continue;

    const offset = parseGradientOffset(stop.getAttribute('offset'));
    const colorRaw = stop.getAttribute('stop-color') ?? '#000000';

    stops.push({ color: createSvgSourceColor(colorRaw), position: offset });
  }

  return stops;
}

/**
 * Parse an SVG `offset` attribute (`0`, `1`, `50%`, `0.5`) into the
 * Broadset 0-100 position range. SVG 2 accepts both fractional
 * (0-1) and percentage (`0%`-`100%`) forms — we normalise both to
 * 0-100 so the model schema accepts them.
 */
function parseGradientOffset(raw: string | null): number {
  if (raw === null || raw === '') return 0;

  const trimmed = raw.trim();
  const hasPercent = trimmed.endsWith('%');
  const numeric = parseFloat(hasPercent ? trimmed.slice(0, -1) : trimmed);

  if (!Number.isFinite(numeric)) return 0;

  if (hasPercent) return clampPercent(numeric);

  if (numeric <= 1) return clampPercent(numeric * 100);

  return clampPercent(numeric);
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/**
 * Derive a linear-gradient angle from the SVG `x1/y1/x2/y2`
 * direction. Returns degrees clockwise from the 12-o'clock
 * (0° = top), matching CSS `linear-gradient(<angle>, ...)`.
 */
function deriveLinearAngle(gradientEl: Element): number {
  const x1 = parseFloat(gradientEl.getAttribute('x1') ?? '0');
  const y1 = parseFloat(gradientEl.getAttribute('y1') ?? '0');
  const x2 = parseFloat(gradientEl.getAttribute('x2') ?? '1');
  const y2 = parseFloat(gradientEl.getAttribute('y2') ?? '0');
  const angleDeg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const cssAngle = (90 - angleDeg + 360) % 360;

  return Math.round(cssAngle * 100) / 100;
}

/* ------------------------------------------------------------------ */
/*  Filter defs                                                       */
/* ------------------------------------------------------------------ */

const FILTER_RECOVERY_EPS = 1e-3;

/**
 * Build a map of filter id to source filter data from every `<filter>`
 * def. Each filter primitive (`<feGaussianBlur>`, `<feColorMatrix>`,
 * `<feDropShadow>`, `<feComponentTransfer>`) hydrates to its
 * corresponding source primitive shape; the recovery path tries
 * to identify the named CSS Filter Effects 1 primitives the
 * exporter emits before falling back to opaque `color-matrix` /
 * `custom-svg`. Closes the P7.7l review #4 blocker and the
 * P7.7m production-grade gap #1.
 */
function buildFiltersMap(doc: Document): ReadonlyMap<string, SvgSourceFilterStack> {
  const map = new Map<string, SvgSourceFilterStack>();
  const filters = doc.getElementsByTagName('filter');

  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];

    if (filter === undefined) continue;

    const id = filter.getAttribute('id');

    if (id === null || id === '') continue;

    const stack = readFilterStack(filter);

    if (stack.length === 0) continue;

    map.set(id, stack);
  }

  return map;
}

function readFilterStack(filter: Element): SvgSourceFilterStack {
  const stack: SvgSourceFilterPrimitive[] = [];
  const children = filter.children;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (child === undefined) continue;

    const primitive = readFilterPrimitive(child);

    if (primitive !== undefined) stack.push(primitive);
  }

  return stack;
}

function readFilterPrimitive(el: Element): SvgSourceFilterPrimitive | undefined {
  const tag = el.tagName.toLowerCase();

  if (tag === 'fegaussianblur') return readBlurPrimitive(el);
  if (tag === 'fedropshadow') return readDropShadowPrimitive(el);
  if (tag === 'fecolormatrix') return readColorMatrixPrimitive(el);
  if (tag === 'fecomponenttransfer') return readComponentTransferPrimitive(el);

  // Every other primitive (`<feTurbulence>`, `<feMorphology>`,
  // `<feConvolveMatrix>`, etc.) preserves verbatim as `custom-svg`.
  // The exporter sanitises before emission per the filter-stack
  // docs, so the re-import → re-export pass stays safe.
  return { kind: 'custom-svg', svg: el.outerHTML };
}

function readBlurPrimitive(el: Element): SvgSourceFilterPrimitive | undefined {
  const sd = parseFloat(el.getAttribute('stdDeviation') ?? '0');

  if (!Number.isFinite(sd) || sd < 0) return undefined;

  return { kind: 'blur', stdDeviation: sd };
}

function readDropShadowPrimitive(el: Element): SvgSourceFilterPrimitive | undefined {
  const dx = parseFloat(el.getAttribute('dx') ?? '0');
  const dy = parseFloat(el.getAttribute('dy') ?? '0');
  // Export halves the blur via `stdDeviation = blur / 2`; double
  // it back so the round-trip recovers the original value.
  const sd = parseFloat(el.getAttribute('stdDeviation') ?? '0');

  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(sd)) return undefined;

  const flood = el.getAttribute('flood-color') ?? '#000000';
  const color = parseHexColor(flood);

  return { kind: 'drop-shadow', offsetX: dx, offsetY: dy, blur: sd * 2, color };
}

function readColorMatrixPrimitive(el: Element): SvgSourceFilterPrimitive | undefined {
  const type = (el.getAttribute('type') ?? 'matrix').toLowerCase();
  const valuesStr = el.getAttribute('values') ?? '';

  if (type === 'huerotate' || type === 'saturate') {
    const amount = parseFloat(valuesStr);

    if (!Number.isFinite(amount)) return undefined;

    return { kind: type === 'huerotate' ? 'hue-rotate' : 'saturate', amount };
  }

  const matrix = valuesStr
    .split(/[\s,]+/)
    .filter((s) => s !== '')
    .map(parseFloat)
    .filter((n) => Number.isFinite(n));

  if (matrix.length === 0) return undefined;

  // Try to recover the named CSS Filter Effects 1 primitives
  // (`grayscale(a)` / `sepia(a)`) the exporter emits as canonical
  // 4×5 matrices. Without this, an export → import round-trip
  // downgrades structured filters to opaque `color-matrix` blobs.
  const grayscale = recoverGrayscale(matrix);

  if (grayscale !== undefined) return grayscale;

  const sepia = recoverSepia(matrix);

  if (sepia !== undefined) return sepia;

  return { kind: 'color-matrix', matrix };
}

function recoverGrayscale(matrix: readonly number[]): SvgSourceFilterPrimitive | undefined {
  if (matrix.length !== 20) return undefined;

  // Recover `a` from matrix[0]: m0 = 0.2126 + 0.7874 * (1 - a).
  const m0 = matrix[0] ?? 0;
  const oneMinusA = (m0 - 0.2126) / 0.7874;
  const amount = 1 - oneMinusA;

  if (amount < -FILTER_RECOVERY_EPS || amount > 1 + FILTER_RECOVERY_EPS) return undefined;

  if (!matricesMatch(matrix, canonicalGrayscaleMatrix(amount))) return undefined;

  return { kind: 'grayscale', amount: clamp01(amount) };
}

function recoverSepia(matrix: readonly number[]): SvgSourceFilterPrimitive | undefined {
  if (matrix.length !== 20) return undefined;

  const m0 = matrix[0] ?? 0;
  const oneMinusA = (m0 - 0.393) / 0.607;
  const amount = 1 - oneMinusA;

  if (amount < -FILTER_RECOVERY_EPS || amount > 1 + FILTER_RECOVERY_EPS) return undefined;

  if (!matricesMatch(matrix, canonicalSepiaMatrix(amount))) return undefined;

  return { kind: 'sepia', amount: clamp01(amount) };
}

function canonicalGrayscaleMatrix(amount: number): readonly number[] {
  const a = clamp01(amount);
  const inv = 1 - a;

  return [
    0.2126 + 0.7874 * inv,
    0.7152 - 0.7152 * inv,
    0.0722 - 0.0722 * inv,
    0,
    0,
    0.2126 - 0.2126 * inv,
    0.7152 + 0.2848 * inv,
    0.0722 - 0.0722 * inv,
    0,
    0,
    0.2126 - 0.2126 * inv,
    0.7152 - 0.7152 * inv,
    0.0722 + 0.9278 * inv,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ];
}

function canonicalSepiaMatrix(amount: number): readonly number[] {
  const a = clamp01(amount);
  const inv = 1 - a;

  return [
    0.393 + 0.607 * inv,
    0.769 - 0.769 * inv,
    0.189 - 0.189 * inv,
    0,
    0,
    0.349 - 0.349 * inv,
    0.686 + 0.314 * inv,
    0.168 - 0.168 * inv,
    0,
    0,
    0.272 - 0.272 * inv,
    0.534 - 0.534 * inv,
    0.131 + 0.869 * inv,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ];
}

function matricesMatch(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > FILTER_RECOVERY_EPS) return false;
  }

  return true;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;

  return n;
}

/**
 * Recover a named primitive from `<feComponentTransfer>` with
 * linear funcR/G/B. The exporter emits three forms (see
 * `renderInvert/Brightness/ContrastComponentTransfer`):
 * - brightness(a): slope=a, intercept=0
 * - invert(a):     slope=1-2a, intercept=a
 * - contrast(a):   slope=a, intercept=(1-a)/2
 */
function readComponentTransferPrimitive(el: Element): SvgSourceFilterPrimitive | undefined {
  const funcs = ['feFuncR', 'feFuncG', 'feFuncB'].map((name) => el.getElementsByTagName(name)[0]);

  if (funcs.some((f) => f === undefined)) {
    return { kind: 'custom-svg', svg: el.outerHTML };
  }

  const params = funcs.map(readLinearTransferParams);
  const [r, g, b] = params;

  if (r === undefined || g === undefined || b === undefined) {
    return { kind: 'custom-svg', svg: el.outerHTML };
  }

  // All three channels must agree (the exporter emits identical
  // funcR/G/B for the named primitives). Otherwise it's a custom
  // per-channel transfer we can't represent natively.
  if (
    Math.abs(r.slope - g.slope) > FILTER_RECOVERY_EPS ||
    Math.abs(r.slope - b.slope) > FILTER_RECOVERY_EPS ||
    Math.abs(r.intercept - g.intercept) > FILTER_RECOVERY_EPS ||
    Math.abs(r.intercept - b.intercept) > FILTER_RECOVERY_EPS
  ) {
    return { kind: 'custom-svg', svg: el.outerHTML };
  }

  // Broadset-exported `<feComponentTransfer>` carries
  // `data-bs-filter-primitive` so mathematically equivalent
  // invert/contrast forms preserve authored semantics on import.
  const hinted = recoverHintedLinearTransfer(el, r.slope, r.intercept);

  if (hinted !== undefined) {
    return hinted;
  }

  return classifyLinearTransfer(r.slope, r.intercept) ?? { kind: 'custom-svg', svg: el.outerHTML };
}

type ComponentTransferHint = 'invert' | 'brightness' | 'contrast';

function readComponentTransferHint(el: Element): ComponentTransferHint | undefined {
  const raw = (el.getAttribute('data-bs-filter-primitive') ?? '').trim().toLowerCase();

  if (raw === 'invert' || raw === 'brightness' || raw === 'contrast') {
    return raw;
  }

  return undefined;
}

function recoverHintedLinearTransfer(
  el: Element,
  slope: number,
  intercept: number,
): SvgSourceFilterPrimitive | undefined {
  const hint = readComponentTransferHint(el);

  if (hint === undefined) {
    return undefined;
  }

  if (hint === 'brightness') {
    if (Math.abs(intercept) < FILTER_RECOVERY_EPS) {
      return { kind: 'brightness', amount: slope };
    }

    return undefined;
  }

  // Both invert(a) and contrast(a) satisfy slope + 2*intercept = 1.
  if (Math.abs(slope + 2 * intercept - 1) >= FILTER_RECOVERY_EPS) {
    return undefined;
  }

  if (hint === 'invert') {
    return { kind: 'invert', amount: intercept };
  }

  return { kind: 'contrast', amount: slope };
}

interface LinearTransferParams {
  readonly slope: number;
  readonly intercept: number;
}

function readLinearTransferParams(func: Element | undefined): LinearTransferParams | undefined {
  if (func === undefined) return undefined;
  if ((func.getAttribute('type') ?? '').toLowerCase() !== 'linear') return undefined;

  const slope = parseFloat(func.getAttribute('slope') ?? '1');
  const intercept = parseFloat(func.getAttribute('intercept') ?? '0');

  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return undefined;

  return { slope, intercept };
}

function classifyLinearTransfer(slope: number, intercept: number): SvgSourceFilterPrimitive | undefined {
  if (Math.abs(intercept) < FILTER_RECOVERY_EPS) {
    return { kind: 'brightness', amount: slope };
  }

  if (slope < -FILTER_RECOVERY_EPS) {
    // Only invert(a) with a > 0.5 produces slope < 0:
    // slope = 1 - 2a, intercept = a → amount = intercept.
    if (Math.abs(slope + 2 * intercept - 1) < FILTER_RECOVERY_EPS) {
      return { kind: 'invert', amount: intercept };
    }

    return undefined;
  }

  // slope ≥ 0 with non-zero intercept: prefer contrast over the
  // mathematically-equivalent invert form.
  if (Math.abs(slope + 2 * intercept - 1) < FILTER_RECOVERY_EPS) {
    return { kind: 'contrast', amount: slope };
  }

  return undefined;
}

/**
 * Preserve a CSS color string in the source-color envelope. Hex
 * values remain canonical while other CSS syntaxes are retained as
 * `originalColor` for the v1 color mapper.
 */
function parseHexColor(input: string): SvgSourceColor {
  return createSvgSourceColor(input);
}
