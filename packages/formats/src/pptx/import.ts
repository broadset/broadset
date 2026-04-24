import { type BroadsetDocument, createEmptyBroadsetDocument } from '@broadset/model';

import { resolvePackage } from './import/package';
import { parseLayoutPlaceholders } from './import/placeholders';
import {
  composeDocumentFromSlides,
  extractTextContent,
  parseSlideShapes,
  type SlideImportContext,
} from './import/shapes';
import { parseTheme } from './import/theme';
import { OOXML_REL_TYPES } from './ooxml/namespaces';
import { parseRelationshipsXml } from './ooxml/relationships';
import { type OoxmlPackage, readOoxmlPackage, readTextPart } from './ooxml/zip';
import { parseProjectCustomXml } from './semantic/custom-xml';
import type { LayoutPlaceholder } from './types';
import { BROADSET_CUSTOM_XML_PROJECT } from './types';

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
  const pkg = readOoxmlPackage(data);
  const fastPathResult = tryFastPath(pkg);

  if (fastPathResult !== null) return fastPathResult;

  return importOperatorLevel(pkg);
}

function tryFastPath(pkg: OoxmlPackage): BroadsetDocument | null {
  const projectXml = readTextPart(pkg, BROADSET_CUSTOM_XML_PROJECT);
  const fastPath = projectXml !== null ? parseProjectCustomXml(projectXml) : null;

  return isDocumentShape(fastPath) ? fastPath : null;
}

function importOperatorLevel(pkg: OoxmlPackage): BroadsetDocument {
  const resolved = resolvePackage(pkg);

  if (resolved.slidePaths.length === 0) return createEmptyBroadsetDocument();

  const themeXml = resolved.themePath !== null ? readTextPart(pkg, resolved.themePath) : null;
  const theme = parseTheme(themeXml);
  const layoutPlaceholders = aggregateLayoutPlaceholders(pkg, resolved.layoutPaths, theme);
  const slides: { readonly id: string; readonly notes?: string; readonly elements: readonly ReturnType<typeof parseSlideShapes>[number][] }[] = [];

  let elementCounter = 1;

  for (const [index, slidePath] of resolved.slidePaths.entries()) {
    const result = importSingleSlide(pkg, resolved, slidePath, index, theme, layoutPlaceholders, elementCounter);

    if (result === null) continue;
    elementCounter = result.nextElementCounter;
    slides.push(result.slide);
  }

  return composeDocumentFromSlides(resolved.canvas, slides);
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
} | null {
  const slideXml = readTextPart(pkg, slidePath);

  if (slideXml === null) return null;

  const slideRelsPath = resolved.slideRelsByPath.get(slidePath);
  const slideRels = slideRelsPath !== undefined ? parseRelationshipsXml(readTextPart(pkg, slideRelsPath) ?? '') : [];
  const mediaByRelId = collectSlideMedia(pkg, slidePath, slideRels);
  const notes = extractSlideNotes(pkg, slidePath, slideRels);
  const ctx: SlideImportContext = {
    canvas: resolved.canvas,
    theme,
    layoutPlaceholders,
    mediaByRelId,
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

  const text = extractTextContent(body);

  if (text.length === 0) return shape;

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
    content: text,
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
