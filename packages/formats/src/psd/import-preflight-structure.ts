import { productFitsLimit } from '../_shared/import-limits';

interface PsdStructureLimitsV1 {
  readonly maxLayers: number;
  readonly maxChannels: number;
  readonly maxSectionBytes: number;
  readonly maxChannelBytes: number;
  readonly maxDecodedBytes: number;
}

export type PsdStructureIssueV1 =
  | 'malformed-header'
  | 'section-size-limit'
  | 'layer-count-limit'
  | 'channel-limit'
  | 'layer-channel-limit'
  | 'decoded-size-limit';

interface Cursor {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  /** Advances monotonically while the fixed preflight scanner reads bytes. */
  offset: number;
}

interface ScanContext {
  readonly cursor: Cursor;
  readonly limits: PsdStructureLimitsV1;
  readonly large: boolean;
  readonly bytesPerChannel: number;
  /** Accumulates conservative decoder allocation estimates across surfaces. */
  decodedBytes: number;
}

type ScanResult = { readonly status: 'accepted' } | { readonly status: 'rejected'; readonly code: PsdStructureIssueV1 };

export function scanPsdStructureV1(input: {
  readonly bytes: Uint8Array;
  readonly version: 1 | 2;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly depth: 1 | 8 | 16 | 32;
  readonly limits: PsdStructureLimitsV1;
}): ScanResult {
  const cursor: Cursor = {
    bytes: input.bytes,
    view: new DataView(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength),
    offset: 26,
  };
  const context: ScanContext = {
    cursor,
    limits: input.limits,
    large: input.version === 2,
    bytesPerChannel: Math.ceil(input.depth / 8),
    decodedBytes: 0,
  };

  if (!addDecodedSurface(context, input.width, input.height, input.channels)) {
    return rejected('decoded-size-limit');
  }

  const colorMode = skipBoundedSection(context, false);

  if (colorMode.status === 'rejected') return colorMode;

  const imageResources = skipBoundedSection(context, false);

  if (imageResources.status === 'rejected') return imageResources;

  return scanLayerAndMaskSection(context);
}

function skipBoundedSection(context: ScanContext, large: boolean): ScanResult {
  const length = readLength(context.cursor, large);

  if (length === undefined) return rejected('malformed-header');
  if (length > context.limits.maxSectionBytes) return rejected('section-size-limit');
  if (!skip(context.cursor, length)) return rejected('malformed-header');

  return accepted();
}

function scanLayerAndMaskSection(context: ScanContext): ScanResult {
  const sectionLength = readLength(context.cursor, context.large);

  if (sectionLength === undefined) return rejected('malformed-header');
  if (sectionLength > context.limits.maxSectionBytes) return rejected('section-size-limit');
  if (!hasBytes(context.cursor, sectionLength)) return rejected('malformed-header');
  if (sectionLength === 0) return accepted();

  const sectionEnd = context.cursor.offset + sectionLength;
  const layerInfoLength = readLength(context.cursor, context.large);

  if (layerInfoLength === undefined || context.cursor.offset + layerInfoLength > sectionEnd) {
    return rejected('malformed-header');
  }

  if (layerInfoLength > context.limits.maxSectionBytes) return rejected('section-size-limit');

  if (layerInfoLength === 0) {
    context.cursor.offset = sectionEnd;

    return accepted();
  }

  const layerInfoEnd = context.cursor.offset + layerInfoLength;
  const result = scanLayerInfo(context, layerInfoEnd);

  if (result.status === 'rejected') return result;

  context.cursor.offset = sectionEnd;

  return accepted();
}

function scanLayerInfo(context: ScanContext, layerInfoEnd: number): ScanResult {
  const signedCount = readInt16(context.cursor);

  if (signedCount === undefined) return rejected('malformed-header');

  const layerCount = Math.abs(signedCount);

  if (layerCount > context.limits.maxLayers) return rejected('layer-count-limit');

  let declaredChannelBytes = 0;

  for (let index = 0; index < layerCount; index += 1) {
    const record = scanLayerRecord(context, layerInfoEnd);

    if (record.status === 'rejected') return record;

    declaredChannelBytes += record.channelBytes;

    if (declaredChannelBytes > layerInfoEnd - context.cursor.offset) return rejected('malformed-header');
  }

  return declaredChannelBytes <= layerInfoEnd - context.cursor.offset ? accepted() : rejected('malformed-header');
}

type LayerRecordResult =
  | { readonly status: 'accepted'; readonly channelBytes: number }
  | { readonly status: 'rejected'; readonly code: PsdStructureIssueV1 };

function scanLayerRecord(context: ScanContext, layerInfoEnd: number): LayerRecordResult {
  const header = readLayerHeader(context.cursor);

  if (header === undefined) return rejected('malformed-header');

  const { top, left, bottom, right, channelCount } = header;

  if (channelCount > context.limits.maxChannels) return rejected('channel-limit');

  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);

  if (!addDecodedSurface(context, width, height, channelCount)) return rejected('decoded-size-limit');

  const channels = scanLayerChannels(context, channelCount);

  if (channels.status === 'rejected') return channels;

  if (!skip(context.cursor, 12)) return rejected('malformed-header');

  const extraLength = readUint32(context.cursor);

  if (extraLength === undefined || extraLength > context.limits.maxSectionBytes) {
    return rejected(extraLength === undefined ? 'malformed-header' : 'section-size-limit');
  }

  const extraEnd = context.cursor.offset + extraLength;

  if (extraEnd > layerInfoEnd) return rejected('malformed-header');

  const maskResult = scanLayerMask(context, extraEnd);

  if (maskResult.status === 'rejected') return maskResult;

  const blendingLength = readUint32(context.cursor);

  if (blendingLength === undefined || blendingLength > extraEnd - context.cursor.offset) {
    return rejected('malformed-header');
  }

  if (blendingLength > context.limits.maxSectionBytes) return rejected('section-size-limit');

  context.cursor.offset = extraEnd;

  return { status: 'accepted', channelBytes: channels.channelBytes };
}

function readLayerHeader(cursor: Cursor):
  | {
      readonly top: number;
      readonly left: number;
      readonly bottom: number;
      readonly right: number;
      readonly channelCount: number;
    }
  | undefined {
  const top = readInt32(cursor);
  const left = readInt32(cursor);
  const bottom = readInt32(cursor);
  const right = readInt32(cursor);
  const channelCount = readUint16(cursor);

  return (
      top === undefined ||
        left === undefined ||
        bottom === undefined ||
        right === undefined ||
        channelCount === undefined
    ) ?
      undefined
    : { top, left, bottom, right, channelCount };
}

function scanLayerChannels(context: ScanContext, channelCount: number): LayerRecordResult {
  let channelBytes = 0;

  for (let index = 0; index < channelCount; index += 1) {
    const channelLength = readChannelLength(context.cursor, context.large);

    if (channelLength === undefined) return rejected('malformed-header');
    if (channelLength > context.limits.maxChannelBytes) return rejected('layer-channel-limit');

    channelBytes += channelLength;

    if (channelBytes > context.limits.maxSectionBytes) return rejected('layer-channel-limit');
  }

  return { status: 'accepted', channelBytes };
}

function scanLayerMask(context: ScanContext, extraEnd: number): ScanResult {
  const maskLength = readUint32(context.cursor);

  if (maskLength === undefined || maskLength > extraEnd - context.cursor.offset) return rejected('malformed-header');
  if (maskLength > context.limits.maxSectionBytes) return rejected('section-size-limit');
  if (maskLength === 0) return accepted();

  const maskEnd = context.cursor.offset + maskLength;

  if (maskLength < 18) {
    context.cursor.offset = maskEnd;

    return accepted();
  }

  const result = scanMaskBounds(context);

  if (result.status === 'rejected') return result;

  if (!skip(context.cursor, 2)) return rejected('malformed-header');

  if (maskLength >= 36) {
    if (!skip(context.cursor, 2)) return rejected('malformed-header');

    const realMaskResult = scanMaskBounds(context);

    if (realMaskResult.status === 'rejected') return realMaskResult;
  }

  context.cursor.offset = maskEnd;

  return accepted();
}

function scanMaskBounds(context: ScanContext): ScanResult {
  const top = readInt32(context.cursor);
  const left = readInt32(context.cursor);
  const bottom = readInt32(context.cursor);
  const right = readInt32(context.cursor);

  if (top === undefined || left === undefined || bottom === undefined || right === undefined) {
    return rejected('malformed-header');
  }

  return addDecodedSurface(context, Math.max(0, right - left), Math.max(0, bottom - top), 1) ? accepted() : (
      rejected('decoded-size-limit')
    );
}

function addDecodedSurface(context: ScanContext, width: number, height: number, channels: number): boolean {
  // ag-psd materializes source-channel decode buffers and a 4-channel
  // output. Five output channels conservatively covers its CMYK staging.
  const outputChannels = 5;
  const bytesPerPixel = (channels + outputChannels) * context.bytesPerChannel;
  const remaining = context.limits.maxDecodedBytes - context.decodedBytes;

  if (remaining < 0 || !productFitsLimit([width, height, bytesPerPixel], remaining)) return false;

  context.decodedBytes += width * height * bytesPerPixel;

  return true;
}

function readChannelLength(cursor: Cursor, large: boolean): number | undefined {
  if (readInt16(cursor) === undefined) return undefined;

  if (!large) return readUint32(cursor);

  const high = readUint32(cursor);
  const low = readUint32(cursor);

  return high === 0 ? low : undefined;
}

function readLength(cursor: Cursor, large: boolean): number | undefined {
  if (!large) return readUint32(cursor);

  const high = readUint32(cursor);
  const low = readUint32(cursor);

  return high === 0 ? low : undefined;
}

function readUint16(cursor: Cursor): number | undefined {
  if (!hasBytes(cursor, 2)) return undefined;

  const value = cursor.view.getUint16(cursor.offset);

  cursor.offset += 2;

  return value;
}

function readInt16(cursor: Cursor): number | undefined {
  if (!hasBytes(cursor, 2)) return undefined;

  const value = cursor.view.getInt16(cursor.offset);

  cursor.offset += 2;

  return value;
}

function readUint32(cursor: Cursor): number | undefined {
  if (!hasBytes(cursor, 4)) return undefined;

  const value = cursor.view.getUint32(cursor.offset);

  cursor.offset += 4;

  return value;
}

function readInt32(cursor: Cursor): number | undefined {
  if (!hasBytes(cursor, 4)) return undefined;

  const value = cursor.view.getInt32(cursor.offset);

  cursor.offset += 4;

  return value;
}

function hasBytes(cursor: Cursor, length: number): boolean {
  return length >= 0 && cursor.offset <= cursor.bytes.byteLength - length;
}

function skip(cursor: Cursor, length: number): boolean {
  if (!hasBytes(cursor, length)) return false;

  cursor.offset += length;

  return true;
}

function accepted(): ScanResult {
  return { status: 'accepted' };
}

function rejected(code: PsdStructureIssueV1): { readonly status: 'rejected'; readonly code: PsdStructureIssueV1 } {
  return { status: 'rejected', code };
}
