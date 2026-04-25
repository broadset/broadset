import { type AnimationDefinition, type BroadsetDocument, createEmptyBroadsetDocument, type TextBody } from '@broadset/model';

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
import { OOXML_REL_TYPES } from './ooxml/namespaces';
import { parseRelationshipsXml } from './ooxml/relationships';
import { type OoxmlPackage, readOoxmlPackage, readTextPart } from './ooxml/zip';
import { parseProjectCustomXml } from './semantic/custom-xml';
import type { LayoutPlaceholder, PptxImportWarning } from './types';
import { BROADSET_CUSTOM_XML_PROJECT } from './types';

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

  const fastPathResult = tryFastPath(pkg);

  if (fastPathResult !== null) return { document: fastPathResult, warnings };

  const operatorLevel = importOperatorLevel(pkg);

  return { document: operatorLevel.document, warnings: [...warnings, ...operatorLevel.warnings] };
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

function importOperatorLevel(pkg: OoxmlPackage): OperatorLevelResult {
  const resolved = resolvePackage(pkg);
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

  const doc = composeDocumentFromSlides(resolved.canvas, slides);

  return {
    document: allAnimations.length > 0 ? { ...doc, animations: allAnimations } : doc,
    warnings,
  };
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
  const notes = extractSlideNotes(pkg, slidePath, slideRels);
  const ctxWarnings: SlideImportContext['warnings'] = [];
  const ctx: SlideImportContext = {
    canvas: resolved.canvas,
    theme,
    layoutPlaceholders,
    mediaByRelId,
    warnings: ctxWarnings,
    nextElementIndex: elementCounter,
  };
  const shapes = parseSlideShapes(ctx, slideXml);
  const withText = shapes.map((shape, shapeIdx) => promoteShapeText(shape, slideXml, shapeIdx, layoutPlaceholders));

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
  shape: ReturnType<typeof parseSlideShapes>[number],
  slideXml: string,
  shapeIdx: number,
  layoutPlaceholders: ReadonlyMap<number, LayoutPlaceholder>,
): ReturnType<typeof parseSlideShapes>[number] {
  if (shape.type !== 'rectangle' && shape.type !== 'ellipse') return shape;

  const body = extractShapeBody(slideXml, shapeIdx);

  if (body === null) return shape;

  const textBody = extractTextBody(body);

  if (textBody === null) return shape;

  // Preserve structured text when the body has multiple runs or any
  // run with actual styling (bold/italic/underline/font/color/size);
  // flatten to a plain string otherwise. `lang` alone (default on
  // PowerPoint runs) doesn't count as styling — we keep those single-
  // run bodies as plain strings for compactness.
  const hasStructure = textBody.paragraphs.some(
    (p) =>
      p.runs.length > 1 ||
      p.runs.some(
        (r) => r.props?.style !== undefined && Object.keys(r.props.style).length > 0,
      ),
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

  // Extract all `<a:t>` text inside the body-type placeholder.
  const body = notesXml.match(/<p:sp\b[\s\S]*?type="body"[\s\S]*?<p:txBody>([\s\S]*?)<\/p:txBody>/);
  const textBlock = body?.[1] ?? notesXml;
  const runs = [...textBlock.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
    .map((m) => decodeXmlEntities(m[1] ?? ''))
    .join('\n');

  return runs.length > 0 ? runs : null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Aggregate placeholder maps from every layout. If two layouts define
 * the same placeholder index, the first one wins.
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

  return aggregated;
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
  const phMatch = body.match(/<p:ph\b([^/>]*)\/?\s*>/);

  if (phMatch === null) return undefined;

  const attrs = phMatch[1] ?? '';
  const idxAttr = attrs.match(/\bidx="(\d+)"/);
  const typeAttr = attrs.match(/\btype="([^"]+)"/);
  const idx = resolvePlaceholderIdx(idxAttr?.[1], typeAttr?.[1]);

  if (idx === null) return undefined;

  return placeholders.get(idx);
}

function resolvePlaceholderIdx(idxText: string | undefined, type: string | undefined): number | null {
  if (idxText !== undefined) return parseInt(idxText, 10);
  if (type === 'title' || type === 'ctrTitle') return 0;
  if (type === 'body') return 1;

  return null;
}

function extractShapeBody(slideXml: string, index: number): string | null {
  const matches = [...slideXml.matchAll(/<p:sp\b[^>]*?>([\s\S]*?)<\/p:sp>/g)];

  return matches[index]?.[1] ?? null;
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
