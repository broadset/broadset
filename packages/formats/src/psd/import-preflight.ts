import { productFitsLimit } from '../_shared/import-limits';
import { type PsdStructureIssueV1, scanPsdStructureV1 } from './import-preflight-structure';

interface PsdPreflightLimitsV1 {
  readonly maxInputBytes: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly maxChannels: number;
  readonly maxDecodedBytes: number;
  readonly maxLayers: number;
  readonly maxSectionBytes: number;
  readonly maxChannelBytes: number;
}

type PsdPreflightResultV1 =
  | {
      readonly status: 'accepted';
      readonly header: {
        readonly version: 1 | 2;
        readonly channels: number;
        readonly width: number;
        readonly height: number;
        readonly depth: 1 | 8 | 16 | 32;
      };
    }
  | {
      readonly status: 'rejected';
      readonly code:
        | 'input-size-limit'
        | 'malformed-header'
        | 'dimension-limit'
        | 'channel-limit'
        | 'decoded-size-limit'
        | PsdStructureIssueV1;
    };

export function preflightPsdV1(input: {
  readonly bytes: Uint8Array;
  readonly limits: PsdPreflightLimitsV1;
}): PsdPreflightResultV1 {
  if (input.bytes.byteLength > input.limits.maxInputBytes) return rejected('input-size-limit');
  if (input.bytes.byteLength < 38 || !hasPsdSignature(input.bytes)) return rejected('malformed-header');

  const view = new DataView(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength);
  const version = view.getUint16(4);
  const channels = view.getUint16(12);
  const height = view.getUint32(14);
  const width = view.getUint32(18);
  const depth = view.getUint16(22);

  if (version !== 1 && version !== 2) return rejected('malformed-header');
  if (depth !== 1 && depth !== 8 && depth !== 16 && depth !== 32) return rejected('malformed-header');

  if (width === 0 || height === 0 || width > input.limits.maxWidth || height > input.limits.maxHeight) {
    return rejected('dimension-limit');
  }

  if (channels === 0 || channels > input.limits.maxChannels) return rejected('channel-limit');

  const bytesPerChannel = Math.ceil(depth / 8);

  if (!productFitsLimit([width, height, (channels + 5) * bytesPerChannel], input.limits.maxDecodedBytes)) {
    return rejected('decoded-size-limit');
  }

  const structure = scanPsdStructureV1({
    bytes: input.bytes,
    version,
    width,
    height,
    channels,
    depth,
    limits: input.limits,
  });

  if (structure.status === 'rejected') return rejected(structure.code);

  return { status: 'accepted', header: { version, channels, width, height, depth } };
}

function hasPsdSignature(bytes: Uint8Array): boolean {
  return bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53;
}

function rejected(code: Extract<PsdPreflightResultV1, { readonly status: 'rejected' }>['code']): PsdPreflightResultV1 {
  return { status: 'rejected', code };
}
