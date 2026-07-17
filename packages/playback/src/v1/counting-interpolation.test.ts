import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { interpolateCountingV1 } from './counting-interpolation';

function count(options: {
  readonly from: string;
  readonly to: string;
  readonly progress: number;
  readonly minimumDigits?: number;
  readonly grouping?: boolean;
}): string | undefined {
  return interpolateCountingV1({
    from: options.from,
    to: options.to,
    progress: options.progress,
    rounding: 'round',
    minimumDigits: options.minimumDigits ?? 0,
    grouping: options.grouping ?? false,
  });
}

describe('interpolateCountingV1 thousands grouping', () => {
  it('groups digits in threes from the right', () => {
    expect(count({ from: '0', to: '1234567', progress: 1, grouping: true })).toBe('1,234,567');
    expect(count({ from: '0', to: '1000', progress: 1, grouping: true })).toBe('1,000');
    expect(count({ from: '0', to: '999', progress: 1, grouping: true })).toBe('999');
    expect(count({ from: '0', to: '-1234', progress: 1, grouping: true })).toBe('-1,234');
  });

  it('groups the zero-padded string, not the raw number', () => {
    expect(count({ from: '0', to: '1000000', progress: 1, minimumDigits: 9, grouping: true })).toBe('001,000,000');
  });
});

describe('interpolateCountingV1 pathological padding', () => {
  it('never throws or hangs on an absurd minimumDigits', () => {
    const result = count({ from: '0', to: '1', progress: 1, minimumDigits: 2_000_000_000, grouping: true });
    // Padding is clamped to the model bound; grouping adds at most one separator per group of three.
    const bound = projectFormatV1.PROJECT_V1_LIMITS.maxCountingMinimumDigits;

    expect(typeof result).toBe('string');
    expect((result ?? '').length).toBeLessThanOrEqual(bound * 2);
  });
});
