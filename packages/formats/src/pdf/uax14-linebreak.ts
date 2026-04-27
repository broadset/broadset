/**
 * UAX #14 line-break wrapping for the PDF text emitter.
 *
 * Loads the `linebreak` package via dynamic import + runtime
 * narrowing so the static type chain doesn't leak `declare module
 * 'linebreak'` ambient declarations across package boundaries (the
 * downstream typecheck pattern that broke when we tried importing
 * `_shared/text-layout/breakLines` directly).
 *
 * The first invocation MUST be preloaded via {@link prepareLineBreaker}
 * before sync use — see {@link wrapTextWithLineBreaks}. The export
 * pipeline awaits `prepareLineBreaker` once at start so subsequent
 * per-element render calls can wrap synchronously.
 *
 * When `linebreak` is unavailable for any reason, sync `wrapTextWithLineBreaks`
 * falls through to a whitespace-split fallback so the export never
 * crashes (matches the previous implementation's behaviour for
 * Latin-only documents while gaining CJK + other non-whitespace
 * scripts when the linebreak factory is loaded).
 */

interface LineBreakOpportunity {
  readonly position: number;
  readonly required: boolean;
}

type LineBreakerCtor = new (input: string) => { nextBreak(): LineBreakOpportunity | null };

let cachedCtor: LineBreakerCtor | undefined;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * Resolve `linebreak` and cache the constructor. Call once at the
 * start of an export pass; subsequent sync `wrapTextWithLineBreaks`
 * invocations reuse the cached factory. Returns silently if the
 * module is unavailable so sync wrapping falls back to whitespace
 * splitting.
 */
export async function prepareLineBreaker(): Promise<void> {
  if (cachedCtor !== undefined) return;

  try {
    const moduleSpecifier = 'linebreak';
    const moduleResult: unknown = await import(moduleSpecifier);

    if (!isObject(moduleResult)) return;

    const candidate = moduleResult['default'] ?? moduleResult;

    if (typeof candidate === 'function') {
      cachedCtor = candidate as LineBreakerCtor;
    }
  } catch {
    // linebreak unavailable — sync wrap falls through to whitespace.
  }
}

/**
 * Wrap text at UAX #14 line-break opportunities so non-whitespace
 * scripts (CJK, Arabic, Khmer) wrap at language-correct boundaries.
 * Mandatory breaks (hard newlines) always force a new line; soft
 * breaks wrap when the candidate exceeds `maxWidth`.
 *
 * Returns at least one line for non-empty input. Falls back to
 * whitespace-split when `prepareLineBreaker` has not been awaited
 * (or the linebreak module failed to load).
 */
export function wrapTextWithLineBreaks(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): readonly string[] {
  if (text.length === 0) return [''];
  if (cachedCtor === undefined) return wrapWhitespaceFallback(text, maxWidth, measure);

  return text
    .split('\n')
    .flatMap((paragraph) => wrapParagraphAtBreakOpportunities(paragraph, maxWidth, measure));
}

function wrapParagraphAtBreakOpportunities(
  paragraph: string,
  maxWidth: number,
  measure: (text: string) => number,
): readonly string[] {
  if (paragraph === '') return [''];
  if (cachedCtor === undefined) return [paragraph];

  const breaker = new cachedCtor(paragraph);
  const breaks: LineBreakOpportunity[] = [];
  let next = breaker.nextBreak();

  while (next !== null) {
    breaks.push(next);
    next = breaker.nextBreak();
  }

  if (breaks.length === 0) return [paragraph];

  const lines: string[] = [];
  let currentStart = 0;
  let lastFitEnd = 0;

  for (const breakPoint of breaks) {
    const candidate = stripTrailingNewline(paragraph.slice(currentStart, breakPoint.position));
    const candidateWidth = safeMeasure(candidate, measure);

    if (breakPoint.required) {
      lines.push(candidate);
      currentStart = breakPoint.position;
      lastFitEnd = breakPoint.position;
      continue;
    }

    if (candidateWidth <= maxWidth) {
      lastFitEnd = breakPoint.position;
      continue;
    }

    if (lastFitEnd === currentStart) {
      // Even the first opportunity overflows — accept it so the line
      // isn't dropped. Future hyphenation / char-wrap can subdivide.
      lines.push(candidate);
      currentStart = breakPoint.position;
      lastFitEnd = breakPoint.position;
      continue;
    }

    lines.push(stripTrailingNewline(paragraph.slice(currentStart, lastFitEnd)));
    currentStart = lastFitEnd;
    lastFitEnd = breakPoint.position;
  }

  if (currentStart < paragraph.length) {
    lines.push(stripTrailingNewline(paragraph.slice(currentStart)));
  }

  return lines.length > 0 ? lines : [paragraph];
}

function wrapWhitespaceFallback(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): readonly string[] {
  return text.split('\n').flatMap((paragraph) => wrapWhitespaceParagraph(paragraph, maxWidth, measure));
}

function wrapWhitespaceParagraph(
  paragraph: string,
  maxWidth: number,
  measure: (text: string) => number,
): readonly string[] {
  if (paragraph === '') return [''];

  const words = paragraph.split(/\s+/).filter(Boolean);

  if (words.length === 0) return [''];

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine === '' ? word : `${currentLine} ${word}`;
    const width = safeMeasure(candidate, measure);

    if (width <= maxWidth || currentLine === '') {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine !== '') lines.push(currentLine);

  return lines;
}

const FALLBACK_CHAR_WIDTH_PT = 8;

function safeMeasure(candidate: string, measure: (t: string) => number): number {
  try {
    return measure(candidate);
  } catch {
    return measurePerChar(candidate, measure);
  }
}

function measurePerChar(text: string, measure: (t: string) => number): number {
  let total = 0;

  for (const ch of text) {
    try {
      total += measure(ch);
    } catch {
      total += FALLBACK_CHAR_WIDTH_PT;
    }
  }

  return total;
}

function stripTrailingNewline(value: string): string {
  return value.replace(/[\r\n]+$/u, '');
}
