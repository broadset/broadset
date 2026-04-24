import {
  type BroadsetColor,
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyleInput,
  type BroadsetFill,
  type BroadsetGradient,
  type BroadsetGradientStop,
  createDefaultElement,
  createEmptyBroadsetDocument,
  rgbColor,
} from '@broadset/model';

import { type ParsedElementMetadata, parseMetadataPacket } from './metadata';
import type { SvgImportOptions } from './types';

export interface SvgImportResult {
  readonly elements: readonly ImportedElement[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly warnings: readonly string[];
}

export interface SvgDocumentImportResult {
  readonly document: BroadsetDocument;
  readonly warnings: readonly string[];
}

interface ImportedElement {
  readonly type: string;
  readonly content: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly style: Partial<BroadsetElementStyleInput>;
  /**
   * Captured `data-bs-id` from the source DOM node when present.
   * Populated for every element produced in the fast-path walk so
   * nested group children keep their OWN id (not the parent group's).
   */
  readonly dataBsId?: string | undefined;
  /** Captured `data-bs-kind` from the source DOM node when present. */
  readonly dataBsKind?: string | undefined;
  /** `data-bs-id` of the nearest ancestor element, or `null` at root. */
  readonly parentDataBsId?: string | null | undefined;
}

interface TransformState {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

function parseTransform(transformStr: string): { readonly x: number; readonly y: number; readonly rotation: number } {
  let x = 0;
  let y = 0;
  let rotation = 0;

  const translateMatch = /translate\(\s*([\d.e+-]+)\s*[,\s]\s*([\d.e+-]+)\s*\)/i.exec(transformStr);

  if (translateMatch) {
    x = parseFloat(translateMatch[1] ?? '0');
    y = parseFloat(translateMatch[2] ?? '0');
  }

  const rotateMatch = /rotate\(\s*([\d.e+-]+)/i.exec(transformStr);

  if (rotateMatch) {
    rotation = parseFloat(rotateMatch[1] ?? '0');
  }

  return { x, y, rotation };
}

function combineTransform(base: TransformState, next: TransformState): TransformState {
  return {
    x: base.x + next.x,
    y: base.y + next.y,
    rotation: base.rotation + next.rotation,
  };
}

function getAttr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

function getNumAttr(el: Element, name: string, defaultVal: number): number {
  const val = el.getAttribute(name);

  return val !== null ? parseFloat(val) : defaultVal;
}

function resolveClipPath(el: Element, defsMap: ReadonlyMap<string, string>): string | undefined {
  const clipRef = getAttr(el, 'clip-path');

  if (!clipRef) {
    return undefined;
  }

  const idMatch = /url\(#([^)]+)\)/.exec(clipRef);
  const clipId = idMatch?.[1];

  if (clipId && defsMap.has(clipId)) {
    return defsMap.get(clipId);
  }

  return clipRef;
}

function buildDefsMap(doc: Document): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const defs = doc.querySelectorAll('defs > clipPath');

  defs.forEach((clipPath) => {
    const id = clipPath.getAttribute('id');

    if (id) {
      map.set(id, clipPath.innerHTML);
    }
  });

  return map;
}

/**
 * Parse an SVG `offset` attribute (`0`, `1`, `50%`, `0.5`) into the
 * Broadset 0-100 position range. SVG 2 accepts both fractional
 * (0-1) and percentage (`0%`-`100%`) forms — we normalise both to
 * 0-100 so the model schema accepts them.
 */
function parseGradientOffset(raw: string | null): number {
  if (raw === null || raw === '') {
    return 0;
  }

  const trimmed = raw.trim();
  const hasPercent = trimmed.endsWith('%');
  const numeric = parseFloat(hasPercent ? trimmed.slice(0, -1) : trimmed);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  if (hasPercent) {
    return Math.max(0, Math.min(100, numeric));
  }

  // Fractional 0-1 form — convert to 0-100 percentage.
  if (numeric <= 1) {
    return Math.max(0, Math.min(100, numeric * 100));
  }

  return Math.max(0, Math.min(100, numeric));
}

/**
 * Parse the `<stop>` children of a gradient element into the
 * Broadset structured stop array. `stop-color` accepts any CSS
 * colour; unparsable values default to opaque black so the stop is
 * never silently dropped per IO-D-18.
 */
function parseGradientStops(gradientEl: Element): readonly BroadsetGradientStop[] {
  const stops: BroadsetGradientStop[] = [];
  const children = gradientEl.getElementsByTagName('stop');

  for (let i = 0; i < children.length; i++) {
    const stop = children[i];

    if (!stop) {
      continue;
    }

    const offset = parseGradientOffset(stop.getAttribute('offset'));
    const colorRaw = stop.getAttribute('stop-color') ?? '#000000';

    stops.push({ color: rgbColor(colorRaw), position: offset });
  }

  return stops;
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

  const dx = x2 - x1;
  const dy = y2 - y1;

  // atan2 returns radians counter-clockwise from the positive x-axis.
  // Convert to CSS-style clockwise-from-north: 90 - atan2-degrees.
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const cssAngle = (90 - angleDeg + 360) % 360;

  return Math.round(cssAngle * 100) / 100;
}

/**
 * Build a map of gradient id → `BroadsetGradient` from every
 * `<linearGradient>` and `<radialGradient>` in the source. Both
 * top-level and `<defs>`-nested gradients are collected so inherited
 * `xlink:href` chains resolve correctly.
 */
function buildGradientsMap(doc: Document): ReadonlyMap<string, BroadsetGradient> {
  const gradients = new Map<string, BroadsetGradient>();
  const linears = doc.getElementsByTagName('linearGradient');
  const radials = doc.getElementsByTagName('radialGradient');

  for (let i = 0; i < linears.length; i++) {
    const el = linears[i];

    if (!el) {
      continue;
    }

    const id = el.getAttribute('id');

    if (id === null || id === '') {
      continue;
    }

    const stops = parseGradientStops(el);

    if (stops.length < 2) {
      continue;
    }

    gradients.set(id, { type: 'linear', angle: deriveLinearAngle(el), stops });
  }

  for (let i = 0; i < radials.length; i++) {
    const el = radials[i];

    if (!el) {
      continue;
    }

    const id = el.getAttribute('id');

    if (id === null || id === '') {
      continue;
    }

    const stops = parseGradientStops(el);

    if (stops.length < 2) {
      continue;
    }

    const cx = parseFloat(el.getAttribute('cx') ?? '0.5');
    const cy = parseFloat(el.getAttribute('cy') ?? '0.5');

    gradients.set(id, {
      type: 'radial',
      center: [cx * 100, cy * 100],
      stops,
    });
  }

  return gradients;
}

/**
 * Resolve a CSS `url(#foo)` fill reference to a structured gradient
 * if the id matches a gradient in the defs map; otherwise return
 * undefined so the caller falls back to the raw paint server string.
 */
function resolveGradientFill(
  fillAttr: string | null,
  gradients: ReadonlyMap<string, BroadsetGradient>,
): BroadsetGradient | undefined {
  if (fillAttr === null) {
    return undefined;
  }

  const match = /url\(\s*#([^)\s]+)\s*\)/.exec(fillAttr);
  const id = match?.[1];

  if (id === undefined) {
    return undefined;
  }

  return gradients.get(id);
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
  readonly defsMap: ReadonlyMap<string, string>;
  readonly gradients: ReadonlyMap<string, BroadsetGradient>;
  readonly warnings: string[];
}

/**
 * Handle the `<g>` element case during the visual walk. Extracted
 * from `importElement` to keep that function's cognitive complexity
 * below the sonarjs threshold. The group either becomes an opaque
 * payload (matrix transform on the group — non-decomposable) or
 * flattens into its children with proper `parentDataBsId` linkage.
 */
function importGroupElement(el: Element, ctx: GroupImportContext): ImportedElement[] {
  if (ctx.transformStr.includes('matrix')) {
    ctx.warnings.push(`Preserved transformed group as SVG payload (id: ${getAttr(el, 'id') ?? 'unknown'})`);

    return [
      {
        type: 'svg',
        content: el.outerHTML,
        position: { x: 0, y: 0 },
        width: 0,
        height: 0,
        rotation: 0,
        style: {},
        ...ctx.tagMeta,
      },
    ];
  }

  // A tagged group becomes a Broadset `'group'` element in the
  // output; its children then carry `parentDataBsId = ownId` so
  // the fast path reconstructs the parent tree. An untagged
  // group is a pure visual wrapper — children inherit
  // `parentDataBsId` unchanged.
  const importedChildren: ImportedElement[] = [];

  if (ctx.ownDataBsId !== undefined) {
    importedChildren.push({
      type: ctx.ownDataBsKind ?? 'group',
      content: '',
      position: { x: ctx.transform.x, y: ctx.transform.y },
      width: 0,
      height: 0,
      rotation: ctx.transform.rotation,
      style: ctx.baseStyle,
      ...ctx.tagMeta,
    });
  }

  const children = el.children;
  const childParentId = ctx.ownDataBsId ?? ctx.parentDataBsId;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (!child || child.tagName.toLowerCase() === 'defs') {
      continue;
    }

    importedChildren.push(...importElement(child, ctx.defsMap, ctx.gradients, ctx.warnings, ctx.transform, childParentId));
  }

  return importedChildren;
}

function importElement(
  el: Element,
  defsMap: ReadonlyMap<string, string>,
  gradients: ReadonlyMap<string, BroadsetGradient>,
  warnings: string[],
  inheritedTransform: TransformState,
  parentDataBsId: string | null = null,
): ImportedElement[] {
  const tagName = el.tagName.toLowerCase();
  const transformStr = getAttr(el, 'transform') ?? '';
  const transform = combineTransform(inheritedTransform, parseTransform(transformStr));
  const clipPath = resolveClipPath(el, defsMap);
  const fill = getAttr(el, 'fill');
  const stroke = getAttr(el, 'stroke');
  const gradient = resolveGradientFill(fill, gradients);
  const baseStyle: Partial<BroadsetElementStyleInput> = {
    ...(clipPath ? { customClipPath: clipPath } : undefined),
    ...(fill && gradient === undefined ? { fill } : undefined),
    ...(stroke ? { stroke } : undefined),
    ...(gradient !== undefined ? { backgroundGradient: gradient } : undefined),
  };
  const ownDataBsId = el.getAttribute('data-bs-id') ?? undefined;
  const ownDataBsKind = el.getAttribute('data-bs-kind') ?? undefined;
  const tagMeta = {
    ...(ownDataBsId !== undefined ? { dataBsId: ownDataBsId } : {}),
    ...(ownDataBsKind !== undefined ? { dataBsKind: ownDataBsKind } : {}),
    parentDataBsId,
  } as const;

  switch (tagName) {
    case 'rect':
      return [
        {
          type: 'rectangle',
          content: '',
          position: { x: transform.x, y: transform.y },
          width: getNumAttr(el, 'width', 0),
          height: getNumAttr(el, 'height', 0),
          rotation: transform.rotation,
          style: baseStyle,
          ...tagMeta,
        },
      ];

    case 'path':
      return [
        {
          type: 'path',
          content: getAttr(el, 'd') ?? '',
          position: { x: transform.x, y: transform.y },
          width: 0,
          height: 0,
          rotation: transform.rotation,
          style: baseStyle,
          ...tagMeta,
        },
      ];

    case 'ellipse':
      return [
        {
          type: 'ellipse',
          content: '',
          position: { x: transform.x, y: transform.y },
          width: getNumAttr(el, 'rx', 0) * 2,
          height: getNumAttr(el, 'ry', 0) * 2,
          rotation: transform.rotation,
          style: baseStyle,
          ...tagMeta,
        },
      ];

    case 'circle': {
      const r = getNumAttr(el, 'r', 0);

      return [
        {
          type: 'ellipse',
          content: '',
          position: { x: transform.x, y: transform.y },
          width: r * 2,
          height: r * 2,
          rotation: transform.rotation,
          style: baseStyle,
          ...tagMeta,
        },
      ];
    }

    case 'text':
      return [
        {
          type: 'text',
          content: el.textContent,
          position: { x: transform.x, y: transform.y },
          width: 0,
          height: 0,
          rotation: transform.rotation,
          style: baseStyle,
          ...tagMeta,
        },
      ];

    case 'image':
      return [
        {
          type: 'image',
          content: getAttr(el, 'href') ?? getAttr(el, 'xlink:href') ?? '',
          position: { x: transform.x, y: transform.y },
          width: getNumAttr(el, 'width', 0),
          height: getNumAttr(el, 'height', 0),
          rotation: transform.rotation,
          style: baseStyle,
          ...tagMeta,
        },
      ];

    case 'g':
      return importGroupElement(el, {
        transformStr,
        transform,
        baseStyle,
        ownDataBsId,
        ownDataBsKind,
        tagMeta,
        parentDataBsId,
        defsMap,
        gradients,
        warnings,
      });

    case 'foreignobject':
      return [
        {
          type: 'svg',
          content: el.outerHTML,
          position: { x: transform.x, y: transform.y },
          width: getNumAttr(el, 'width', 0),
          height: getNumAttr(el, 'height', 0),
          rotation: transform.rotation,
          style: {},
          ...tagMeta,
        },
      ];

    default:
      return [{ ...importUnsupportedElement(el, transform, warnings), ...tagMeta }];
  }
}

export function importSvg(input: string): SvgImportResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(input, 'image/svg+xml');

  const parseError = xmlDoc.querySelector('parsererror');

  if (parseError) {
    throw new Error(`SVG import failed: invalid XML — ${parseError.textContent}`);
  }

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

  const defsMap = buildDefsMap(xmlDoc);
  const gradients = buildGradientsMap(xmlDoc);
  const warnings: string[] = [];
  const elements: ImportedElement[] = [];
  const children = svgRoot.children;
  const rootTransform: TransformState = { x: 0, y: 0, rotation: 0 };

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (!child || child.tagName.toLowerCase() === 'defs') {
      continue;
    }

    elements.push(...importElement(child, defsMap, gradients, warnings, rootTransform));
  }

  return { elements, canvasWidth, canvasHeight, warnings };
}

/**
 * High-level SVG import entry point. Wraps the primitive element
 * extractor `importSvg` and produces a full `BroadsetDocument` plus a
 * warnings list that the demo surfaces through
 * `FormatImportWarningsModal`. Phase 7.1 threads existing behaviour
 * through this shape so `import-document.ts` can consume the svg
 * module via its public API. Phase 7.4 replaces the body with the
 * metadata-fast-path and arbitrary-source logic.
 */
export function importSvgDocument(
  input: string,
  fileName = 'Imported SVG',
  _options?: SvgImportOptions,
): SvgDocumentImportResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(input, 'image/svg+xml');
  const parseError = xmlDoc.querySelector('parsererror');

  if (parseError) {
    throw new Error(`SVG import failed: invalid XML — ${parseError.textContent}`);
  }

  const metadata = parseMetadataPacket(xmlDoc);
  const warnings: string[] = [];

  if (metadata !== null) {
    return hydrateFastPath(xmlDoc, metadata, fileName, warnings);
  }

  return hydrateThirdPartyFallback(input, fileName, warnings);
}

/**
 * Hydrate a Broadset-exported SVG via the fast path per
 * `project/spec/formats/svg.md` §"Standards-Only Round-Trip" —
 * preserve document id, canvas unit/dpi, element ids, structured
 * colour/gradient metadata, and initialise `extensions.svg.dirty`
 * to `false` per IO-D-11.
 */
function hydrateFastPath(
  xmlDoc: Document,
  metadata: ReturnType<typeof parseMetadataPacket> & object,
  fileName: string,
  warnings: string[],
): SvgDocumentImportResult {
  const visualExtract = importSvgFromXmlDoc(xmlDoc);
  const metadataById = new Map<string, ParsedElementMetadata>(metadata.elements.map((entry) => [entry.elementId, entry]));
  const canvasWidth = visualExtract.canvasWidth;
  const canvasHeight = visualExtract.canvasHeight;
  const emptyDoc = createEmptyBroadsetDocument();

  warnings.push(...visualExtract.warnings);

  const hydrated: BroadsetElement[] = [];
  let fallbackIndex = 0;

  for (const visualEl of visualExtract.elements) {
    const dataBsId = visualEl.dataBsId;
    const parentId = visualEl.parentDataBsId ?? null;
    const parentField = typeof parentId === 'string' && parentId !== '' ? { parentId } : {};

    if (dataBsId !== undefined) {
      const sourceKind = visualEl.dataBsKind ?? pickDefaultKindFromVisual(visualEl.type);
      const meta = metadataById.get(dataBsId);
      const style = applyMetadataOverrides(visualEl.style, meta);

      hydrated.push(
        createDefaultElement(sourceKind, {
          id: dataBsId,
          name: dataBsId,
          position: { x: visualEl.position.x, y: visualEl.position.y },
          width: visualEl.width,
          height: visualEl.height,
          rotation: visualEl.rotation,
          content: visualEl.content,
          style,
          ...parentField,
          extensions: { svg: { dirty: false } },
        }),
      );
    } else {
      hydrated.push(
        createDefaultElement(pickDefaultKindFromVisual(visualEl.type), {
          id: `imported-${String(fallbackIndex)}`,
          name: `Element ${String(fallbackIndex + 1)}`,
          position: { x: visualEl.position.x, y: visualEl.position.y },
          width: visualEl.width,
          height: visualEl.height,
          rotation: visualEl.rotation,
          content: visualEl.content,
          style: visualEl.style,
          ...parentField,
          extensions: { svg: { dirty: false } },
        }),
      );
      fallbackIndex += 1;
    }
  }

  const document: BroadsetDocument = {
    ...emptyDoc,
    id: metadata.documentId,
    name: fileName.replace(/\.svg$/i, ''),
    canvas: {
      ...emptyDoc.canvas,
      width: canvasWidth,
      height: canvasHeight,
      unit: metadata.canvasUnit,
      dpi: metadata.canvasDpi,
    },
    elements: hydrated,
  };

  if (document.elements.length === 0) {
    warnings.push(
      'SVG import produced no elements. Unsupported content may have been skipped; verify the source file and mapping coverage.',
    );
  }

  return { document, warnings };
}

function hydrateThirdPartyFallback(
  input: string,
  fileName: string,
  warnings: string[],
): SvgDocumentImportResult {
  const result = importSvg(input);
  const emptyDoc = createEmptyBroadsetDocument();

  warnings.push(...result.warnings);

  const document: BroadsetDocument = {
    ...emptyDoc,
    name: fileName.replace(/\.svg$/i, ''),
    canvas: { ...emptyDoc.canvas, width: result.canvasWidth, height: result.canvasHeight },
    elements: result.elements.map((element, index) =>
      createDefaultElement(element.type === 'path' ? 'path' : 'svg', {
        id: `imported-${String(index)}`,
        name: `Element ${String(index + 1)}`,
        position: { x: element.position.x, y: element.position.y },
        width: element.width,
        height: element.height,
        rotation: element.rotation,
        content: element.content,
        style: element.style,
        extensions: { svg: { dirty: false } },
      }),
    ),
  };

  if (document.elements.length === 0) {
    warnings.push(
      'SVG import produced no elements. Unsupported content may have been skipped; verify the source file and mapping coverage.',
    );
  }

  return { document, warnings };
}

function pickDefaultKindFromVisual(source: string): string {
  const allowed = new Set([
    'text',
    'image',
    'svg',
    'path',
    'rectangle',
    'ellipse',
    'qrcode',
    'group',
    'video',
    'clock',
    'ticker',
  ]);

  return allowed.has(source) ? source : 'svg';
}

function applyMetadataOverrides(
  style: Partial<BroadsetElementStyleInput>,
  meta: ParsedElementMetadata | undefined,
): Partial<BroadsetElementStyleInput> {
  if (meta === undefined) {
    return style;
  }

  const fillOverride =
    meta.originalColor !== undefined ? applyOriginalColorToFill(style.fill, meta.originalColor) : undefined;
  const parsedConic = meta.conicGradient !== undefined ? safeParseConicGradient(meta.conicGradient) : undefined;

  return {
    ...style,
    ...(fillOverride !== undefined ? { fill: fillOverride } : {}),
    ...(parsedConic !== undefined ? { backgroundGradient: parsedConic } : {}),
  };
}

function applyOriginalColorToFill(
  fill: BroadsetElementStyleInput['fill'] | undefined,
  originalColor: string,
): BroadsetFill {
  const sourceColor = extractSolidColorOrDefault(fill);
  const space = detectColorSpace(originalColor);
  const color: BroadsetColor = {
    kind: 'rgb',
    hex: sourceColor,
    originalColor,
    ...(space !== undefined ? { space } : {}),
  };

  return { kind: 'solid', color };
}

function extractSolidColorOrDefault(fill: BroadsetElementStyleInput['fill'] | undefined): `#${string}` {
  if (typeof fill === 'object' && 'kind' in fill && fill.kind === 'solid') {
    const color = fill.color;

    if (color.kind === 'rgb') {
      return color.hex;
    }
  }

  if (typeof fill === 'string') {
    const parsed = parseHexFromString(fill);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return '#000000';
}

function parseHexFromString(input: string): `#${string}` | undefined {
  if (/^#[0-9a-fA-F]{6}$/.test(input) || /^#[0-9a-fA-F]{8}$/.test(input)) {
    return input.toLowerCase() as `#${string}`;
  }

  return undefined;
}

function detectColorSpace(source: string): 'display-p3' | 'oklch' | 'oklab' | undefined {
  if (source.includes('display-p3')) return 'display-p3';
  if (source.includes('oklch')) return 'oklch';
  if (source.includes('oklab')) return 'oklab';

  return undefined;
}

function safeParseConicGradient(serialised: string): BroadsetGradient | undefined {
  try {
    const parsed: unknown = JSON.parse(serialised);

    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }

    if (!('type' in parsed) || (parsed as { type?: unknown }).type !== 'conic') {
      return undefined;
    }

    return parsed as BroadsetGradient;
  } catch {
    return undefined;
  }
}

interface VisualImportResult {
  readonly elements: readonly ImportedElement[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly warnings: readonly string[];
}

/**
 * Alternate entry point used by the fast-path importer: walks an
 * already-parsed DOM tree (so callers that did their own
 * `parseMetadataPacket(xmlDoc)` don't re-parse). Each emitted
 * `ImportedElement` carries its OWN `dataBsId` / `dataBsKind` /
 * `parentDataBsId` so nested group children preserve their own
 * identity and the fast path reconstructs the parent tree.
 */
function importSvgFromXmlDoc(xmlDoc: Document): VisualImportResult {
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

  const defsMap = buildDefsMap(xmlDoc);
  const gradients = buildGradientsMap(xmlDoc);
  const warnings: string[] = [];
  const elements: ImportedElement[] = [];
  const children = svgRoot.children;
  const rootTransform: TransformState = { x: 0, y: 0, rotation: 0 };

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (!child) {
      continue;
    }

    const tag = child.tagName.toLowerCase();

    if (tag === 'defs' || tag === 'metadata') {
      continue;
    }

    elements.push(...importElement(child, defsMap, gradients, warnings, rootTransform, null));
  }

  return { elements, canvasWidth, canvasHeight, warnings };
}
