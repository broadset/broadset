import type { TextAnimator } from '@broadset/model';

export interface TextSegment {
  readonly index: number;
  readonly text: string;
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

/**
 * Segment text into animation units based on the range mode.
 *
 * - `characters`: each visible character is its own segment
 * - `words`: consecutive non-whitespace characters form a segment
 * - `lines`: split on newline (`\n`) boundaries
 */
export function segmentText(content: string, rangeMode: TextAnimator['rangeMode']): readonly TextSegment[] {
  const plainText = stripHtmlTags(content);

  if (plainText.length === 0) {
    return [];
  }

  switch (rangeMode) {
    case 'characters':
      return Array.from(plainText).map((char, index) => ({ index, text: char }));

    case 'words': {
      const words = plainText.split(/\s+/u).filter((word) => word.length > 0);

      return words.map((word, index) => ({ index, text: word }));
    }

    case 'lines': {
      const lines = plainText.split('\n');

      return lines.map((line, index) => ({ index, text: line }));
    }

    default:
      return [];
  }
}

/**
 * Compute the stagger schedule for per-unit text animation.
 * Each segment receives a start time based on its order and the animator config.
 *
 * When `randomOrder` is true, the stagger delays are assigned in a
 * shuffled order — each segment still plays the full referenced timeline,
 * but the order in which they begin is randomized.
 */
export function computeTextSegments(content: string, animator: TextAnimator): readonly TextAnimatorSegment[] {
  const segments = segmentText(content, animator.rangeMode);

  if (segments.length === 0) {
    return [];
  }

  const orderIndices = segments.map((_, i) => i);

  if (animator.randomOrder) {
    // Fisher-Yates shuffle. Math.random is fine here: text-animator stagger order
    // is a presentation effect, not a security or fairness primitive.
    for (let i = orderIndices.length - 1; i > 0; i -= 1) {
      // eslint-disable-next-line sonarjs/pseudo-random
      const j = Math.floor(Math.random() * (i + 1));
      const temp = orderIndices[i];

      orderIndices[i] = orderIndices[j] ?? i;
      orderIndices[j] = temp ?? j;
    }
  }

  const positionMap = new Map(orderIndices.map((originalIndex, position) => [originalIndex, position]));

  return segments.map((segment) => {
    const orderPosition = positionMap.get(segment.index) ?? segment.index;

    return {
      index: segment.index,
      text: segment.text,
      startTimeMs: orderPosition * animator.staggerDelayMs,
    };
  });
}
