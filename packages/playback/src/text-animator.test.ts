import { describe, expect, it } from 'vitest';

import { computeTextSegments, segmentText, type TextAnimatorSegment } from './text-animator';

/** @description Text segmentation splits content into character, word, or line units for animation. */
describe('segmentText', () => {
  /** @description Characters mode splits every visible character into its own segment. */
  it('splits text into individual characters', () => {
    const segments = segmentText('HELLO', 'characters');

    expect(segments).toEqual([
      { index: 0, text: 'H', charStartIndex: 0, charEndIndex: 1 },
      { index: 1, text: 'E', charStartIndex: 1, charEndIndex: 2 },
      { index: 2, text: 'L', charStartIndex: 2, charEndIndex: 3 },
      { index: 3, text: 'L', charStartIndex: 3, charEndIndex: 4 },
      { index: 4, text: 'O', charStartIndex: 4, charEndIndex: 5 },
    ]);
  });

  /** @description Words mode groups consecutive non-whitespace characters into word segments. */
  it('splits text into words', () => {
    const segments = segmentText('Breaking News Update', 'words');

    expect(segments).toEqual([
      { index: 0, text: 'Breaking', charStartIndex: 0, charEndIndex: 8 },
      { index: 1, text: 'News', charStartIndex: 9, charEndIndex: 13 },
      { index: 2, text: 'Update', charStartIndex: 14, charEndIndex: 20 },
    ]);
  });

  /** @description Lines mode splits on newline boundaries for per-line animation. */
  it('splits text into lines', () => {
    const segments = segmentText('Line One\nLine Two\nLine Three', 'lines');

    expect(segments).toEqual([
      { index: 0, text: 'Line One', charStartIndex: 0, charEndIndex: 8 },
      { index: 1, text: 'Line Two', charStartIndex: 9, charEndIndex: 17 },
      { index: 2, text: 'Line Three', charStartIndex: 18, charEndIndex: 28 },
    ]);
  });

  /** @description Empty text produces no segments regardless of range mode. */
  it('returns empty array for empty text', () => {
    expect(segmentText('', 'characters')).toEqual([]);
    expect(segmentText('', 'words')).toEqual([]);
    expect(segmentText('', 'lines')).toEqual([]);
  });

  /** @description Single character text produces one character segment. */
  it('handles single character text', () => {
    const segments = segmentText('A', 'characters');

    expect(segments).toEqual([{ index: 0, text: 'A', charStartIndex: 0, charEndIndex: 1 }]);
  });

  /** @description Multiple spaces between words are condensed — each word is a separate segment. */
  it('handles multiple spaces between words', () => {
    const segments = segmentText('Hello   World', 'words');

    expect(segments).toEqual([
      { index: 0, text: 'Hello', charStartIndex: 0, charEndIndex: 5 },
      { index: 1, text: 'World', charStartIndex: 8, charEndIndex: 13 },
    ]);
  });

  /** @description HTML tags in content are stripped, only plain text is segmented. */
  it('strips HTML tags before segmenting by characters', () => {
    const segments = segmentText('<b>Hi</b>', 'characters');

    expect(segments).toEqual([
      { index: 0, text: 'H', charStartIndex: 0, charEndIndex: 1 },
      { index: 1, text: 'i', charStartIndex: 1, charEndIndex: 2 },
    ]);
  });

  /** @description Single line text in lines mode still produces one segment. */
  it('returns single segment for single line in lines mode', () => {
    const segments = segmentText('Hello World', 'lines');

    expect(segments).toEqual([{ index: 0, text: 'Hello World', charStartIndex: 0, charEndIndex: 11 }]);
  });
});

/** @description computeTextSegments produces stagger schedule for per-unit text animation. */
describe('computeTextSegments', () => {
  /** @description Normal order with character stagger produces linearly increasing start times. */
  it('computes character stagger in document order', () => {
    const segments = computeTextSegments('HELLO', {
      rangeMode: 'characters',
      staggerDelayMs: 50,
      randomOrder: false,
      timelineId: 'tl-1',
    });

    expect(segments).toHaveLength(5);
    expect(segments.map((s: TextAnimatorSegment) => s.startTimeMs)).toEqual([0, 50, 100, 150, 200]);
    expect(segments.map((s: TextAnimatorSegment) => s.text)).toEqual(['H', 'E', 'L', 'L', 'O']);
  });

  /** @description Word stagger with 3 words produces delays between each word unit. */
  it('computes word stagger', () => {
    const segments = computeTextSegments('Breaking News Update', {
      rangeMode: 'words',
      staggerDelayMs: 100,
      randomOrder: false,
      timelineId: 'tl-1',
    });

    expect(segments).toHaveLength(3);
    expect(segments.map((s: TextAnimatorSegment) => s.startTimeMs)).toEqual([0, 100, 200]);
    expect(segments.map((s: TextAnimatorSegment) => s.text)).toEqual(['Breaking', 'News', 'Update']);
  });

  /** @description Line stagger with 3 lines produces delays between each line unit. */
  it('computes line stagger', () => {
    const segments = computeTextSegments('Line 1\nLine 2\nLine 3', {
      rangeMode: 'lines',
      staggerDelayMs: 200,
      randomOrder: false,
      timelineId: 'tl-1',
    });

    expect(segments).toHaveLength(3);
    expect(segments.map((s: TextAnimatorSegment) => s.startTimeMs)).toEqual([0, 200, 400]);
  });

  /** @description Random order shuffles segment start times while each segment still gets its full timeline. */
  it('shuffles start times when randomOrder is true', () => {
    const segments = computeTextSegments('ABCDE', {
      rangeMode: 'characters',
      staggerDelayMs: 50,
      randomOrder: true,
      timelineId: 'tl-1',
    });

    expect(segments).toHaveLength(5);

    // All segments should be present with their text
    const texts = segments.map((s: TextAnimatorSegment) => s.text).sort((a, b) => a.localeCompare(b));

    expect(texts).toEqual(['A', 'B', 'C', 'D', 'E']);

    // Start times should be a permutation of [0, 50, 100, 150, 200]
    const startTimes = segments.map((s: TextAnimatorSegment) => s.startTimeMs).sort((a: number, b: number) => a - b);

    expect(startTimes).toEqual([0, 50, 100, 150, 200]);
  });

  /** @description Random order must be stable across calls with identical inputs so playback doesn't reshuffle per frame. */
  it('produces a stable shuffle across repeat calls for the same content', () => {
    const first = computeTextSegments('ABCDEFGHIJ', {
      rangeMode: 'characters',
      staggerDelayMs: 25,
      randomOrder: true,
      timelineId: 'tl-1',
    });
    const second = computeTextSegments('ABCDEFGHIJ', {
      rangeMode: 'characters',
      staggerDelayMs: 25,
      randomOrder: true,
      timelineId: 'tl-1',
    });

    expect(first.map((s: TextAnimatorSegment) => s.startTimeMs)).toEqual(
      second.map((s: TextAnimatorSegment) => s.startTimeMs),
    );
  });

  /** @description Zero stagger delay means all segments start simultaneously at 0ms. */
  it('handles zero stagger delay', () => {
    const segments = computeTextSegments('ABC', {
      rangeMode: 'characters',
      staggerDelayMs: 0,
      randomOrder: false,
      timelineId: 'tl-1',
    });

    expect(segments.map((s: TextAnimatorSegment) => s.startTimeMs)).toEqual([0, 0, 0]);
  });

  /** @description Empty text produces no segments. */
  it('returns empty array for empty text', () => {
    const segments = computeTextSegments('', {
      rangeMode: 'characters',
      staggerDelayMs: 50,
      randomOrder: false,
      timelineId: 'tl-1',
    });

    expect(segments).toEqual([]);
  });
});
