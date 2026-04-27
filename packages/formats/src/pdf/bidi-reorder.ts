/**
 * Reorder a single line of text from logical to visual order using
 * UAX #9 bidirectional analysis. PDF readers do NOT apply bidi to
 * text shown via `Tj` / `TJ`, so the exporter MUST reorder runs
 * itself before painting RTL scripts.
 *
 * Loads `bidi-js` via dynamic import so the static type chain
 * doesn't leak `declare module 'bidi-js'` ambient declarations
 * across package boundaries. The first invocation incurs a one-time
 * async resolution; subsequent calls reuse the cached factory.
 *
 * The first call MUST be awaited via {@link prepareBidiAnalysis}
 * before sync use — see {@link reorderForBidiSync}. The export
 * pipeline awaits `prepareBidiAnalysis` once at start.
 */

interface BidiParagraph {
  readonly start: number;
  readonly end: number;
  readonly level: number;
}

interface BidiAnalysis {
  readonly paragraphs: readonly BidiParagraph[];
  readonly levels: Uint8Array;
}

type BidiAnalyser = (text: string, baseDirection: 'ltr' | 'rtl') => BidiAnalysis;

let cachedAnalyser: BidiAnalyser | undefined;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function buildAnalyserFromUnknown(value: unknown): BidiAnalyser | null {
  if (typeof value !== 'function') return null;

  const factoryFn = value as () => unknown;
  const api: unknown = factoryFn();

  if (!isObject(api)) return null;

  const getEmbeddingLevels = api['getEmbeddingLevels'];

  if (typeof getEmbeddingLevels !== 'function') return null;

  return (text: string, baseDirection: 'ltr' | 'rtl'): BidiAnalysis => {
    const result: unknown = (getEmbeddingLevels as (t: string, d: 'ltr' | 'rtl') => unknown)(text, baseDirection);

    if (!isObject(result)) return { paragraphs: [], levels: new Uint8Array(0) };

    const paragraphsRaw = Array.isArray(result['paragraphs']) ? result['paragraphs'] : [];
    const levels = result['levels'] instanceof Uint8Array ? result['levels'] : new Uint8Array(0);
    const paragraphs: BidiParagraph[] = [];

    for (const p of paragraphsRaw) {
      if (!isObject(p)) continue;

      const start = p['start'];
      const end = p['end'];
      const level = p['level'];

      if (typeof start === 'number' && typeof end === 'number' && typeof level === 'number') {
        paragraphs.push({ start, end, level });
      }
    }

    return { paragraphs, levels };
  };
}

/**
 * Resolve `bidi-js` and cache the analyser. Call once before any
 * sync `reorderForBidi` invocation. Returns silently if `bidi-js`
 * cannot be loaded — callers fall through to the identity reorder.
 */
export async function prepareBidiAnalysis(): Promise<void> {
  if (cachedAnalyser !== undefined) return;

  try {
    const moduleSpecifier = 'bidi-js';
    const moduleResult: unknown = await import(moduleSpecifier);

    if (!isObject(moduleResult)) return;

    const factory = isObject(moduleResult['default']) || typeof moduleResult['default'] === 'function'
      ? moduleResult['default']
      : moduleResult;
    const analyser = buildAnalyserFromUnknown(factory);

    if (analyser !== null) cachedAnalyser = analyser;
  } catch {
    // bidi-js unavailable — sync reorder falls through to identity.
  }
}

/**
 * Reorder `text` from logical to visual order. Identity if no RTL
 * characters present OR if `prepareBidiAnalysis` was not awaited
 * (so the cached analyser is missing). Defaults to LTR base
 * direction; pass `'rtl'` for documents whose surrounding paragraph
 * direction is RTL.
 */
export function reorderForBidi(text: string, baseDirection: 'ltr' | 'rtl' = 'ltr'): string {
  if (text.length === 0) return text;
  if (!containsRtlCharacters(text)) return text;
  if (cachedAnalyser === undefined) return text;

  const analysis = cachedAnalyser(text, baseDirection);

  if (analysis.paragraphs.length === 0) return text;

  let result = '';

  for (const paragraph of analysis.paragraphs) {
    // bidi-js's `paragraph.end` is the LAST-character index, NOT
    // JavaScript's "one past end" convention. Add 1 so the final
    // character isn't dropped.
    const sliceEnd = paragraph.end + 1;
    const slice = text.slice(paragraph.start, sliceEnd);
    const sliceLevels = analysis.levels.subarray(paragraph.start, sliceEnd);

    result += reorderRunsByLevels(slice, sliceLevels);
  }

  return result;
}

// UAX #9 strong-RTL Unicode ranges expressed as explicit code-point
// escapes. The block covers Hebrew (0590-05FF), Arabic (0600-06FF
// + supplements), Syriac, Thaana, NKo, Samaritan, Mandaic
// (0590-08FF), plus Arabic Presentation Forms-A (FB50-FDFF) and
// Forms-B (FE70-FEFF). Inline literals would trigger Unicode
// combining-character lint warnings.
const RTL_RANGES_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;

function containsRtlCharacters(text: string): boolean {
  return RTL_RANGES_RE.test(text);
}

interface Run {
  readonly text: string;
  readonly level: number;
}

function reorderRunsByLevels(text: string, levels: Uint8Array): string {
  if (text.length === 0) return text;

  const runs: Run[] = [];
  let runStart = 0;

  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || levels[i] !== levels[runStart]) {
      const runLevel = levels[runStart] ?? 0;
      const runText = text.slice(runStart, i);

      runs.push({ text: runLevel % 2 === 1 ? reverseGraphemes(runText) : runText, level: runLevel });
      runStart = i;
    }
  }

  let highestLevel = 0;

  for (const run of runs) {
    if (run.level > highestLevel) highestLevel = run.level;
  }

  let working = runs.slice();

  for (let level = highestLevel; level >= 1; level--) {
    working = reverseRunsAtOrAboveLevel(working, level);
  }

  return working.map((r) => r.text).join('');
}

function reverseRunsAtOrAboveLevel(runs: readonly Run[], level: number): Run[] {
  const out: Run[] = [];
  let i = 0;

  while (i < runs.length) {
    const run = runs[i];

    if (run === undefined) {
      i += 1;
      continue;
    }

    if (run.level < level) {
      out.push(run);
      i += 1;
      continue;
    }

    let end = i;

    while (end < runs.length && (runs[end]?.level ?? 0) >= level) end += 1;

    for (let j = end - 1; j >= i; j--) {
      const sub = runs[j];

      if (sub !== undefined) out.push(sub);
    }

    i = end;
  }

  return out;
}

function reverseGraphemes(text: string): string {
  // Iterate code points (not UTF-16 code units) so surrogate pairs
  // and combining marks survive the reversal intact. Array.from
  // produces code points; the equivalent `[...text]` would trigger
  // a Unicode-decomposition lint warning.
  return Array.from(text).reverse().join('');
}
