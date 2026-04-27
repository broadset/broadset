import { type BroadsetElementStyleInput } from '@broadset/model';

import {
  buildDefsBundle,
  type DefsBundle,
  resolveClipPath,
  resolveFilterStack,
  resolveGradientFill,
  resolveMaskPath,
  resolvePatternFill,
} from './import-defs';
import { SVG_ELEMENT_COUNT_CAP } from './import-security';
import {
  importCircleElement,
  importEllipseElement,
  importImageElement,
  importLineElement,
  importPathElement,
  importPolygonElement,
  importRectElement,
} from './import-shapes';
import {
  combineTransform,
  getAttr,
  getInheritedAttr,
  getNumAttr,
  IDENTITY_MATRIX,
  parseTransform,
  readInheritedStrokeStyle,
} from './import-style';
import { importTextElement } from './import-text';
import { type ImportedElement, type ShapeBakeContext, type TransformState } from './import-types';
import type { SvgFontSource } from './types';

/**
 * Group-depth cap per the importer security contract. Bounds the
 * recursion in `importGroupElement` so a deeply nested `<g>` chain
 * cannot overflow the V8 stack. 100 levels covers any realistic
 * design-tool layer hierarchy.
 */
const DEFAULT_SVG_GROUP_DEPTH_CAP = 100;

export interface SvgWalkOptions {
  readonly fontSources?: ReadonlyMap<string, SvgFontSource> | undefined;
  readonly maxDepth?: number | undefined;
  readonly warnOnPreservation?: boolean | undefined;
}

export interface SvgImportResult {
  readonly elements: readonly ImportedElement[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly warnings: readonly string[];
}

function importUnsupportedElement(el: Element, transform: TransformState, warnings: string[]): ImportedElement {
  const tagName = el.tagName.toLowerCase();

  warnings.push(`Preserved unsupported SVG element as payload: <${tagName}>`);

  return {
    type: 'svg',
    content: el.outerHTML,
    position: { x: transform.x, y: transform.y },
    width: getNumAttr(el, 'width', 0),
    height: getNumAttr(el, 'height', 0),
    rotation: transform.rotation,
    style: {},
  };
}

interface GroupImportContext {
  readonly transformStr: string;
  readonly transform: TransformState;
  readonly baseStyle: Partial<BroadsetElementStyleInput>;
  readonly ownDataBsId: string | undefined;
  readonly ownDataBsKind: string | undefined;
  readonly tagMeta: Readonly<{
    readonly dataBsId?: string;
    readonly dataBsKind?: string;
    readonly parentDataBsId: string | null;
  }>;
  readonly parentDataBsId: string | null;
  readonly defs: DefsBundle;
  readonly warnings: string[];
  readonly depth: number;
  readonly maxDepth: number;
  readonly fontSources?: ReadonlyMap<string, SvgFontSource> | undefined;
}

/**
 * Handle the `<g>` element case during the visual walk. The group
 * descends into children and links them via `parentDataBsId`. When
 * the group's transform requires bake (scale / skew / non-
 * decomposable matrix), the cumulative matrix is threaded down
 * through `ctx.transform.matrix` so each leaf shape pre-multiplies
 * its geometry instead of trying to store an unrepresentable
 * transform on the group itself (Broadset has no group-level scale
 * / skew per IO-D-02).
 */
function importGroupElement(el: Element, ctx: GroupImportContext): ImportedElement[] {
  if (ctx.depth >= ctx.maxDepth) {
    ctx.warnings.push(
      `Group depth cap of ${String(ctx.maxDepth)} reached; deeper nesting was not imported (recursion bounded for safety).`,
    );

    return [];
  }

  // Spec section "Group-Preserving Import": every <g> produces a
  // `group` element with children linked via parentId. If source
  // DOM has no identity attrs, synthesize a stable id from DOM path.
  const groupId = ctx.ownDataBsId ?? synthesiseGroupId(el);
  const importedChildren: ImportedElement[] = [];

  importedChildren.push({
    type: ctx.ownDataBsKind ?? 'group',
    content: '',
    position: { x: ctx.transform.x, y: ctx.transform.y },
    width: 0,
    height: 0,
    // When the cumulative transform requires bake, rotation is
    // baked into children's geometry. Keep group rotation at zero
    // to avoid double-applying it.
    rotation: ctx.transform.requiresBake ? 0 : ctx.transform.rotation,
    style: ctx.baseStyle,
    dataBsId: groupId,
    ...(ctx.ownDataBsKind !== undefined ? { dataBsKind: ctx.ownDataBsKind } : {}),
    parentDataBsId: ctx.parentDataBsId,
  });

  const children = el.children;
  const childParentId = groupId;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (!child || child.tagName.toLowerCase() === 'defs') {
      continue;
    }

    importedChildren.push(
      ...importElement(
        child,
        ctx.defs,
        ctx.warnings,
        ctx.transform,
        childParentId,
        ctx.depth + 1,
        { fontSources: ctx.fontSources, maxDepth: ctx.maxDepth },
      ),
    );
  }

  return importedChildren;
}

/**
 * Stable synthetic-id prefix for `<g>` elements that lack a
 * source DOM identity. Uses the `__bs-` Broadset-internal sentinel.
 */
const SYNTHETIC_GROUP_ID_PREFIX = '__bs-g-';

/**
 * Produce a stable synthetic id for a `<g>` whose source DOM has
 * neither `data-bs-id` nor `id`. The id encodes the element's path
 * from the document root (`g-<idx>-<idx>-...`) so re-imports of the
 * same byte stream produce the same parentId chain.
 */
function synthesiseGroupId(el: Element): string {
  const segments: string[] = [];
  let cursor: Element = el;

  for (;;) {
    const parent: Element | null = cursor.parentElement;

    if (parent === null) break;

    const siblings = parent.children;
    let index = 0;

    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i] === cursor) {
        index = i;
        break;
      }
    }

    segments.unshift(String(index));
    cursor = parent;
  }

  return `${SYNTHETIC_GROUP_ID_PREFIX}${segments.join('-')}`;
}

/**
 * `true` when an id was produced by `synthesiseGroupId`.
 */
export function isSyntheticGroupId(id: string): boolean {
  return /^__bs-g-\d+(-\d+)*$/.test(id);
}

function importElement(
  el: Element,
  defs: DefsBundle,
  warnings: string[],
  inheritedTransform: TransformState,
  parentDataBsId: string | null = null,
  depth = 0,
  options: SvgWalkOptions = {},
): ImportedElement[] {
  const tagName = el.tagName.toLowerCase();
  const transformStr = getAttr(el, 'transform') ?? '';
  const transform = combineTransform(inheritedTransform, parseTransform(transformStr));
  const clipPath = resolveClipPath(el, defs.clipPaths);
  const fill = getInheritedAttr(el, 'fill');
  const stroke = getInheritedAttr(el, 'stroke');
  const gradient = resolveGradientFill(fill, defs.gradients);
  const pattern = resolvePatternFill(fill, defs.patterns);
  const filterStack = resolveFilterStack(getInheritedAttr(el, 'filter'), defs.filters);
  const maskPath = resolveMaskPath(getAttr(el, 'mask'), defs.masks);
  const strokeStyle = readInheritedStrokeStyle(el);
  const effectiveClipPath = maskPath ?? clipPath;
  const isFillFromGradientOrPattern = gradient !== undefined || pattern !== undefined;
  const baseStyle: Partial<BroadsetElementStyleInput> = {
    ...(effectiveClipPath !== undefined ? { customClipPath: effectiveClipPath } : undefined),
    ...(maskPath !== undefined ? { maskType: 'alpha' } : undefined),
    ...(pattern !== undefined ? { fill: pattern } : undefined),
    ...(fill !== null && !isFillFromGradientOrPattern ? { fill } : undefined),
    ...(stroke !== null ? { stroke } : undefined),
    ...(gradient !== undefined ? { backgroundGradient: gradient } : undefined),
    ...(filterStack !== undefined ? { filter: filterStack } : undefined),
    ...strokeStyle,
  };
  const ownDataBsId = el.getAttribute('data-bs-id') ?? undefined;
  const ownDataBsKind = el.getAttribute('data-bs-kind') ?? undefined;
  const sourceId = el.getAttribute('id') ?? undefined;
  const effectiveId = ownDataBsId ?? sourceId;
  const tagMeta = {
    ...(effectiveId !== undefined ? { dataBsId: effectiveId } : {}),
    ...(ownDataBsKind !== undefined ? { dataBsKind: ownDataBsKind } : {}),
    parentDataBsId,
  } as const;
  const maxDepth = resolveMaxDepth(options.maxDepth);

  const shapeCtx: ShapeBakeContext = { transform, baseStyle, tagMeta };
  const preservedOuterHTML = effectiveId !== undefined && tagName !== 'g' ? el.outerHTML : undefined;

  if (preservedOuterHTML !== undefined && effectiveId !== undefined && options.warnOnPreservation === true) {
    warnings.push(`Preserved source SVG markup for <${tagName}> element "${effectiveId}" for dirty-flag re-export.`);
  }

  const withPreserved = (result: readonly ImportedElement[]): ImportedElement[] => {
    if (preservedOuterHTML === undefined) return [...result];

    return result.map((r) => ({ ...r, preservedOuterHTML }));
  };

  switch (tagName) {
    case 'rect':
      return withPreserved([importRectElement(el, shapeCtx)]);

    case 'path':
      return withPreserved([importPathElement(el, shapeCtx)]);

    case 'ellipse':
      return withPreserved([importEllipseElement(el, shapeCtx)]);

    case 'circle':
      return withPreserved([importCircleElement(el, shapeCtx)]);

    case 'polygon':
      return withPreserved([importPolygonElement(el, shapeCtx, true)]);

    case 'polyline':
      return withPreserved([importPolygonElement(el, shapeCtx, false)]);

    case 'line':
      return withPreserved([importLineElement(el, shapeCtx)]);

    case 'text':
      return withPreserved([importTextElement(el, shapeCtx, warnings, options.fontSources)]);

    case 'image':
      return withPreserved([importImageElement(el, shapeCtx, warnings)]);

    case 'g':
      return importGroupElement(el, {
        transformStr,
        transform,
        baseStyle,
        ownDataBsId: effectiveId,
        ownDataBsKind,
        tagMeta,
        parentDataBsId,
        defs,
        warnings,
        depth,
        maxDepth,
        fontSources: options.fontSources,
      });

    case 'switch':
      // SVG `<switch>` evaluates `requiredFeatures` /
      // `requiredExtensions` / `systemLanguage` on each direct
      // child and renders the FIRST one whose conditions are met.
      // Adobe Illustrator wraps every export in a `<switch>` whose
      // first child is a `<foreignObject requiredExtensions="…
      // AdobeIllustrator">` (stripped by the sanitiser as unsafe)
      // and whose second child is the actual `<g>` carrying the
      // geometry. Treating `<switch>` as opaque-svg discarded all
      // Illustrator content. Now: walk children, pick the first
      // without an unsupported `requiredExtensions`, and recurse.
      return importSwitchElement(el, defs, warnings, transform, parentDataBsId, depth, options);

    case 'title':
    case 'desc':
    case 'metadata':
      // Metadata-only elements — they carry no visual content and
      // round-trip via the source-bytes preservation cache. Sketch
      // and Inkscape emit `<title>` / `<desc>` per element; the
      // importer must drop them silently rather than treating
      // them as opaque payloads. (`<metadata>` already filtered at
      // the root walk, but a nested one survives without this case.)
      return [];

    default:
      return [{ ...importUnsupportedElement(el, transform, warnings), ...tagMeta }];
  }
}

/**
 * Walk a `<switch>` element's children and recurse into the first
 * one whose `requiredExtensions` / `requiredFeatures` /
 * `systemLanguage` aren't constrained to extensions Broadset
 * doesn't claim. In practice this always picks the bare `<g>`
 * sibling next to Illustrator's stripped `<foreignObject>`.
 */
function importSwitchElement(
  el: Element,
  defs: DefsBundle,
  warnings: string[],
  inheritedTransform: TransformState,
  parentDataBsId: string | null,
  depth: number,
  options: SvgWalkOptions,
): ImportedElement[] {
  const children = el.children;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (child === undefined) continue;

    // Skip children with `requiredExtensions` / `requiredFeatures`
    // — we don't claim any extension capabilities. SVG 1.1 §5.8
    // says implementations render the first child without those
    // constraints (or with constraints they can satisfy).
    const requiredExt = child.getAttribute('requiredExtensions');
    const requiredFeat = child.getAttribute('requiredFeatures');

    if (requiredExt !== null || requiredFeat !== null) continue;

    return importElement(child, defs, warnings, inheritedTransform, parentDataBsId, depth, options);
  }

  return [];
}

export function importSvg(input: string): SvgImportResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(input, 'image/svg+xml');

  const parseError = xmlDoc.querySelector('parsererror');

  if (parseError) {
    throw new Error(`SVG import failed: invalid XML - ${parseError.textContent}`);
  }

  return walkSvgDocument(xmlDoc);
}

export function walkSvgDocument(xmlDoc: Document, options: SvgWalkOptions = {}): SvgImportResult {
  const svgRoot = xmlDoc.documentElement;

  let canvasWidth = 800;
  let canvasHeight = 600;

  const widthAttr = svgRoot.getAttribute('width');
  const heightAttr = svgRoot.getAttribute('height');

  if (widthAttr && heightAttr) {
    canvasWidth = parseFloat(widthAttr);
    canvasHeight = parseFloat(heightAttr);
  } else {
    const viewBox = svgRoot.getAttribute('viewBox');

    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/);

      canvasWidth = parseFloat(parts[2] ?? '800');
      canvasHeight = parseFloat(parts[3] ?? '600');
    }
  }

  const defs = buildDefsBundle(xmlDoc);
  const warnings: string[] = [];
  const elements: ImportedElement[] = [];
  const children = svgRoot.children;
  const rootTransform: TransformState = { x: 0, y: 0, rotation: 0, matrix: IDENTITY_MATRIX, requiresBake: false };
  const limit = Math.min(children.length, SVG_ELEMENT_COUNT_CAP);

  for (let i = 0; i < limit; i++) {
    const child = children[i];

    if (!child || child.tagName.toLowerCase() === 'defs') {
      continue;
    }

    elements.push(...importElement(child, defs, warnings, rootTransform, null, 0, options));
  }

  return { elements, canvasWidth, canvasHeight, warnings };
}

export interface VisualImportResult {
  readonly elements: readonly ImportedElement[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly warnings: readonly string[];
}

/**
 * Alternate entry point used by the fast-path importer: walks an
 * already-parsed DOM tree (so callers that did their own
 * `parseMetadataPacket(xmlDoc)` don't re-parse).
 */
export function importSvgFromXmlDoc(
  xmlDoc: Document,
  options: SvgWalkOptions = {},
): VisualImportResult {
  const svgRoot = xmlDoc.documentElement;
  let canvasWidth = 800;
  let canvasHeight = 600;
  const widthAttr = svgRoot.getAttribute('width');
  const heightAttr = svgRoot.getAttribute('height');

  if (widthAttr && heightAttr) {
    canvasWidth = parseFloat(widthAttr);
    canvasHeight = parseFloat(heightAttr);
  } else {
    const viewBox = svgRoot.getAttribute('viewBox');

    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/);

      canvasWidth = parseFloat(parts[2] ?? '800');
      canvasHeight = parseFloat(parts[3] ?? '600');
    }
  }

  const defs = buildDefsBundle(xmlDoc);
  const warnings: string[] = [];
  const elements: ImportedElement[] = [];
  const children = svgRoot.children;
  const rootTransform: TransformState = { x: 0, y: 0, rotation: 0, matrix: IDENTITY_MATRIX, requiresBake: false };

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (!child) {
      continue;
    }

    const tag = child.tagName.toLowerCase();

    if (tag === 'defs' || tag === 'metadata') {
      continue;
    }

    elements.push(...importElement(child, defs, warnings, rootTransform, null, 0, options));
  }

  return { elements, canvasWidth, canvasHeight, warnings };
}

function resolveMaxDepth(maxDepth: number | undefined): number {
  return maxDepth !== undefined && Number.isFinite(maxDepth) && maxDepth > 0 ? maxDepth : DEFAULT_SVG_GROUP_DEPTH_CAP;
}
