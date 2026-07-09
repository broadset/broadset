import type { TextAnimator } from '@broadset/model';

export interface TextSegment {
  readonly index: number;
  readonly text: string;
  /** Character span start index (inclusive), in the plain-text stream. */
  readonly charStartIndex: number;
  /** Character span end index (exclusive), in the plain-text stream. */
  readonly charEndIndex: number;
}

export interface TextAnimatorSegment extends TextSegment {
  readonly startTimeMs: number;
}

const HTML_TAG_RE = /<[^>]*>/gu;

/**
 * Strip HTML tags from text content, leaving only the plain text.
 * This ensures segmentation operates on visible characters only.
 */
function stripHtmlTags(content: string): string {
  return content.replace(HTML_TAG_RE, '');
}

function segmentWords(plainText: string): readonly TextSegment[] {
  const segments: TextSegment[] = [];
  let wordStart: number | null = null;
  let ordinal = 0;

  const chars = Array.from(plainText);

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i] ?? '';
    const isWhitespace = /\s/u.test(ch);

    if (!isWhitespace && wordStart === null) {
      wordStart = i;
    } else if (isWhitespace && wordStart !== null) {
      segments.push({
        index: ordinal,
        text: chars.slice(wordStart, i).join(''),
        charStartIndex: wordStart,
        charEndIndex: i,
      });
      ordinal += 1;
      wordStart = null;
    }
  }

  if (wordStart !== null) {
    segments.push({
      index: ordinal,
      text: chars.slice(wordStart).join(''),
      charStartIndex: wordStart,
      charEndIndex: chars.length,
    });
  }

  return segments;
}

function segmentLines(plainText: string): readonly TextSegment[] {
  const segments: TextSegment[] = [];
  const chars = Array.from(plainText);
  let lineStart = 0;
  let ordinal = 0;

  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] === '\n') {
      segments.push({
        index: ordinal,
        text: chars.slice(lineStart, i).join(''),
        charStartIndex: lineStart,
        charEndIndex: i,
      });
      ordinal += 1;
      lineStart = i + 1;
    }
  }

  segments.push({
    index: ordinal,
    text: chars.slice(lineStart).join(''),
    charStartIndex: lineStart,
    charEndIndex: chars.length,
  });

  return segments;
}

/**
 * Segment text into animation units based on the range mode.
 *
 * - `characters`: each visible character is its own segment
 * - `words`: consecutive non-whitespace characters form a segment
 * - `lines`: split on newline (`\n`) boundaries
 *
 * Every segment carries the half-open character range it covers in the
 * stripped plain text so callers can map segments back to the per-character
 * DOM spans produced by the renderer.
 */
export function segmentText(content: string, rangeMode: TextAnimator['rangeMode']): readonly TextSegment[] {
  const plainText = stripHtmlTags(content);

  if (plainText.length === 0) {
    return [];
  }

  switch (rangeMode) {
    case 'characters':
      return Array.from(plainText).map((char, index) => ({
        index,
        text: char,
        charStartIndex: index,
        charEndIndex: index + 1,
      }));

    case 'words':
      return segmentWords(plainText);

    case 'lines':
      return segmentLines(plainText);

    default:
      return [];
  }
}

/**
 * 32-bit FNV-1a hash — gives a stable seed for per-animator shuffle order.
 * FNV is fast, has good bit mixing for short strings, and needs no deps.
 */
function hashStringToInt(input: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/**
 * xorshift32 PRNG. Produces a deterministic sequence for a given seed, so a
 * random-order shuffle of text-animator segments is stable across frames
 * (same seed → same order), preventing the flicker caused by reshuffling
 * every frame.
 */
function makeSeededRandom(seed: number): () => number {
  let state = seed === 0 ? 1 : seed >>> 0;

  return (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;

    return state / 0xffffffff;
  };
}

function shuffleInPlace(values: number[], random: () => number): void {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const temp = values[i];

    values[i] = values[j] ?? i;
    values[j] = temp ?? j;
  }
}

/**
 * Compute the stagger schedule for per-unit text animation.
 * Each segment receives a start time based on its order and the animator config.
 *
 * When `randomOrder` is true, the stagger delays are assigned in a
 * shuffled order — each segment still plays the full referenced timeline,
 * but the order in which they begin is randomized. The shuffle is seeded
 * by the content + rangeMode, so the same content produces the same order
 * every frame (no per-frame flicker).
 */
export function computeTextSegments(content: string, animator: TextAnimator): readonly TextAnimatorSegment[] {
  const segments = segmentText(content, animator.rangeMode);

  if (segments.length === 0) {
    return [];
  }

  const orderIndices = segments.map((_, i) => i);

  if (animator.randomOrder) {
    const seed = hashStringToInt(`${animator.rangeMode}|${content}`);
    const random = makeSeededRandom(seed);

    shuffleInPlace(orderIndices, random);
  }

  const positionMap = new Map(orderIndices.map((originalIndex, position) => [originalIndex, position]));

  return segments.map((segment) => {
    const orderPosition = positionMap.get(segment.index) ?? segment.index;

    return {
      ...segment,
      startTimeMs: orderPosition * animator.staggerDelayMs,
    };
  });
}
