import type { Psd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { collectPsdTransferablesV1 } from './worker-transfer';

describe('PSD worker transfer budget', () => {
  it('deduplicates shared decoded buffers before transfer', () => {
    const pixels = new Uint8ClampedArray(16);
    const psd: Psd = {
      width: 2,
      height: 2,
      children: [
        { imageData: { data: pixels, width: 2, height: 2 } },
        { mask: { imageData: { data: pixels, width: 2, height: 2 } } },
      ],
    };

    const result = collectPsdTransferablesV1(psd, 4_096);

    expect(result).toMatchObject({ status: 'accepted' });
    expect(result.status === 'accepted' ? result.byteLength : 0).toBeGreaterThanOrEqual(16);
    expect(result.status === 'accepted' ? result.transfer.length : 0).toBe(1);
  });

  it('rejects decoded result buffers above the aggregate transfer cap', () => {
    const psd: Psd = {
      width: 2,
      height: 2,
      imageData: { data: new Uint8ClampedArray(17), width: 2, height: 2 },
    };

    expect(collectPsdTransferablesV1(psd, 16)).toEqual({ status: 'rejected' });
  });

  it('charges additional-info buffers and strings in the complete clone graph', () => {
    const additionalInfo = {
      adjustment: { type: 'color lookup', profile: new Uint8Array(1_024) },
      xmpMetadata: 'x'.repeat(1_024),
    };

    expect(collectPsdTransferablesV1(additionalInfo, 1_023)).toEqual({ status: 'rejected' });
    expect(collectPsdTransferablesV1({ xmpMetadata: 'x'.repeat(1_024) }, 1_023)).toEqual({ status: 'rejected' });
  });

  it('handles repeated and cyclic objects without charging them repeatedly', () => {
    const shared = { label: 'shared' };
    const cyclic: { self: unknown; readonly shared: unknown } = { self: undefined, shared };

    cyclic.self = cyclic;

    expect(collectPsdTransferablesV1({ first: shared, second: shared, cyclic }, 4_096)).toMatchObject({
      status: 'accepted',
    });
  });
});
