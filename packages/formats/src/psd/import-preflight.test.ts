import { describe, expect, it } from 'vitest';

import { preflightPsdV1 } from './import-preflight';

function psdHeader(
  input: {
    readonly channels?: number;
    readonly width?: number;
    readonly height?: number;
    readonly depth?: number;
  } = {},
): Uint8Array {
  const bytes = new Uint8Array(38);
  const view = new DataView(bytes.buffer);

  bytes.set(new TextEncoder().encode('8BPS'), 0);
  view.setUint16(4, 1);
  view.setUint16(12, input.channels ?? 4);
  view.setUint32(14, input.height ?? 100);
  view.setUint32(18, input.width ?? 100);
  view.setUint16(22, input.depth ?? 8);
  view.setUint16(24, 3);
  view.setUint32(26, 0);
  view.setUint32(30, 0);
  view.setUint32(34, 0);

  return bytes;
}

const limits = {
  maxInputBytes: 1024,
  maxWidth: 1000,
  maxHeight: 1000,
  maxChannels: 8,
  maxDecodedBytes: 4 * 1024 * 1024,
  maxLayers: 100,
  maxSectionBytes: 512,
  maxChannelBytes: 256,
};

describe('PSD pre-decode preflight', () => {
  it('accepts a bounded PSD header', () => {
    expect(preflightPsdV1({ bytes: psdHeader(), limits })).toMatchObject({ status: 'accepted' });
  });

  it.each([
    ['dimension-limit', psdHeader({ width: 2000 })],
    ['channel-limit', psdHeader({ channels: 9 })],
    ['decoded-size-limit', psdHeader({ width: 1000, height: 1000, channels: 8, depth: 32 })],
  ])('rejects %s before decode', (code, bytes) => {
    expect(preflightPsdV1({ bytes, limits })).toEqual({ status: 'rejected', code });
  });

  it('rejects compressed input bytes before making an owned parser copy', () => {
    const bytes = new Uint8Array(2048);

    bytes.set(psdHeader());

    expect(preflightPsdV1({ bytes, limits })).toEqual({ status: 'rejected', code: 'input-size-limit' });
  });

  it('budgets the decoder RGBA output in addition to declared source channels', () => {
    expect(
      preflightPsdV1({
        bytes: psdHeader({ width: 100, height: 100, channels: 1 }),
        limits: { ...limits, maxDecodedBytes: 10_000 },
      }),
    ).toEqual({ status: 'rejected', code: 'decoded-size-limit' });
  });

  it('rejects oversized sections and layer counts before invoking ag-psd', () => {
    const oversizedSection = psdHeader();
    const tooManyLayers = new Uint8Array(44);
    const sectionView = new DataView(oversizedSection.buffer);
    const layersView = new DataView(tooManyLayers.buffer);

    tooManyLayers.set(psdHeader(), 0);
    sectionView.setUint32(26, 513);
    layersView.setUint32(34, 6);
    layersView.setUint32(38, 2);
    layersView.setInt16(42, 101);

    expect(preflightPsdV1({ bytes: oversizedSection, limits })).toEqual({
      status: 'rejected',
      code: 'section-size-limit',
    });
    expect(preflightPsdV1({ bytes: tooManyLayers, limits })).toEqual({
      status: 'rejected',
      code: 'layer-count-limit',
    });
  });

  it('bounds declared layer channel payloads and mask decoder surfaces', () => {
    const oversizedChannel = oneLayerPsd({ channelLength: 300 });
    const oversizedMask = oneLayerPsd({ maskBounds: [0, 0, 1000, 1000] });
    const oversizedRealMask = oneLayerPsd({
      maskBounds: [0, 0, 0, 0],
      realMaskBounds: [0, 0, 1000, 1000],
    });

    expect(preflightPsdV1({ bytes: oversizedChannel, limits })).toEqual({
      status: 'rejected',
      code: 'layer-channel-limit',
    });
    expect(preflightPsdV1({ bytes: oversizedMask, limits })).toEqual({
      status: 'rejected',
      code: 'decoded-size-limit',
    });
    expect(preflightPsdV1({ bytes: oversizedRealMask, limits })).toEqual({
      status: 'rejected',
      code: 'decoded-size-limit',
    });
  });
});

function oneLayerPsd(input: {
  readonly channelLength?: number;
  readonly maskBounds?: readonly [number, number, number, number];
  readonly realMaskBounds?: readonly [number, number, number, number];
}): Uint8Array {
  const channelCount = input.channelLength === undefined ? 0 : 1;
  const maskLength = psdMaskLength(input.maskBounds, input.realMaskBounds);
  const extraLength = 4 + maskLength + 4;
  const recordLength = 16 + 2 + channelCount * 6 + 12 + 4 + extraLength;
  const layerInfoLength = 2 + recordLength;
  const bytes = new Uint8Array(38 + 4 + layerInfoLength);
  const view = new DataView(bytes.buffer);

  bytes.set(psdHeader(), 0);
  view.setUint32(34, 4 + layerInfoLength);
  view.setUint32(38, layerInfoLength);
  view.setInt16(42, 1);
  view.setUint16(60, channelCount);

  let offset = 62;

  if (input.channelLength !== undefined) {
    view.setInt16(offset, 0);
    view.setUint32(offset + 2, input.channelLength);
    offset += 6;
  }

  bytes.set(new TextEncoder().encode('8BIMnorm'), offset);
  offset += 12;
  view.setUint32(offset, extraLength);
  offset += 4;
  view.setUint32(offset, maskLength);
  offset += 4;

  if (input.maskBounds !== undefined) {
    const [top, left, bottom, right] = input.maskBounds;

    view.setInt32(offset, top);
    view.setInt32(offset + 4, left);
    view.setInt32(offset + 8, bottom);
    view.setInt32(offset + 12, right);
    offset += 18;
  }

  if (input.realMaskBounds !== undefined) {
    const [top, left, bottom, right] = input.realMaskBounds;

    offset += 2;
    view.setInt32(offset, top);
    view.setInt32(offset + 4, left);
    view.setInt32(offset + 8, bottom);
    view.setInt32(offset + 12, right);
    offset += 16;
  }

  view.setUint32(offset, 0);

  return bytes;
}

function psdMaskLength(
  maskBounds: readonly [number, number, number, number] | undefined,
  realMaskBounds: readonly [number, number, number, number] | undefined,
): number {
  if (realMaskBounds !== undefined) return 36;

  return maskBounds === undefined ? 0 : 18;
}
