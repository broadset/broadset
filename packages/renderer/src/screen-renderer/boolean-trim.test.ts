/** @jest-environment jsdom */

import type { BroadsetElement } from '@broadset/model';

import { computeBooleanPath, computeTrimPathAttributes } from '../index';
import { createElement } from './test-helpers';

/* ================================================================== */
/*  computeTrimPathAttributes                                          */
/* ================================================================== */

describe('computeTrimPathAttributes', () => {
  /** @description Default trim values (start=0, end=1, offset=0) must return null (no dash modification needed). */
  it('returns null for default trim values', () => {
    expect(computeTrimPathAttributes(200, 0, 1, 0)).toBeNull();
  });

  /** @description Zero total length must return null regardless of trim values. */
  it('returns null for zero total length', () => {
    expect(computeTrimPathAttributes(0, 0.25, 0.75, 0)).toBeNull();
  });

  /** @description Partial visibility (25% to 75%) must produce a dasharray showing 50% of the path. */
  it('computes correct dasharray for partial visibility', () => {
    const result = computeTrimPathAttributes(200, 0.25, 0.75, 0);

    expect(result).not.toBeNull();
    expect(result?.dasharray).toBe('100 100');
    expect(result?.dashoffset).toBe('-50');
  });

  /** @description trimEnd: 0, trimStart: 0 means nothing visible — dasharray gap covers entire path. */
  it('produces zero-length dash when trimStart equals trimEnd', () => {
    const result = computeTrimPathAttributes(200, 0.5, 0.5, 0);

    expect(result).not.toBeNull();
    expect(result?.dasharray).toBe('0 200');
    expect(result?.dashoffset).toBe('0');
  });

  /** @description Trim offset rotates the visible window around the path. */
  it('applies trim offset to dashoffset', () => {
    const result = computeTrimPathAttributes(400, 0, 0.5, 0.25);

    expect(result).not.toBeNull();
    expect(result?.dasharray).toBe('200 200');
    expect(result?.dashoffset).toBe('-100');
  });

  /** @description Full path with non-zero offset still hides nothing but shifts the dash start. */
  it('handles full visibility with offset', () => {
    const result = computeTrimPathAttributes(100, 0, 1, 0.5);

    expect(result).not.toBeNull();
    expect(result?.dasharray).toBe('100 0');
    expect(result?.dashoffset).toBe('-50');
  });

  /** @description Line-draw reveal from empty (trimEnd=0) has zero-length dash. */
  it('handles line-draw start at trimEnd=0', () => {
    const result = computeTrimPathAttributes(300, 0, 0, 0);

    expect(result).not.toBeNull();
    expect(result?.dasharray).toBe('0 300');
    expect(result?.dashoffset).toBe('0');
  });
});

describe('computeBooleanPath', () => {
  /** @description Union of two non-overlapping rects should produce a combined path string extending to both. */
  it('produces a path for union of two children', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
      createElement({ id: 'r2', type: 'path', content: 'M50 50 L150 50 L150 150 L50 150 Z' }),
    ];

    const result = computeBooleanPath(children, 'union');

    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect((result ?? '').length).toBeGreaterThan(0);
    expect(result).toMatch(/150/);
  });

  /** @description Subtract should produce a different path than union. */
  it('produces a path for subtract operation', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
      createElement({ id: 'r2', type: 'path', content: 'M25 25 L75 25 L75 75 L25 75 Z' }),
    ];

    const result = computeBooleanPath(children, 'subtract');

    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  /** @description Intersect should produce only the overlapping region. */
  it('produces a path for intersect operation', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
      createElement({ id: 'r2', type: 'path', content: 'M50 50 L150 50 L150 150 L50 150 Z' }),
    ];

    const result = computeBooleanPath(children, 'intersect');

    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  /** @description Exclude should produce the XOR of two shapes. */
  it('produces a path for exclude operation', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
      createElement({ id: 'r2', type: 'path', content: 'M50 50 L150 50 L150 150 L50 150 Z' }),
    ];

    const result = computeBooleanPath(children, 'exclude');

    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  /** @description Fewer than 2 children should return null (no boolean op possible). */
  it('returns null for fewer than 2 children', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
    ];

    expect(computeBooleanPath(children, 'union')).toBeNull();
  });

  /** @description Null or absent operation returns null. */
  it('returns null when operation is not in the valid map', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 Z' }),
      createElement({ id: 'r2', type: 'path', content: 'M10 10 L50 10 Z' }),
    ];

    expect(computeBooleanPath(children, 'invalid')).toBeNull();
  });

  /** @description Children with empty content should be filtered out; if remaining < 2, returns null. */
  it('returns null when children have empty content', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
      createElement({ id: 'r2', type: 'path', content: '' }),
    ];

    expect(computeBooleanPath(children, 'union')).toBeNull();
  });

  /** @description Three-child union applies operations iteratively; result includes the third shape. */
  it('handles more than 2 children (iterative reduction)', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
      createElement({ id: 'r2', type: 'path', content: 'M50 0 L150 0 L150 100 L50 100 Z' }),
      createElement({ id: 'r3', type: 'path', content: 'M100 0 L200 0 L200 100 L100 100 Z' }),
    ];

    const result3 = computeBooleanPath(children, 'union');
    const result2 = computeBooleanPath(children.slice(0, 2), 'union');

    expect(result3).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result3).not.toEqual(result2);
    expect(result3).toMatch(/200/);
  });

  /** @description Non-path children (text, rectangle, etc.) are ignored when computing boolean paths. */
  it('ignores non-path children and returns null when fewer than 2 paths remain', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'rectangle', content: '' }),
      createElement({ id: 'r2', type: 'text', content: '<b>Hello</b>' }),
      createElement({ id: 'r3', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
    ];

    expect(computeBooleanPath(children, 'union')).toBeNull();
  });

  /** @description Malformed path data returns null instead of throwing. */
  it('returns null for malformed path data', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'not-valid-path' }),
      createElement({ id: 'r2', type: 'path', content: 'M0 0 L100 0 Z' }),
    ];

    expect(computeBooleanPath(children, 'union')).toBeNull();
  });
});
