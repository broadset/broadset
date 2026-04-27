/**
 * Exporter-side `<text>` / `<tspan>` rendering. Owns the
 * structured-vs-plain content selection, paragraph-break emission
 * via `<tspan dy="1em">`, run-level style overrides, and the
 * `<text>` attribute set built from the element style.
 *
 * Split out of `export.ts` in P7.7n to bring the orchestrator
 * back under the soft size limit.
 */
import { type BroadsetElementStyle, resolveStyleColor, type Run, type TextBody } from '@broadset/model';

import { escapeXml } from './shared';

function textAnchorForAlignment(alignment: string): string {
  if (alignment === 'left') return 'start';
  if (alignment === 'right') return 'end';

  return 'middle';
}

export function buildTextAttrs(style: BroadsetElementStyle): string {
  const attrs: string[] = [];

  if (style.fontFamily) {
    attrs.push(`font-family="${escapeXml(style.fontFamily)}"`);
  }

  if (style.fontSize) {
    attrs.push(`font-size="${String(style.fontSize)}"`);
  }

  const fontColorCss = resolveStyleColor(style.fontColor, { resolveTheme: false });

  if (fontColorCss !== undefined) {
    attrs.push(`fill="${escapeXml(fontColorCss)}"`);
  }

  if (style.fontWeight && style.fontWeight !== 400) {
    attrs.push(`font-weight="${String(style.fontWeight)}"`);
  }

  if (style.fontStyle) {
    attrs.push(`font-style="${escapeXml(style.fontStyle)}"`);
  }

  if (style.textAlignment) {
    attrs.push(`text-anchor="${textAnchorForAlignment(style.textAlignment)}"`);
  }

  if (style.textDecoration) {
    attrs.push(`text-decoration="${escapeXml(style.textDecoration)}"`);
  }

  if (style.letterSpacing !== undefined) {
    attrs.push(`letter-spacing="${String(style.letterSpacing)}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

/**
 * Render the inner body of a `<text>` element. Plain `string`
 * content emits as escaped text; structured `TextBody` content
 * emits one `<tspan>` per `Run` per `Paragraph`, carrying any
 * run-level style overrides (`font-family`, `font-size`,
 * `font-weight`, `font-style`, `fill`) so per-run styling
 * survives the export. Closes the spec feature-matrix promise
 * "Multi-run styled text → native (`<tspan>` per run)".
 */
export function renderTextInner(content: string | TextBody): string {
  if (typeof content === 'string') return escapeXml(content);

  if (isSingleEmptyRunBody(content)) return '';

  const segments: string[] = [];

  for (let i = 0; i < content.paragraphs.length; i++) {
    const paragraph = content.paragraphs[i];

    if (paragraph === undefined) continue;

    segments.push(...renderParagraphRuns(paragraph.runs, i === 0));
  }

  return segments.join('');
}

function isSingleEmptyRunBody(body: TextBody): boolean {
  if (body.paragraphs.length === 0) return true;
  if (body.paragraphs.length !== 1) return false;

  const onlyPar = body.paragraphs[0];

  return onlyPar?.runs.length === 1 && (onlyPar.runs[0]?.text ?? '') === '';
}

function renderParagraphRuns(runs: readonly Run[], isFirstParagraph: boolean): readonly string[] {
  const segments: string[] = [];

  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];

    if (run === undefined) continue;

    // Paragraph break: `dy="1em"` advances the baseline by one
    // line-height. The first paragraph stays at the parent
    // `<text>`'s baseline; subsequent paragraphs shift down.
    const advance = r === 0 && !isFirstParagraph ? ' x="0" dy="1em"' : '';

    segments.push(`<tspan${advance}${buildRunAttrs(run)}>${escapeXml(run.text)}</tspan>`);
  }

  return segments;
}

/**
 * Map of `RunProps.style` camelCase keys to the equivalent SVG
 * attribute name. Keys that aren't in this map fall through to a
 * generic `style="…"` declaration so callers don't lose authored
 * overrides the schema doesn't yet narrow.
 */
const RUN_STYLE_TO_SVG_ATTR: ReadonlyMap<string, string> = new Map([
  ['fontFamily', 'font-family'],
  ['fontSize', 'font-size'],
  ['fontWeight', 'font-weight'],
  ['fontStyle', 'font-style'],
  ['fontColor', 'fill'],
  ['fill', 'fill'],
  ['textDecoration', 'text-decoration'],
]);

function buildRunAttrs(run: Run): string {
  const style = run.props?.style;

  if (style === undefined) return '';

  const attrs: string[] = [];
  const cssDecls: string[] = [];

  for (const [key, value] of Object.entries(style)) {
    const stringValue = stringifyRunStyleValue(value);

    if (stringValue === '') continue;

    const attrName = RUN_STYLE_TO_SVG_ATTR.get(key);

    if (attrName !== undefined) {
      attrs.push(`${attrName}="${escapeXml(stringValue)}"`);
    } else {
      cssDecls.push(`${camelToKebab(key)}:${stringValue}`);
    }
  }

  if (cssDecls.length > 0) {
    attrs.push(`style="${escapeXml(cssDecls.join(';'))}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

function stringifyRunStyleValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);

  return '';
}

function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
