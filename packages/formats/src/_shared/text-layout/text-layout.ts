import bidiFactory from 'bidi-js';
import LineBreaker from 'linebreak';

/**
 * Phase 2 `_shared/text-layout/` — shared text-layout utilities
 * consumed by every format's exporter wrap / importer re-layout
 * path. Wraps `linebreak` (UAX #14 line-break opportunities) and
 * `bidi-js` (UAX #9 bidirectional embedding levels). The
 * `harfbuzzjs` shaping path is lazy-loaded by a future caller
 * (first non-Latin shape); this module ships the eager subset
 * every format exercises today.
 */

export interface LineSegment {
  readonly text: string;
  readonly width: number;
}

/**
 * Measures the rendered width of a text segment in the caller's
 * font / size / units. Must return a non-negative number; width is
 * compared against `boxWidth` directly.
 */
export type TextMeasure = (text: string) => number;

/**
 * One paragraph of bidi analysis. NOTE: `end` is the index of the
 * LAST character in the paragraph (inclusive), matching the
 * `bidi-js` API. Callers slicing the input string MUST use
 * `text.slice(start, end + 1)` to include the final character.
 */
export interface BidiParagraph {
  readonly start: number;
  readonly end: number;
  readonly level: number;
}

export interface BidiAnalysis {
  readonly paragraphs: readonly BidiParagraph[];
  readonly levels: Uint8Array;
}

const bidi = bidiFactory();

function collectLineBreaks(text: string): readonly { readonly position: number; readonly required: boolean }[] {
  const breaker = new LineBreaker(text);
  const breaks: { readonly position: number; readonly required: boolean }[] = [];
  let next = breaker.nextBreak();

  while (next !== null) {
    breaks.push({ position: next.position, required: next.required });
    next = breaker.nextBreak();
  }

  return breaks;
}

function stripTrailingNewline(value: string): string {
  return value.replace(/[\r\n]+$/u, '');
}

/**
 * Breaks `text` into `LineSegment`s that fit within `boxWidth`
 * according to UAX #14 line-break opportunities. Soft breaks allow
 * wrapping anywhere a line-break opportunity exists; mandatory
 * breaks (hard newlines) always force a new line. Whitespace is
 * preserved in segment text except for the trailing newline that
 * the caller doesn't want surfaced to the renderer.
 *
 * Returns an empty array for empty input. The caller provides the
 * `measure` callback — fontkit-backed width for PDF export, HTML /
 * SVG measurement for web export, etc.
 */
export function breakLines(text: string, boxWidth: number, measure: TextMeasure): readonly LineSegment[] {
  if (text.length === 0) return [];

  const breaks = collectLineBreaks(text);

  if (breaks.length === 0) {
    const trimmed = stripTrailingNewline(text);

    return [{ text: trimmed, width: measure(trimmed) }];
  }

  const lines: LineSegment[] = [];
  let currentStart = 0;
  let lastFitEnd = 0;
  let lastFitMeasured = 0;

  for (const breakPoint of breaks) {
    const candidate = text.slice(currentStart, breakPoint.position);
    const candidateStripped = stripTrailingNewline(candidate);
    const candidateWidth = measure(candidateStripped);

    if (breakPoint.required) {
      lines.push({ text: candidateStripped, width: candidateWidth });
      currentStart = breakPoint.position;
      lastFitEnd = breakPoint.position;
      lastFitMeasured = 0;
      continue;
    }

    if (candidateWidth <= boxWidth) {
      lastFitEnd = breakPoint.position;
      lastFitMeasured = candidateWidth;
      continue;
    }

    if (lastFitEnd === currentStart) {
      // Even the first opportunity overflows — accept the overflow so
      // the line isn't dropped. A future hyphenation / char-wrap pass
      // can subdivide further when the asset pipeline lands.
      lines.push({ text: candidateStripped, width: candidateWidth });
      currentStart = breakPoint.position;
      lastFitEnd = breakPoint.position;
      lastFitMeasured = 0;
      continue;
    }

    const fitted = stripTrailingNewline(text.slice(currentStart, lastFitEnd));

    lines.push({ text: fitted, width: lastFitMeasured });
    currentStart = lastFitEnd;
    lastFitEnd = breakPoint.position;
    lastFitMeasured = measure(stripTrailingNewline(text.slice(currentStart, breakPoint.position)));
  }

  if (currentStart < text.length) {
    const tail = stripTrailingNewline(text.slice(currentStart));

    lines.push({ text: tail, width: measure(tail) });
  }

  return lines;
}

/**
 * Runs UAX #9 bidirectional analysis on `text`, returning per-
 * paragraph embedding levels plus the per-character level array.
 * Consumers (SVG / HTML emitters, PDF text positioning) use the
 * levels to reorder glyphs and wrap in the correct direction.
 *
 * `baseDirection` defaults to `'ltr'` per the spec; pass `'rtl'`
 * for mixed-script documents where the surrounding context is
 * right-to-left.
 */
export function analyzeBidi(text: string, baseDirection: 'ltr' | 'rtl' = 'ltr'): BidiAnalysis {
  if (text.length === 0) {
    return { paragraphs: [], levels: new Uint8Array(0) };
  }

  const result = bidi.getEmbeddingLevels(text, baseDirection);

  return {
    paragraphs: result.paragraphs.map((p) => ({ start: p.start, end: p.end, level: p.level })),
    levels: result.levels,
  };
}
