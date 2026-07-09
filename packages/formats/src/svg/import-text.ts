/**
 * Importer-side `<text>` / `<tspan>` reading. Owns the
 * structured-vs-plain content selection, paragraph-break detection
 * via `<tspan dy="1em">`, nested-tspan handling, and the
 * glyph-flatten path used when a baking transform requires it.
 *
 * Split out of `import.ts` in P7.7m to bring the orchestrator
 * back under the soft size limit.
 */
import {
  type Paragraph,
  paragraph as makeParagraph,
  type Run,
  run as makeRun,
  type RunProps,
  type TextBody,
  textBody as makeTextBody,
  textBodyToPlainString,
} from '@broadset/model';

import { layoutTextAsPathD, safeOpenFont } from './flatten-text';
import { bakePathWithMatrix, type ImportedElement, type ShapeBakeContext } from './import-types';
import type { SvgFontSource } from './types';


/**
 * Read the text content of a `<text>` (or wrapped `<textPath>`)
 * element. When the source has `<tspan>` children, build a
 * structured `TextBody` carrying each run's text plus any inline
 * style overrides (`font-family` / `font-size` / `font-weight` /
 * `font-style` / `fill` / `text-decoration`). Otherwise return
 * the plain string body — preserves the existing single-line
 * round-trip.
 *
 * The structured form lets a downstream re-export emit
 * `<tspan>` markup that round-trips the run shape (closes the
 * spec feature-matrix promise that multi-run text is native on
 * import + export).
 */
function readTextContent(source: Element): string | TextBody {
  const directTspans = collectDirectTspanChildren(source);

  if (directTspans.length === 0) {
    return source.textContent;
  }

  // Walk direct `<tspan>` children only — `getElementsByTagName`
  // returns descendants and would double-count text inside nested
  // tspans (the outer's `textContent` already includes the inner's
  // bytes). The walker below recurses into nested children but
  // emits one Run per leaf, so each text byte appears exactly once.
  // P7.7l review #4 blocker.
  const paragraphs: Paragraph[] = [];
  let currentRuns: Run[] = [];

  for (const tspan of directTspans) {
    // `dy="1em"` is the canonical SVG paragraph-break convention
    // (matches Broadset's own exporter — see text-tspan.test.ts
    // P7.7j export tests). When a non-first tspan carries
    // `dy="1em"`, flush the current paragraph and start a new one.
    const isParagraphBreak = currentRuns.length > 0 && tspanIsParagraphBreak(tspan);

    if (isParagraphBreak) {
      paragraphs.push(makeParagraph(currentRuns));
      currentRuns = [];
    }

    appendRunsFromTspan(tspan, currentRuns);
  }

  if (currentRuns.length > 0) {
    paragraphs.push(makeParagraph(currentRuns));
  }

  if (paragraphs.length === 0 || paragraphs.every((p) => p.runs.length === 0)) {
    return source.textContent;
  }

  return makeTextBody(paragraphs);
}

function collectDirectTspanChildren(source: Element): Element[] {
  const out: Element[] = [];
  const children = source.children;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (child === undefined) continue;
    if (child.tagName.toLowerCase() === 'tspan') out.push(child);
  }

  return out;
}

function tspanIsParagraphBreak(tspan: Element): boolean {
  const dy = tspan.getAttribute('dy');

  if (typeof dy !== 'string' || dy === '') return false;

  // Match `1em`, `1.0em`, etc. — the canonical break marker.
  // Other dy values (raw px shifts, super/subscript) are not
  // paragraph breaks and stay in the current paragraph.
  return /^1(\.0+)?em$/i.test(dy.trim());
}

/**
 * Append one Run per leaf segment in a `<tspan>` subtree.
 * Iterates direct children: text nodes become a Run carrying the
 * tspan's own style overrides; nested `<tspan>` recurses with
 * the child's overrides taking precedence. The result is exactly
 * one Run per visible text segment — no duplication.
 */
function appendRunsFromTspan(tspan: Element, out: Run[]): void {
  const ownProps = readRunPropsFromTspan(tspan);
  const flushText = (text: string): void => {
    if (text === '') return;

    out.push(ownProps !== undefined ? makeRun(text, ownProps) : makeRun(text));
  };
  const childNodes = tspan.childNodes;
  let directText = '';

  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i];

    if (node === undefined) continue;

    if (node.nodeType === 3 /* TEXT_NODE */) {
      directText += node.textContent ?? '';
      continue;
    }

    if (node.nodeType === 1 /* ELEMENT_NODE */ && (node as Element).tagName.toLowerCase() === 'tspan') {
      flushText(directText);
      directText = '';
      appendRunsFromTspan(node as Element, out);
    }
  }

  flushText(directText);
}

/**
 * Extract per-run style overrides from a `<tspan>` element. The
 * exporter emits canonical SVG attribute names (`font-family`,
 * `font-size`, etc.); the importer maps them back to the
 * camelCase keys the model's `RunProps.style` consumes.
 */
function readRunPropsFromTspan(tspan: Element): RunProps | undefined {
  const style: Record<string, string> = {};
  const fontFamily = tspan.getAttribute('font-family');
  const fontSize = tspan.getAttribute('font-size');
  const fontWeight = tspan.getAttribute('font-weight');
  const fontStyle = tspan.getAttribute('font-style');
  const fill = tspan.getAttribute('fill');
  const textDecoration = tspan.getAttribute('text-decoration');

  if (typeof fontFamily === 'string' && fontFamily !== '') style['fontFamily'] = fontFamily;
  if (typeof fontSize === 'string' && fontSize !== '') style['fontSize'] = fontSize;
  if (typeof fontWeight === 'string' && fontWeight !== '') style['fontWeight'] = fontWeight;
  if (typeof fontStyle === 'string' && fontStyle !== '') style['fontStyle'] = fontStyle;
  if (typeof fill === 'string' && fill !== '') style['fontColor'] = fill;
  if (typeof textDecoration === 'string' && textDecoration !== '') style['textDecoration'] = textDecoration;

  if (Object.keys(style).length === 0) return undefined;

  return { style };
}

/**
 * Import a `<text>` element. When the cumulative transform
 * requires bake (scale / skew) AND `fontSources` carries bytes
 * for the referenced `font-family`, the text gets glyph-flattened
 * into a `<path>` element pre-multiplied by the cumulative matrix
 * — the visual result on re-render matches the source SVG. When
 * the font isn't available, surface a warning and keep the
 * translate-only position (lossy-but-graceful per IO-D-02).
 */
export function importTextElement(
  el: Element,
  ctx: ShapeBakeContext,
  warnings: string[],
  fontSources?: ReadonlyMap<string, SvgFontSource>,
): ImportedElement {
  const textPathEl = el.getElementsByTagName('textPath')[0];
  const hrefRaw = textPathEl?.getAttribute('href') ?? textPathEl?.getAttribute('xlink:href') ?? '';
  const textPathElementId =
    typeof hrefRaw === 'string' && hrefRaw.startsWith('#') && hrefRaw.length > 1 ? hrefRaw.slice(1) : undefined;
  const sourceForContent = textPathEl ?? el;
  const content = readTextContent(sourceForContent);

  if (ctx.transform.requiresBake) {
    // Flatten path needs a single string for fontkit layout —
    // collapse a TextBody to its plain-string projection. Per-run
    // styling is lost (the bake produces glyph paths regardless),
    // which matches the export `flatten` mode's contract.
    const plainText = typeof content === 'string' ? content : textBodyToPlainString(content);
    const flattened = tryFlattenTextOnImport(el, ctx, plainText, fontSources, warnings);

    if (flattened !== null) {
      return flattened;
    }

    warnings.push(
      `Cumulative non-trivial scale/skew on a <text> element was dropped to translate-only on import (Broadset has no element-level text scale per IO-D-02).`,
    );
  }

  return {
    type: 'text',
    content,
    position: { x: ctx.transform.x, y: ctx.transform.y },
    width: 0,
    height: 0,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
    ...(textPathElementId !== undefined ? { textPathElementId } : {}),
  };
}

/**
 * When a `<text>` element under a baking ancestor has a known
 * font in `fontSources`, lay out its glyphs and bake them as a
 * `<path>` element pre-multiplied by the cumulative matrix. The
 * resulting Broadset `path` carries the visual fidelity of the
 * source `<text>` at the cost of font / content identity (same
 * lossy trade-off as the export `flatten` mode). Returns `null`
 * when the bake can't run — caller falls back to translate-only.
 */
function tryFlattenTextOnImport(
  el: Element,
  ctx: ShapeBakeContext,
  content: string,
  fontSources: ReadonlyMap<string, SvgFontSource> | undefined,
  warnings: string[],
): ImportedElement | null {
  if (content === '') return null;

  const family = el.getAttribute('font-family') ?? '';

  if (family === '') return null;

  if (fontSources === undefined) return null;

  const source = fontSources.get(family);

  if (source?.bytes === undefined) {
    warnings.push(
      `Cannot glyph-flatten <text font-family="${family}"> under a baking transform — font bytes for "${family}" were not supplied via importSvgDocument(options.fontSources).`,
    );

    return null;
  }

  const font = safeOpenFont(source.bytes);

  if (font === null) {
    warnings.push(`Cannot glyph-flatten <text font-family="${family}"> — fontkit could not parse the supplied bytes.`);

    return null;
  }

  const fontSize = parseFloat(el.getAttribute('font-size') ?? '16');
  const originX = parseFloat(el.getAttribute('x') ?? '0');
  const originY = parseFloat(el.getAttribute('y') ?? '0');
  const dRaw = layoutTextAsPathD(content, font, {
    fontSize: Number.isFinite(fontSize) ? fontSize : 16,
    originX: Number.isFinite(originX) ? originX : 0,
    originY: Number.isFinite(originY) ? originY : 0,
  });

  if (dRaw === '') return null;

  // Pre-multiply by the cumulative matrix (already includes the
  // baking ancestor's scale / skew) the same way every other
  // shape importer bakes geometry into the `d`.
  const baked = bakePathWithMatrix(dRaw, ctx.transform.matrix);

  return {
    type: 'path',
    content: baked,
    position: { x: 0, y: 0 },
    width: 0,
    height: 0,
    rotation: 0,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}
