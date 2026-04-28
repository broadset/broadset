import {
  type BroadsetDocument,
  type BroadsetElement,
  createPageElementInstanceForElement,
  type Hyperlink,
  normalizeElementContent,
  type TextBody,
} from '@broadset/model';

import {
  findChildren,
  findDescendant,
  getAttr,
  parseOoxml,
  rootElement,
  serializeNode,
  type XmlElement,
} from '../ooxml/ast';
import { OOXML_REL_TYPES } from '../ooxml/namespaces';
import { parseRelationshipsXml } from '../ooxml/relationships';
import { type OoxmlPackage, readTextPart } from '../ooxml/zip';
import type { LayoutPlaceholder, PptxImportWarning } from '../types';
import { extractSlideNotes } from './notes';
import { parseSlideShapes, type SlideImportContext } from './shape';
import { parseGradient } from './style';
import { extractTextBody } from './text';

interface SlidePage {
  readonly id: string;
  readonly notes?: string;
  readonly elements: readonly ReturnType<typeof parseSlideShapes>[number][];
}

interface ResolvedPackageInfo {
  readonly canvas: BroadsetDocument['canvas'];
  readonly slideRelsByPath: ReadonlyMap<string, string>;
}

export function importSingleSlide(
  pkg: OoxmlPackage,
  resolved: ResolvedPackageInfo,
  slidePath: string,
  index: number,
  theme: SlideImportContext['theme'],
  layoutPlaceholders: ReadonlyMap<number, LayoutPlaceholder>,
  elementCounter: number,
): {
  readonly slide: SlidePage;
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

  // Parse the slide XML once — `promoteShapeText` previously re-
  // parsed the full slide string per shape via `extractShapeBody`,
  // which made the importer O(n²) in element count and pushed a
  // 1000-element deck into multi-second import territory. We hand
  // the pre-walked p:sp body list down to promoteShapeText instead.
  const slideShapeBodies = collectShapeBodies(slideXml);
  const withText = shapes.map((shape, shapeIdx) =>
    promoteShapeText(resolved.canvas, shape, slideShapeBodies[shapeIdx] ?? null, layoutPlaceholders, hyperlinkByRelId),
  );

  return {
    slide: {
      id: `page-${String(index + 1)}`,
      elements: withText,
      ...(notes !== null ? { notes } : {}),
    },
    nextElementCounter: ctx.nextElementIndex,
    warnings: ctxWarnings.map((w) => ({
      code: w.code,
      message: w.message,
      ...(w.detail !== undefined ? { detail: w.detail } : {}),
    })),
  };
}

/**
 * Escape a plain-text string for the Broadset HTML-shaped `content`
 * field. Encodes `&`, `<`, `>` and quotes so the renderer's sanitizer
 * preserves the original characters as literal text instead of treating
 * them as markup.
 */
function escapePlainTextForHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Promote a rectangle / ellipse with embedded text to a text element,
 * and apply layout-placeholder inheritance for font / size / colour.
 */
function promoteShapeText(
  canvas: BroadsetDocument['canvas'],
  shape: ReturnType<typeof parseSlideShapes>[number],
  body: string | null,
  layoutPlaceholders: ReadonlyMap<number, LayoutPlaceholder>,
  hyperlinks: ReadonlyMap<string, Hyperlink>,
): ReturnType<typeof parseSlideShapes>[number] {
  if (shape.type !== 'rectangle' && shape.type !== 'ellipse') return shape;

  if (body === null) return shape;

  const textBody = extractTextBody(canvas, body, hyperlinks);

  if (textBody === null) return shape;

  // Preserve structured text when the body has multiple runs, any run
  // with actual styling, or any paragraph-level property.
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
  // PPTX text runs carry plain text (XML entities are already decoded
  // by the AST). Element `content` is HTML-shaped, so plain text with
  // bracket-shaped runs (e.g. `A & B <C>`) MUST be HTML-escaped before
  // passing through `normalizeElementContent` — otherwise the
  // sanitizer treats `<C>` as an unknown tag and drops it. Structured
  // `TextBody` paths bypass the HTML rendering surface.
  const rawContent: string | TextBody = hasStructure
    ? textBody
    : escapePlainTextForHtml(
        textBody.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n'),
      );
  const content = normalizeElementContent('text', rawContent);

  const placeholder = resolvePlaceholderFromBody(body, layoutPlaceholders);
  const inherited =
    placeholder === undefined
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

export function applyFirstSlideBackground(
  canvas: BroadsetDocument['canvas'],
  slideXml: string | null,
): BroadsetDocument['canvas'] {
  if (slideXml === null) return canvas;

  const root = rootElement(parseOoxml(slideXml));

  if (root === null) return canvas;

  const bg = findDescendant(root, 'p:bg');

  if (bg === null) return canvas;

  const solidColour = readSrgbHex(findDescendant(bg, 'a:solidFill'));

  if (solidColour !== null) {
    return { ...canvas, backgroundColor: solidColour, backgroundMode: 'solid' };
  }

  const gradFill = findDescendant(bg, 'a:gradFill');

  if (gradFill !== null) {
    const gradient = parseGradient(gradFill);

    if (gradient !== null) {
      const firstStop = findDescendant(gradFill, 'a:gs');
      const fallbackColour = firstStop !== null ? (readSrgbHex(firstStop) ?? undefined) : undefined;

      return {
        ...canvas,
        ...(fallbackColour !== undefined ? { backgroundColor: fallbackColour } : {}),
        backgroundGradient: gradient,
        backgroundMode: 'gradient',
      };
    }
  }

  return canvas;
}

function readSrgbHex(node: XmlElement | null): string | null {
  if (node === null) return null;

  const srgb = findDescendant(node, 'a:srgbClr');

  if (srgb === null) return null;

  const val = getAttr(srgb, 'val');

  if (val === undefined || !/^[0-9A-Fa-f]{6}$/.test(val)) return null;

  return `#${val.toUpperCase()}`;
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

    if (bytes === undefined) continue;

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
 * Pre-walk every `<p:sp>` shape body in the slide XML once and
 * return the serialized child-node strings indexed by shape order.
 * Replaces the previous per-shape `extractShapeBody` re-parse that
 * blew importer time up quadratically with element count.
 */
function collectShapeBodies(slideXml: string): readonly (string | null)[] {
  const root = rootElement(parseOoxml(slideXml));

  if (root === null) return [];

  const spTree = findDescendant(root, 'p:spTree');

  if (spTree === null) return [];

  const shapes = findChildren(spTree, 'p:sp');

  return shapes.map((shape) => shape.children.map((c) => serializeNode(c)).join(''));
}

/**
 * Compose a BroadsetDocument from per-slide element lists. Used by
 * the operator-level importer once parseSlideShapes has populated
 * each page.
 */
export function composeDocumentFromSlides(
  canvas: BroadsetDocument['canvas'],
  slides: readonly {
    readonly id: string;
    readonly notes?: string;
    readonly elements: readonly BroadsetElement[];
  }[],
): BroadsetDocument {
  const allElements: BroadsetElement[] = [];
  const seenIds = new Map<string, number>();
  // Track which root elements live on which slide so each slide gets
  // matching page-instance entries — without this the canvas renders
  // an empty page even though `document.elements` is populated.
  const rootIdsBySlide: string[][] = slides.map(() => []);

  slides.forEach((slide, slideIndex) => {
    const bucket = rootIdsBySlide[slideIndex] ?? [];

    for (const el of slide.elements) {
      const seenCount = seenIds.get(el.id) ?? 0;

      seenIds.set(el.id, seenCount + 1);

      const finalElement: BroadsetElement =
        seenCount === 0 ? el : { ...el, id: `${el.id}__dup-${slide.id}` };

      allElements.push(finalElement);

      if (finalElement.parentId === null) {
        bucket.push(finalElement.id);
      }
    }

    rootIdsBySlide[slideIndex] = bucket;
  });

  const elementsById = new Map(allElements.map((el) => [el.id, el]));
  const pages = slides.map((slide, slideIndex) => {
    const rootIds = rootIdsBySlide[slideIndex] ?? [];

    return {
      id: slide.id,
      name: slide.id,
      elements: rootIds
        .map((id) => elementsById.get(id))
        .filter((el): el is BroadsetElement => el !== undefined)
        .map(createPageElementInstanceForElement),
      locale: null,
      extensions: {},
      ...(slide.notes !== undefined && slide.notes.length > 0 ? { notes: slide.notes } : {}),
    };
  });

  return {
    id: 'pptx-import',
    name: 'Imported from PPTX',
    documentMode: 'screen',
    canvas,
    elements: allElements,
    pages: pages.length > 0 ? pages : [{ id: 'page-1', name: 'Page 1', elements: [], locale: null, extensions: {} }],
    animations: [],
    dataSchema: { fields: [] },
  };
}
