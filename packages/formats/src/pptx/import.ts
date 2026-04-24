import { type BroadsetDocument, createEmptyBroadsetDocument } from '@broadset/model';

import { resolvePackage } from './import/package';
import { composeDocumentFromSlides, extractTextContent, parseSlideShapes, type SlideImportContext } from './import/shapes';
import { parseTheme } from './import/theme';
import { OOXML_REL_TYPES } from './ooxml/namespaces';
import { parseRelationshipsXml } from './ooxml/relationships';
import { type OoxmlPackage,readOoxmlPackage, readTextPart } from './ooxml/zip';
import { parseProjectCustomXml } from './semantic/custom-xml';
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
 *   `theme1.xml`.
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
  const slides: { readonly id: string; readonly elements: readonly ReturnType<typeof parseSlideShapes>[number][] }[] = [];

  let elementCounter = 1;

  for (const [index, slidePath] of resolved.slidePaths.entries()) {
    const slideXml = readTextPart(pkg, slidePath);

    if (slideXml === null) continue;

    const slideRelsPath = resolved.slideRelsByPath.get(slidePath);
    const mediaByRelId = slideRelsPath !== undefined ? collectSlideMedia(pkg, slidePath, slideRelsPath) : new Map();

    const ctx: SlideImportContext = {
      canvas: resolved.canvas,
      theme,
      mediaByRelId,
      nextElementIndex: elementCounter,
    };
    const shapes = parseSlideShapes(ctx, slideXml);

    elementCounter = ctx.nextElementIndex;

    // Attach text runs as element content where applicable.
    const withText = shapes.map((shape, shapeIdx) => {
      if (shape.type === 'rectangle' || shape.type === 'ellipse') {
        const body = extractShapeBody(slideXml, shapeIdx);
        const text = body === null ? '' : extractTextContent(body);

        if (text.length > 0) {
          // The primary shape was a rectangle/ellipse with embedded
          // text — promote it to a text element so the text content
          // surfaces in Broadset (the fill / border are deferred to a
          // future iteration's hybrid text+shape support).
          return { ...shape, type: 'text' as const, content: text };
        }
      }

      return shape;
    });

    slides.push({ id: `page-${String(index + 1)}`, elements: withText });
  }

  return composeDocumentFromSlides(resolved.canvas, slides);
}

/**
 * Collect rel-id → media bytes mapping for one slide's media.
 */
function collectSlideMedia(
  pkg: OoxmlPackage,
  slidePath: string,
  slideRelsPath: string,
): ReadonlyMap<string, { readonly path: string; readonly mime: string; readonly bytes: Uint8Array }> {
  const relsXml = readTextPart(pkg, slideRelsPath);
  const map = new Map<string, { readonly path: string; readonly mime: string; readonly bytes: Uint8Array }>();

  if (relsXml === null) return map;

  const rels = parseRelationshipsXml(relsXml);
  const slideDir = slidePath.substring(0, slidePath.lastIndexOf('/'));

  for (const rel of rels) {
    if (rel.type !== OOXML_REL_TYPES.image) continue;

    const mediaPath = resolveMediaPath(slideDir, rel.target);
    const bytes = pkg.get(mediaPath);

    if (!bytes) continue;

    const mime = guessImageMime(mediaPath);

    map.set(rel.id, { path: mediaPath, mime, bytes });
  }

  return map;
}

function resolveMediaPath(baseDir: string, target: string): string {
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

/**
 * Extract the N-th `<p:sp>` body from a slide XML. Used to recover
 * text content from text-bearing rectangles / ellipses after the main
 * shape tree walk.
 */
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
