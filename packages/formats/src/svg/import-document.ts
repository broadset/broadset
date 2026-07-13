import {
  type BroadsetColor,
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyleInput,
  type BroadsetFill,
  type BroadsetGradient,
  checkElementContentSecurity,
  createDefaultElement,
  createEmptyBroadsetDocument,
  type DataFieldBinding,
  ensureRootElementsHavePageInstances,
  type RepeaterConfig,
} from '@broadset/model';

import { applyStyleBlocks } from './import-css';
import { dereferenceUseElements, sanitizeDomInPlace, warnRawToolNamespaces, warnToolNamespaces } from './import-security';
import { type ImportedElement } from './import-types';
import { importSvgFromXmlDoc, isSyntheticGroupId, walkSvgDocument } from './import-walk';
import { type ParsedElementMetadata, parseMetadataPacket } from './metadata';
import type { SvgImportOptions } from './types';

interface SvgDocumentImportResult {
  readonly document: BroadsetDocument;
  readonly warnings: readonly string[];
}

/**
 * Default byte cap on SVG input. The browser `DOMParser` allocates
 * the full DOM in memory before any element-count cap fires, so
 * the byte budget MUST be enforced pre-parse to bound peak memory.
 * 32 MB covers any realistic design-tool export (most are <5 MB)
 * while making a 500 MB OOM bomb impossible. Callers can override
 * via `SvgImportOptions.maxBytes` (`0` disables the cap entirely
 * for trusted internal flows). Closes the P7.7n security audit C2
 * finding (cap previously opt-in only — demo bridge passed nothing).
 */
const DEFAULT_SVG_MAX_BYTES = 32 * 1024 * 1024;

/**
 * High-level SVG import entry point. Wraps the primitive element
 * extractor and produces a full `BroadsetDocument` plus a warnings
 * list that the demo surfaces through `FormatImportWarningsModal`.
 */
export function importSvgDocument(
  input: string,
  fileName = 'Imported SVG',
  options?: SvgImportOptions,
): SvgDocumentImportResult {
  const fontSources = options?.fontSources;
  const warnings: string[] = [];
  const effectiveMaxBytes = options?.maxBytes ?? DEFAULT_SVG_MAX_BYTES;

  if (exceedsMaxBytes(input, effectiveMaxBytes, warnings)) {
    return hydrateEmptyDocument(fileName, warnings);
  }

  // Detect tool-specific namespaces on raw input before sanitization
  // rewrites the parsed DOM.
  warnRawToolNamespaces(input, warnings);

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(input, 'image/svg+xml');
  const parseError = xmlDoc.querySelector('parsererror');

  if (parseError) {
    throw new Error(`SVG import failed: invalid XML - ${parseError.textContent}`);
  }

  // P7.7n security audit L2: defensively drop the `<!DOCTYPE>` node
  // even though browser DOMParser does not expand DTD entities (a
  // billion-laughs payload in a `<!ENTITY>` block is a no-op
  // today). Removing the DocumentType node keeps the parsed tree
  // clean and pins the no-expansion guarantee against future
  // parser swaps (`fast-xml-parser`, etc.).
  if (xmlDoc.doctype !== null) {
    xmlDoc.removeChild(xmlDoc.doctype);
  }

  // Security-contract sanitization runs on every path.
  const withinCap = sanitizeDomInPlace(xmlDoc, warnings, { allowForeignObject: options?.allowForeignObject });

  const metadata = parseMetadataPacket(xmlDoc);

  if (metadata !== null) {
    return hydrateFastPath(xmlDoc, metadata, fileName, warnings, {
      fontSources,
      maxDepth: options?.maxDepth,
      warnOnPreservation: options?.warnOnPreservation,
    });
  }

  return hydrateThirdPartyFallbackFromDoc(xmlDoc, fileName, warnings, withinCap, {
    fontSources,
    maxDepth: options?.maxDepth,
    warnOnPreservation: options?.warnOnPreservation,
  });
}

function exceedsMaxBytes(input: string, maxBytes: number | undefined, warnings: string[]): boolean {
  if (maxBytes === undefined || maxBytes <= 0) {
    return false;
  }

  const byteLength = utf8ByteLength(input);

  if (byteLength <= maxBytes) {
    return false;
  }

  warnings.push(
    `SVG input byte cap of ${String(maxBytes)} reached (input had ${String(byteLength)} bytes). Import was skipped before XML parsing to avoid unbounded allocation.`,
  );

  return true;
}

function utf8ByteLength(input: string): number {
  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(input, 'utf8');
  }

  return new TextEncoder().encode(input).byteLength;
}

function hydrateEmptyDocument(fileName: string, warnings: string[]): SvgDocumentImportResult {
  const emptyDoc = createEmptyBroadsetDocument();

  return {
    document: { ...emptyDoc, name: fileName.replace(/\.svg$/i, '') },
    warnings,
  };
}

/**
 * Run the security-relevant element-schema checks
 * (`isLikelyUrlLikeContent` for image/video href content,
 * `containsScriptMarkers` for HTML/SVG-rendered content) on a freshly
 * hydrated element. If any issue fires, the element is dropped from
 * the persisted document and a warning is surfaced per IO-D-18; an
 * issue-free element passes through unchanged. Closes KNOWN-GAPS H2:
 * the importer's own scheme allowlist (`stripJavascriptUrlsFromEl`)
 * and the renderer's URL allowlist still scrub at their respective
 * boundaries, but this gate stops the element from reaching the
 * persisted document with bytes the model schema's `superRefine`
 * would have rejected — closing the false-sense-of-safety footgun
 * around re-export.
 */
function applyContentSecurityGate(
  candidate: BroadsetElement,
  warnings: string[],
): BroadsetElement | null {
  const issues = checkElementContentSecurity(candidate);

  if (issues.length === 0) {
    return candidate;
  }

  warnings.push(
    `SVG import: element "${candidate.id}" (type: ${candidate.type}) failed schema content-security validation [${issues.join(', ')}]; element dropped.`,
  );

  return null;
}

/**
 * Hydrate a single tagged element (one with `data-bs-id`) using
 * the metadata packet's overrides and the visually-extracted shape.
 */
function hydrateTaggedElement(
  visualEl: ImportedElement,
  metadataById: ReadonlyMap<string, ParsedElementMetadata>,
): BroadsetElement {
  const dataBsId = visualEl.dataBsId;

  if (dataBsId === undefined) {
    throw new Error('hydrateTaggedElement called with untagged visual element');
  }

  const sourceKind = visualEl.dataBsKind ?? pickDefaultKindFromVisual(visualEl.type);
  const meta = metadataById.get(dataBsId);
  const style = applyMetadataOverrides(visualEl.style, meta);
  const bindings = parseDataBindingMetadata(meta);
  const parentId = visualEl.parentDataBsId ?? null;
  const parentField = typeof parentId === 'string' && parentId !== '' ? { parentId } : {};

  return createDefaultElement(sourceKind, {
    id: dataBsId,
    name: resolveFriendlyName(meta?.name, dataBsId, sourceKind),
    position: { x: visualEl.position.x, y: visualEl.position.y },
    width: meta?.width ?? visualEl.width,
    height: meta?.height ?? visualEl.height,
    rotation: visualEl.rotation,
    content: visualEl.content,
    style,
    ...parentField,
    ...(visualEl.textPathElementId !== undefined ? { textPathElementId: visualEl.textPathElementId } : {}),
    ...(bindings.dataField !== undefined ? { dataField: bindings.dataField } : {}),
    ...(bindings.visibleWhen !== undefined ? { visibleWhen: bindings.visibleWhen } : {}),
    ...(bindings.repeater !== undefined ? { repeater: bindings.repeater } : {}),
    extensions: { svg: buildSvgExtensions(visualEl) },
  });
}

/**
 * Resolve the display `name` for a hydrated element.
 */
function resolveFriendlyName(metaName: string | undefined, dataBsId: string, sourceKind: string): string {
  if (typeof metaName === 'string' && metaName !== '') {
    return metaName;
  }

  if (sourceKind === 'group' && isSyntheticGroupId(dataBsId)) {
    return 'Group';
  }

  return dataBsId;
}

/**
 * Display name for an element on the third-party hydration path.
 */
function resolveImportedName(element: ImportedElement, id: string, sourceKind: string, index: number): string {
  if (sourceKind === 'group' && isSyntheticGroupId(id)) {
    return 'Group';
  }

  if (element.dataBsId !== undefined) {
    return element.dataBsId;
  }

  return `Element ${String(index + 1)}`;
}

/**
 * Build the `extensions.svg` payload for an imported element.
 */
function buildSvgExtensions(visualEl: ImportedElement): {
  readonly dirty: boolean;
  readonly preserved?: { readonly mime: string; readonly raw: string };
} {
  if (visualEl.preservedOuterHTML === undefined) {
    return { dirty: false };
  }

  return {
    dirty: false,
    preserved: { mime: 'image/svg+xml', raw: encodeBase64Utf8(visualEl.preservedOuterHTML) },
  };
}

/**
 * Encode a UTF-8 string as base64.
 */
function encodeBase64Utf8(s: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf8').toString('base64');
  }

  const bytes = new TextEncoder().encode(s);
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }

  return btoa(binary);
}

/**
 * Hydrate an untagged visual element using a synthesised id.
 */
function hydrateUntaggedElement(visualEl: ImportedElement, fallbackIndex: number): BroadsetElement {
  const parentId = visualEl.parentDataBsId ?? null;
  const parentField = typeof parentId === 'string' && parentId !== '' ? { parentId } : {};

  return createDefaultElement(pickDefaultKindFromVisual(visualEl.type), {
    id: `imported-${String(fallbackIndex)}`,
    name: `Element ${String(fallbackIndex + 1)}`,
    position: { x: visualEl.position.x, y: visualEl.position.y },
    width: visualEl.width,
    height: visualEl.height,
    rotation: visualEl.rotation,
    content: visualEl.content,
    style: visualEl.style,
    ...parentField,
    ...(visualEl.textPathElementId !== undefined ? { textPathElementId: visualEl.textPathElementId } : {}),
    extensions: { svg: { dirty: false } },
  });
}

/**
 * Hydrate a Broadset-exported SVG via the fast path.
 */
function hydrateFastPath(
  xmlDoc: Document,
  metadata: ReturnType<typeof parseMetadataPacket> & object,
  fileName: string,
  warnings: string[],
  options: SvgImportOptions,
): SvgDocumentImportResult {
  const visualExtract = importSvgFromXmlDoc(xmlDoc, {
    fontSources: options.fontSources,
    maxDepth: options.maxDepth,
    warnOnPreservation: options.warnOnPreservation,
  });
  const metadataById = new Map<string, ParsedElementMetadata>(
    metadata.elements.map((entry) => [entry.elementId, entry]),
  );
  const canvasWidth = visualExtract.canvasWidth;
  const canvasHeight = visualExtract.canvasHeight;
  const emptyDoc = createEmptyBroadsetDocument();

  warnings.push(...visualExtract.warnings);

  const hydrated: BroadsetElement[] = [];
  let fallbackIndex = 0;

  for (const visualEl of visualExtract.elements) {
    const candidate =
      visualEl.dataBsId !== undefined ?
        hydrateTaggedElement(visualEl, metadataById)
      : hydrateUntaggedElement(visualEl, fallbackIndex);

    if (visualEl.dataBsId === undefined) {
      fallbackIndex += 1;
    }

    const validated = applyContentSecurityGate(candidate, warnings);

    if (validated !== null) {
      hydrated.push(validated);
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

  return { document: ensureRootElementsHavePageInstances(document), warnings };
}

/**
 * Third-party fallback path.
 */
function hydrateThirdPartyFallbackFromDoc(
  xmlDoc: Document,
  fileName: string,
  warnings: string[],
  withinCap: boolean,
  options: SvgImportOptions,
): SvgDocumentImportResult {
  if (withinCap) {
    applyStyleBlocks(xmlDoc, warnings);
    dereferenceUseElements(xmlDoc, warnings);
    warnToolNamespaces(xmlDoc, warnings);
  }

  const result = walkSvgDocument(xmlDoc, {
    fontSources: options.fontSources,
    maxDepth: options.maxDepth,
    warnOnPreservation: options.warnOnPreservation,
  });
  const emptyDoc = createEmptyBroadsetDocument();

  warnings.push(...result.warnings);

  const sourceIdToBroadsetId = new Map<string, string>();

  result.elements.forEach((element, index) => {
    const newId = element.dataBsId ?? `imported-${String(index)}`;

    if (element.dataBsId !== undefined) {
      sourceIdToBroadsetId.set(element.dataBsId, newId);
    }
  });

  const hydratedElements: BroadsetElement[] = [];

  result.elements.forEach((element, index) => {
    const id = element.dataBsId ?? `imported-${String(index)}`;
    const parentSourceId = element.parentDataBsId;
    const resolvedParentId =
      typeof parentSourceId === 'string' && parentSourceId !== '' ?
        (sourceIdToBroadsetId.get(parentSourceId) ?? null)
      : null;
    const sourceKind = pickDefaultKindFromVisual(element.type);
    const friendlyName = resolveImportedName(element, id, sourceKind, index);

    const candidate = createDefaultElement(sourceKind, {
      id,
      name: friendlyName,
      position: { x: element.position.x, y: element.position.y },
      width: element.width,
      height: element.height,
      rotation: element.rotation,
      content: element.content,
      style: element.style,
      ...(resolvedParentId !== null ? { parentId: resolvedParentId } : {}),
      ...(element.textPathElementId !== undefined ? { textPathElementId: element.textPathElementId } : {}),
      extensions: { svg: buildSvgExtensions(element) },
    });

    const validated = applyContentSecurityGate(candidate, warnings);

    if (validated !== null) {
      hydratedElements.push(validated);
    }
  });

  const document: BroadsetDocument = {
    ...emptyDoc,
    name: fileName.replace(/\.svg$/i, ''),
    canvas: { ...emptyDoc.canvas, width: result.canvasWidth, height: result.canvasHeight },
    elements: hydratedElements,
  };

  if (document.elements.length === 0) {
    warnings.push(
      'SVG import produced no elements. Unsupported content may have been skipped; verify the source file and mapping coverage.',
    );
  }

  return { document: ensureRootElementsHavePageInstances(document), warnings };
}

const ALLOWED_IMPORTED_TYPES = new Set([
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

function pickDefaultKindFromVisual(source: string): string {
  return ALLOWED_IMPORTED_TYPES.has(source) ? source : 'svg';
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

interface ParsedDataBindings {
  readonly dataField?: DataFieldBinding | undefined;
  readonly visibleWhen?: string | undefined;
  readonly repeater?: RepeaterConfig | undefined;
}

/**
 * Decode JSON-stringified metadata attrs plus plain visibleWhen.
 */
function parseDataBindingMetadata(meta: ParsedElementMetadata | undefined): ParsedDataBindings {
  if (meta === undefined) {
    return {};
  }

  const dataField = parseJsonOrNull(meta.dataField);
  const repeater = parseJsonOrNull(meta.repeater);

  return {
    ...(isDataFieldBinding(dataField) ? { dataField } : {}),
    ...(typeof meta.visibleWhen === 'string' && meta.visibleWhen !== '' ? { visibleWhen: meta.visibleWhen } : {}),
    ...(isRepeaterConfig(repeater) ? { repeater } : {}),
  };
}

function parseJsonOrNull(raw: string | undefined): unknown {
  if (raw === undefined) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isDataFieldBinding(value: unknown): value is DataFieldBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fieldName' in value &&
    typeof (value).fieldName === 'string'
  );
}

function isRepeaterConfig(value: unknown): value is RepeaterConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'dataArrayField' in value &&
    typeof (value).dataArrayField === 'string'
  );
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
