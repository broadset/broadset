import { type AnimationDefinition, type BroadsetDocument, createEmptyBroadsetDocument, type Hyperlink, type TextBody } from '@broadset/model';

import { fingerprintElement } from '../_shared';
import { parseTimingAnimations } from './import/animation';
import { resolvePackage } from './import/package';
import { parseLayoutPlaceholders } from './import/placeholders';
import {
  composeDocumentFromSlides,
  extractTextBody,
  parseSlideShapes,
  type SlideImportContext,
} from './import/shapes';
import { parseTheme } from './import/theme';
import {
  findChildren,
  findDescendant,
  findDescendants,
  getAttr,
  getText,
  parseOoxml,
  rootElement,
  serializeNode,
  type XmlElement,
} from './ooxml/ast';
import { OOXML_REL_TYPES } from './ooxml/namespaces';
import { parseRelationshipsXml } from './ooxml/relationships';
import { parseXml } from './ooxml/xml';
import { type OoxmlPackage, readOoxmlPackage, readTextPart } from './ooxml/zip';
import { parseProjectCustomXml } from './semantic/custom-xml';
import { parseLedgerXml } from './semantic/ledger';
import type { LayoutPlaceholder, PptxImportWarning } from './types';
import { BROADSET_CUSTOM_XML_INTEROP, BROADSET_CUSTOM_XML_PROJECT } from './types';

/**
 * Default caps per the Importer Security Contract in
 * `project/spec/formats/spec.md`.
 */
const DEFAULT_MAX_INPUT_BYTES = 200 * 1024 * 1024; // 200 MiB
const DEFAULT_MAX_PART_BYTES = 50 * 1024 * 1024; // 50 MiB
const DEFAULT_MAX_ENTRIES = 4096;

/**
 * PPTX importer.
 *
 * - Fast-path: when `customXml/broadset-project.xml` is present, hydrate
 *   the Broadset document directly from it. Lossless round-trip for
 *   files the current Broadset exported.
 * - Operator-level path: for arbitrary third-party PPTX, walk the
 *   presentation → slide → shape tree and map OOXML primitives to
 *   Broadset elements (rectangles, ellipses, paths, pictures, groups,
 *   text-bearing shapes). Theme colours resolve against the package's
 *   `theme1.xml`. Placeholder inheritance from slide layouts fills in
 *   text defaults the slide omitted. Speaker notes from
 *   `ppt/notesSlides/` populate `Page.notes`.
 */
export function importPptx(data: Uint8Array): BroadsetDocument {
  return importPptxWithReport(data).document;
}

/**
 * Extended importer that returns the document alongside structured
 * import warnings (unsupported shapes / animations, rejected macros,
 * enforcement caps).
 */
export interface PptxImportReport {
  readonly document: BroadsetDocument;
  readonly warnings: readonly PptxImportWarning[];
}

export function importPptxWithReport(data: Uint8Array): PptxImportReport {
  const warnings: PptxImportWarning[] = [];

  if (data.byteLength > DEFAULT_MAX_INPUT_BYTES) {
    warnings.push({
      code: 'size-cap',
      message: `Input size ${String(data.byteLength)} exceeds cap ${String(DEFAULT_MAX_INPUT_BYTES)} bytes`,
    });

    return { document: createEmptyBroadsetDocument(), warnings };
  }

  const pkg = readOoxmlPackage(data);

  enforcePackageCaps(pkg, warnings);
  rejectExecutionSurface(pkg, warnings);

  // Security floor: route every XML / rels part through fast-xml-parser
  // (DTD / external-entity resolution disabled by the library). This
  // guards against billion-laughs, XXE, and external-DTD attacks the
  // regex hot path would otherwise pass through verbatim. Malformed
  // parts surface a warning and we bail to the empty document — the
  // regex parser cannot do anything useful with content fast-xml-parser
  // refuses.
  const xmlIssue = validateXmlSafety(pkg);

  if (xmlIssue !== null) {
    warnings.push(xmlIssue);

    return { document: createEmptyBroadsetDocument(), warnings };
  }

  const fastPathResult = tryFastPath(pkg);

  if (fastPathResult !== null) return { document: fastPathResult, warnings };

  const operatorLevel = importOperatorLevel(pkg);

  return { document: operatorLevel.document, warnings: [...warnings, ...operatorLevel.warnings] };
}

/**
 * Security floor for XML parts. Two checks per `.xml` / `.rels` part:
 *
 * 1. Any `<!DOCTYPE>` declaration → reject the whole import. Microsoft
 *    Office never emits DTDs in OOXML; their presence indicates a
 *    crafted billion-laughs / XXE / external-DTD payload. Refusing
 *    pre-parse is the strongest defense — fast-xml-parser DOES expand
 *    DTD-declared entities to one level when `processEntities: true`,
 *    so trusting the library alone is insufficient.
 * 2. `parseXml` succeeds (i.e. fast-xml-parser tolerates the structure).
 *    Genuinely malformed XML is rejected here too.
 *
 * Returns the first issue as a `malformed-xml` warning, `null` when
 * the whole package passes both checks.
 */
function validateXmlSafety(pkg: ReturnType<typeof readOoxmlPackage>): PptxImportWarning | null {
  for (const [path] of pkg) {
    if (!path.endsWith('.xml') && !path.endsWith('.rels')) continue;

    const text = readTextPart(pkg, path);

    if (text === null || text.trim().length === 0) continue;

    // DOCTYPE detection: tolerate optional BOM at the head, whitespace
    // between `<!` and `DOCTYPE` (XML 1.0 §2.8 actually forbids it, but
    // some malformed payloads include it precisely to dodge naive
    // matchers), arbitrary case, and line breaks before / after.
    if (/<!\s*DOCTYPE\b/i.test(text)) {
      return {
        code: 'malformed-xml',
        message: `XML part "${path}" contains a DOCTYPE declaration; suspected XXE / billion-laughs payload, import rejected`,
        detail: 'DOCTYPE declarations are not used by Office-authored OOXML',
      };
    }

    // Standalone `<!ENTITY>` or `<!ELEMENT>` outside a DOCTYPE wrapper
    // is also a DTD-style construct fast-xml-parser may handle in ways
    // we can't fully audit; reject these too.
    if (/<!\s*(?:ENTITY|ELEMENT|ATTLIST|NOTATION)\b/i.test(text)) {
      return {
        code: 'malformed-xml',
        message: `XML part "${path}" contains a standalone DTD construct; rejected`,
        detail: 'DTD-style declarations are not used by Office-authored OOXML',
      };
    }

    try {
      parseXml(text);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'parse failure';

      return {
        code: 'malformed-xml',
        message: `XML part "${path}" failed to parse and was rejected`,
        detail,
      };
    }
  }

  return null;
}

/**
 * Async importer that **merges external edits** into the fast-path
 * output. When the source PPTX was previously exported by Broadset and
 * has since been edited in PowerPoint / Keynote / Google Slides, the
 * preserved `customXml/broadset-project.xml` represents the
 * pre-export state and the slide tree represents the current state.
 *
 * For each element this function compares the cross-format fingerprint
 * (xxhash via `_shared/fingerprint/`) against the interop ledger. When
 * the fingerprint matches the ledger value the preserved state wins
 * (it carries richer metadata: data bindings, animations, ext data).
 * When the fingerprint diverges, the current visual state wins and
 * `extensions.pptx.dirty` flips to `true`.
 *
 * Spec acceptance: "When element hash diverges from the ledger, dirty
 * flips to true and current slide state wins field-by-field."
 *
 * The synchronous {@link importPptx} preserves backward compatibility
 * — it returns the fast-path output as-is. Callers that need
 * external-edit detection should migrate to this async variant.
 */
export async function importPptxWithMerge(data: Uint8Array): Promise<PptxImportReport> {
  const baseReport = importPptxWithReport(data);
  const pkg = readOoxmlPackage(data);
  const preservedXml = readTextPart(pkg, BROADSET_CUSTOM_XML_PROJECT);

  if (preservedXml === null) return baseReport;

  const preserved = parseProjectCustomXml(preservedXml);

  if (!isDocumentShape(preserved)) return baseReport;

  // Re-run operator-level extraction so we have both representations.
  // We honour the preserved canvas unit so EMU values come back in the
  // same unit space the preserved doc was authored in — otherwise every
  // element's fingerprint diverges spuriously when the canvas declares
  // anything other than 'mm'.
  const operatorLevel = importOperatorLevel(pkg, preserved.canvas);
  const ledger = readLedgerEntries(pkg);
  const merged = await mergeFromLedger(preserved, operatorLevel.document, ledger);

  return { document: merged, warnings: baseReport.warnings };
}

function readLedgerEntries(pkg: OoxmlPackage): ReadonlyMap<string, string> {
  const ledgerXml = readTextPart(pkg, BROADSET_CUSTOM_XML_INTEROP);
  const map = new Map<string, string>();

  if (ledgerXml === null) return map;

  const ledger = parseLedgerXml(ledgerXml);

  if (ledger === null) return map;
  for (const entry of ledger.entries) map.set(entry.elementId, entry.fingerprint);

  return map;
}

async function mergeFromLedger(
  preserved: BroadsetDocument,
  current: BroadsetDocument,
  ledger: ReadonlyMap<string, string>,
): Promise<BroadsetDocument> {
  const currentById = new Map<string, BroadsetDocument['elements'][number]>();

  for (const el of current.elements) currentById.set(el.id, el);

  const merged: BroadsetDocument['elements'][number][] = [];

  for (const preservedEl of preserved.elements) {
    merged.push(await pickPreservedOrEdited(preservedEl, currentById.get(preservedEl.id), ledger));
  }

  for (const currentEl of current.elements) {
    if (!preserved.elements.some((p) => p.id === currentEl.id)) {
      merged.push(markDirty(currentEl));
    }
  }

  return { ...preserved, elements: merged };
}

async function pickPreservedOrEdited(
  preservedEl: BroadsetDocument['elements'][number],
  currentEl: BroadsetDocument['elements'][number] | undefined,
  ledger: ReadonlyMap<string, string>,
): Promise<BroadsetDocument['elements'][number]> {
  if (currentEl === undefined) return preservedEl;

  const ledgerHash = ledger.get(preservedEl.id);
  const currentHash = await fingerprintElement(currentEl);

  if (ledgerHash !== undefined && ledgerHash === currentHash) return preservedEl;

  return mergeEdited(preservedEl, currentEl);
}

function mergeEdited(
  preservedEl: BroadsetDocument['elements'][number],
  currentEl: BroadsetDocument['elements'][number],
): BroadsetDocument['elements'][number] {
  return {
    ...currentEl,
    ...(preservedEl.dataField !== null ? { dataField: preservedEl.dataField } : {}),
    ...(preservedEl.visibleWhen !== null ? { visibleWhen: preservedEl.visibleWhen } : {}),
    ...(preservedEl.repeater !== null ? { repeater: preservedEl.repeater } : {}),
    extensions: {
      ...preservedEl.extensions,
      pptx: {
        ...((preservedEl.extensions['pptx'] as Record<string, unknown> | undefined) ?? {}),
        dirty: true,
      },
    },
  };
}

function markDirty(el: BroadsetDocument['elements'][number]): BroadsetDocument['elements'][number] {
  return {
    ...el,
    extensions: {
      ...el.extensions,
      pptx: { ...((el.extensions['pptx'] as Record<string, unknown> | undefined) ?? {}), dirty: true },
    },
  };
}

function enforcePackageCaps(pkg: OoxmlPackage, warnings: PptxImportWarning[]): void {
  if (pkg.size > DEFAULT_MAX_ENTRIES) {
    warnings.push({
      code: 'entry-cap',
      message: `Package contains ${String(pkg.size)} entries; cap is ${String(DEFAULT_MAX_ENTRIES)}`,
    });
  }

  for (const [path, bytes] of pkg) {
    if (bytes.byteLength > DEFAULT_MAX_PART_BYTES) {
      warnings.push({
        code: 'size-cap',
        message: `Part ${path} (${String(bytes.byteLength)} bytes) exceeds per-part cap`,
        detail: path,
      });
    }
  }
}

/**
 * Reject PPTX macros (`vbaProject.bin`) and OLE embeddings at import
 * time per the Importer Security Contract. The parts stay in the
 * package bytes but are never surfaced to downstream consumers.
 */
function rejectExecutionSurface(pkg: OoxmlPackage, warnings: PptxImportWarning[]): void {
  for (const [path] of pkg) {
    if (path === 'ppt/vbaProject.bin') {
      warnings.push({
        code: 'macro-rejected',
        message: 'PPTX contains vbaProject.bin — macros have been stripped from the import',
        detail: path,
      });
    }

    if (path.startsWith('ppt/embeddings/') && path.endsWith('.bin')) {
      warnings.push({
        code: 'ole-rejected',
        message: `OLE embedding ${path} has been stripped from the import`,
        detail: path,
      });
    }
  }
}

function tryFastPath(pkg: OoxmlPackage): BroadsetDocument | null {
  const projectXml = readTextPart(pkg, BROADSET_CUSTOM_XML_PROJECT);
  const fastPath = projectXml !== null ? parseProjectCustomXml(projectXml) : null;

  return isDocumentShape(fastPath) ? fastPath : null;
}

interface OperatorLevelResult {
  readonly document: BroadsetDocument;
  readonly warnings: readonly PptxImportWarning[];
}

function importOperatorLevel(pkg: OoxmlPackage, canvasOverride?: BroadsetDocument['canvas']): OperatorLevelResult {
  const baseResolved = resolvePackage(pkg);
  const resolved = canvasOverride !== undefined ? { ...baseResolved, canvas: canvasOverride } : baseResolved;
  const warnings: PptxImportWarning[] = [];

  if (resolved.slidePaths.length === 0) return { document: createEmptyBroadsetDocument(), warnings };

  const themeXml = resolved.themePath !== null ? readTextPart(pkg, resolved.themePath) : null;
  const theme = parseTheme(themeXml);
  const layoutPlaceholders = aggregateLayoutPlaceholders(pkg, resolved.layoutPaths, theme);
  const slides: { readonly id: string; readonly notes?: string; readonly elements: readonly ReturnType<typeof parseSlideShapes>[number][] }[] = [];
  const allAnimations: AnimationDefinition[] = [];

  let elementCounter = 1;

  for (const [index, slidePath] of resolved.slidePaths.entries()) {
    const result = importSingleSlide(pkg, resolved, slidePath, index, theme, layoutPlaceholders, elementCounter);

    if (result === null) continue;
    elementCounter = result.nextElementCounter;
    slides.push(result.slide);

    for (const warning of result.warnings) warnings.push(warning);

    const slideXml = readTextPart(pkg, slidePath) ?? '';
    const timing = parseTimingAnimations(slideXml);

    for (const anim of timing.animations) allAnimations.push(anim);

    for (const warning of timing.warnings) {
      warnings.push({ code: warning.code, message: warning.message });
    }
  }

  // Slide-background read: the first slide's `<p:bg>` (if any) seeds
  // the canvas-level backgroundColor. Per-slide variations get lost
  // (the model has a single canvas-level background today).
  const firstSlideXml = resolved.slidePaths[0] !== undefined ? readTextPart(pkg, resolved.slidePaths[0]) : null;
  const canvasWithBg = applyFirstSlideBackground(resolved.canvas, firstSlideXml, warnings);
  const doc = composeDocumentFromSlides(canvasWithBg, slides);

  return {
    document: allAnimations.length > 0 ? { ...doc, animations: allAnimations } : doc,
    warnings,
  };
}

/**
 * Read the first slide's `<p:bg>` and seed the canvas background
 * colour. Returns the canvas unchanged when the slide has no `<p:bg>`
 * or the fill isn't a colour we can map.
 *
 * Solid fills (`<a:solidFill><a:srgbClr/>`) map directly. Gradient
 * fills (`<a:gradFill>`) are downgraded to the first stop's colour as
 * a best-effort visual proxy and surface an `unsupported-content`
 * warning — Broadset's canvas model is solid-only today, so the
 * gradient can't be preserved natively.
 */
function applyFirstSlideBackground(
  canvas: BroadsetDocument['canvas'],
  slideXml: string | null,
  warnings: PptxImportWarning[],
): BroadsetDocument['canvas'] {
  if (slideXml === null) return canvas;

  const root = rootElement(parseOoxml(slideXml));

  if (root === null) return canvas;

  const bg = findDescendant(root, 'p:bg');

  if (bg === null) return canvas;

  // Solid fill takes precedence — `<p:bg><p:bgPr><a:solidFill><a:srgbClr/>`.
  const solidColour = readSrgbHex(findDescendant(bg, 'a:solidFill'));

  if (solidColour !== null) {
    return { ...canvas, backgroundColor: solidColour, backgroundMode: 'solid' };
  }

  // Gradient fill: downgrade to the first stop and surface a warning.
  // The canvas model carries a single solid colour, so the gradient
  // can't survive intact — better to seed something visible than to
  // silently leave the canvas blank.
  const gradFill = findDescendant(bg, 'a:gradFill');

  if (gradFill !== null) {
    const firstStop = findDescendant(gradFill, 'a:gs');
    const stopColour = firstStop !== null ? readSrgbHex(firstStop) : null;

    if (stopColour !== null) {
      warnings.push({
        code: 'unsupported-content',
        message: 'Slide gradient background downgraded to the first gradient stop colour — canvas model is solid-only',
      });

      return { ...canvas, backgroundColor: stopColour, backgroundMode: 'solid' };
    }
  }

  return canvas;
}

/**
 * Pull the first `<a:srgbClr val="…"/>` descendant out of a node and
 * return it as a `#RRGGBB` string. Returns `null` when no valid sRGB
 * colour is present (e.g. only `<a:schemeClr>` references, or
 * malformed hex).
 */
function readSrgbHex(node: XmlElement | null): string | null {
  if (node === null) return null;

  const srgb = findDescendant(node, 'a:srgbClr');

  if (srgb === null) return null;

  const val = getAttr(srgb, 'val');

  if (val === undefined || !/^[0-9A-Fa-f]{6}$/.test(val)) return null;

  return `#${val.toUpperCase()}`;
}

function importSingleSlide(
  pkg: OoxmlPackage,
  resolved: ReturnType<typeof resolvePackage>,
  slidePath: string,
  index: number,
  theme: ReturnType<typeof parseTheme>,
  layoutPlaceholders: ReadonlyMap<number, LayoutPlaceholder>,
  elementCounter: number,
): {
  readonly slide: { readonly id: string; readonly notes?: string; readonly elements: readonly ReturnType<typeof parseSlideShapes>[number][] };
  readonly nextElementCounter: number;
  readonly warnings: readonly PptxImportWarning[];
} | null {
  const slideXml = readTextPart(pkg, slidePath);

  if (slideXml === null) return null;

  const slideRelsPath = resolved.slideRelsByPath.get(slidePath);
  const slideRels = slideRelsPath !== undefined ? parseRelationshipsXml(readTextPart(pkg, slideRelsPath) ?? '') : [];
  const mediaByRelId = collectSlideMedia(pkg, slidePath, slideRels);
  const hyperlinkByRelId = collectHyperlinkRels(slideRels);
  const notes = extractSlideNotes(pkg, slidePath, slideRels);
  const ctxWarnings: SlideImportContext['warnings'] = [];
  const ctx: SlideImportContext = {
    canvas: resolved.canvas,
    theme,
    layoutPlaceholders,
    mediaByRelId,
    hyperlinkByRelId,
    warnings: ctxWarnings,
    nextElementIndex: elementCounter,
  };
  const shapes = parseSlideShapes(ctx, slideXml);
  const withText = shapes.map((shape, shapeIdx) => promoteShapeText(resolved.canvas, shape, slideXml, shapeIdx, layoutPlaceholders, hyperlinkByRelId));

  return {
    slide: {
      id: `page-${String(index + 1)}`,
      elements: withText,
      ...(notes !== null ? { notes } : {}),
    },
    nextElementCounter: ctx.nextElementIndex,
    warnings: ctxWarnings.map((w) => ({ code: w.code, message: w.message, ...(w.detail !== undefined ? { detail: w.detail } : {}) })),
  };
}

/**
 * Promote a rectangle / ellipse with embedded text to a text element,
 * and apply layout-placeholder inheritance for font / size / colour.
 */
function promoteShapeText(
  canvas: BroadsetDocument['canvas'],
  shape: ReturnType<typeof parseSlideShapes>[number],
  slideXml: string,
  shapeIdx: number,
  layoutPlaceholders: ReadonlyMap<number, LayoutPlaceholder>,
  hyperlinks: ReadonlyMap<string, Hyperlink>,
): ReturnType<typeof parseSlideShapes>[number] {
  if (shape.type !== 'rectangle' && shape.type !== 'ellipse') return shape;

  const body = extractShapeBody(slideXml, shapeIdx);

  if (body === null) return shape;

  const textBody = extractTextBody(canvas, body, hyperlinks);

  if (textBody === null) return shape;

  // Preserve structured text when the body has multiple runs, any run
  // with actual styling (bold/italic/underline/font/color/size), or
  // any paragraph-level property (alignment, bullet, indent, line
  // spacing). `lang` alone (default on PowerPoint runs) doesn't count
  // as styling — single-run bodies without paragraph props stay as
  // plain strings for compactness.
  const hasStructure = textBody.paragraphs.some(
    (p) =>
      p.runs.length > 1 ||
      p.runs.some(
        (r) =>
          (r.props?.style !== undefined && Object.keys(r.props.style).length > 0) ||
          r.props?.hyperlink !== undefined,
      ) ||
      p.props !== undefined,
  );
  const content: string | TextBody = hasStructure
    ? textBody
    : textBody.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');

  const placeholder = resolvePlaceholderFromBody(body, layoutPlaceholders);
  const inherited = placeholder === undefined
    ? {}
    : {
        ...(placeholder.fontFamily !== undefined ? { fontFamily: placeholder.fontFamily } : {}),
        ...(placeholder.fontSize !== undefined ? { fontSize: placeholder.fontSize } : {}),
        ...(placeholder.color !== undefined ? { fontColor: placeholder.color } : {}),
      };

  return {
    ...shape,
    type: 'text' as const,
    content,
    ...(Object.keys(inherited).length > 0 ? { style: { ...shape.style, ...inherited } } : {}),
  };
}

/**
 * Read a slide's notes body by following its `notesSlide` relationship.
 */
function extractSlideNotes(
  pkg: OoxmlPackage,
  slidePath: string,
  slideRels: ReturnType<typeof parseRelationshipsXml>,
): string | null {
  const notesRel = slideRels.find((r) => r.type === OOXML_REL_TYPES.notesSlide);

  if (notesRel === undefined) return null;

  const slideDir = slidePath.substring(0, slidePath.lastIndexOf('/'));
  const notesPath = resolvePath(slideDir, notesRel.target);
  const notesXml = readTextPart(pkg, notesPath);

  if (notesXml === null) return null;

  // Notes shapes carry their text in `<p:sp>` whose `<p:nvSpPr>` flags
  // a body-type placeholder. Find that shape and walk every `<a:t>`
  // descendant, joining text runs with newlines per ECMA-376
  // §19.3.1.32 "notes" guidance.
  const root = rootElement(parseOoxml(notesXml));

  if (root === null) return null;

  const bodyShape = findBodyShape(root);
  const scope = bodyShape ?? root;
  const runs = findDescendants(scope, 'a:t')
    .map((t) => getText(t))
    .filter((s) => s.length > 0);

  return runs.length > 0 ? runs.join('\n') : null;
}

/**
 * Walk a notes-slide AST looking for the `<p:sp>` whose `<p:ph>`
 * placeholder type is `body`. That's the canonical notes-text host.
 * Returns `null` when no body-type placeholder is present, falling
 * the caller back to a slide-wide text scan.
 */
function findBodyShape(root: XmlElement): XmlElement | null {
  for (const sp of findDescendants(root, 'p:sp')) {
    const ph = findDescendant(sp, 'p:ph');

    if (ph !== null && getAttr(ph, 'type') === 'body') return sp;
  }

  return null;
}

/**
 * Aggregate placeholder maps cascading slide → layout → master per
 * the ECMA-376 inheritance chain. Layouts populate first; the master
 * fills in any idx the layout didn't define.
 */
function aggregateLayoutPlaceholders(
  pkg: OoxmlPackage,
  layoutPaths: readonly string[],
  theme: Parameters<typeof parseLayoutPlaceholders>[1],
): ReadonlyMap<number, LayoutPlaceholder> {
  const aggregated = new Map<number, LayoutPlaceholder>();

  for (const layoutPath of layoutPaths) {
    const xml = readTextPart(pkg, layoutPath);
    const placeholders = parseLayoutPlaceholders(xml, theme);

    for (const [idx, placeholder] of placeholders) {
      if (!aggregated.has(idx)) aggregated.set(idx, placeholder);
    }
  }

  // Master cascade: any idx not seen on the layouts inherits from the
  // master placeholder definitions.
  for (const masterPath of findMasterPaths(pkg)) {
    const xml = readTextPart(pkg, masterPath);
    const placeholders = parseLayoutPlaceholders(xml, theme);

    for (const [idx, placeholder] of placeholders) {
      if (!aggregated.has(idx)) aggregated.set(idx, placeholder);
    }
  }

  return aggregated;
}

function findMasterPaths(pkg: OoxmlPackage): readonly string[] {
  const result: string[] = [];

  for (const [path] of pkg) {
    if (path.startsWith('ppt/slideMasters/') && path.endsWith('.xml') && !path.includes('/_rels/')) {
      result.push(path);
    }
  }

  return result;
}

function collectHyperlinkRels(
  slideRels: ReturnType<typeof parseRelationshipsXml>,
): ReadonlyMap<string, Hyperlink> {
  const map = new Map<string, Hyperlink>();

  for (const rel of slideRels) {
    if (rel.type !== OOXML_REL_TYPES.hyperlink) continue;
    if (rel.target.length === 0) continue;

    map.set(rel.id, { url: rel.target });
  }

  return map;
}

function collectSlideMedia(
  pkg: OoxmlPackage,
  slidePath: string,
  slideRels: ReturnType<typeof parseRelationshipsXml>,
): ReadonlyMap<string, { readonly path: string; readonly mime: string; readonly bytes: Uint8Array }> {
  const map = new Map<string, { readonly path: string; readonly mime: string; readonly bytes: Uint8Array }>();
  const slideDir = slidePath.substring(0, slidePath.lastIndexOf('/'));

  for (const rel of slideRels) {
    if (rel.type !== OOXML_REL_TYPES.image) continue;

    const mediaPath = resolvePath(slideDir, rel.target);
    const bytes = pkg.get(mediaPath);

    if (!bytes) continue;

    const mime = guessImageMime(mediaPath);

    map.set(rel.id, { path: mediaPath, mime, bytes });
  }

  return map;
}

function resolvePath(baseDir: string, target: string): string {
  const baseParts = baseDir.split('/').filter((p) => p.length > 0);
  const targetParts = target.split('/');
  const stack = [...baseParts];

  for (const part of targetParts) {
    if (part === '..') {
      stack.pop();
    } else if (part !== '.' && part.length > 0) {
      stack.push(part);
    }
  }

  return stack.join('/');
}

function guessImageMime(path: string): string {
  const lower = path.toLowerCase();

  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';

  return 'application/octet-stream';
}

function resolvePlaceholderFromBody(
  body: string,
  placeholders: ReadonlyMap<number, LayoutPlaceholder>,
): LayoutPlaceholder | undefined {
  // The `body` argument is a serialised shape body (no surrounding
  // <p:sp> element). Wrap and parse so the AST helpers can navigate.
  const parsed = parseOoxml(`<sp xmlns:p="${PRESENTATIONML_NS}">${body}</sp>`);
  const root = rootElement(parsed);

  if (root === null) return undefined;

  const ph = findDescendant(root, 'p:ph');

  if (ph === null) return undefined;

  const idxAttr = getAttr(ph, 'idx');
  const type = getAttr(ph, 'type');
  const idx = resolvePlaceholderIdx(idxAttr, type);

  if (idx === null) return undefined;

  return placeholders.get(idx);
}

const PRESENTATIONML_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';

function resolvePlaceholderIdx(idxText: string | undefined, type: string | undefined): number | null {
  if (idxText !== undefined) return parseInt(idxText, 10);
  if (type === 'title' || type === 'ctrTitle') return 0;
  if (type === 'body') return 1;

  return null;
}

/**
 * Extract the Nth top-level `<p:sp>` body as a serialised XML string.
 * The string-form return is a transitional artifact of the regex →
 * AST migration: `shapes.ts` still consumes string bodies, so we
 * navigate with the AST then serialize back. After A9 migrates
 * `shapes.ts`, this can return the AST node directly.
 */
function extractShapeBody(slideXml: string, index: number): string | null {
  const root = rootElement(parseOoxml(slideXml));

  if (root === null) return null;

  const spTree = findDescendant(root, 'p:spTree');

  if (spTree === null) return null;

  const shapes = findChildren(spTree, 'p:sp');
  const target = shapes[index];

  if (target === undefined) return null;

  // Reconstruct the inner body so callers see the same content shape
  // the regex parser used to return (children only, no <p:sp> wrapper).
  return target.children.map((c) => serializeNode(c)).join('');
}

function isDocumentShape(value: unknown): value is BroadsetDocument {
  if (value === null || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;

  return (
    typeof record['id'] === 'string' &&
    Array.isArray(record['elements']) &&
    Array.isArray(record['pages']) &&
    typeof record['canvas'] === 'object' &&
    record['canvas'] !== null
  );
}
