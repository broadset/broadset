import { describe, expect, it } from 'vitest';

import { spatialValueToCssPixelsV1 } from './physical-units';

describe('spatialValueToCssPixelsV1', () => {
  it('converts px, mm, and inches at the declared DPI', () => {
    expect(spatialValueToCssPixelsV1(25.4, { unit: 'mm', dpi: 254 })).toBe(254);
    expect(spatialValueToCssPixelsV1(2, { unit: 'in', dpi: 254 })).toBe(508);
    expect(spatialValueToCssPixelsV1(42, { unit: 'px', dpi: 254 })).toBe(42);
  });

  it('fails soft to zero for non-finite values or an unusable DPI', () => {
    expect(spatialValueToCssPixelsV1(Number.NaN, { unit: 'px', dpi: 96 })).toBe(0);
    expect(spatialValueToCssPixelsV1(10, { unit: 'mm', dpi: 0 })).toBe(0);
  });
});
