import { zlibSync } from 'fflate';

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_POLYNOMIAL = 0xedb88320;
const BITS_PER_CHANNEL = 8;
const RGB_COLOR_TYPE = 2;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < BITS_PER_CHANNEL; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : CRC_POLYNOMIAL);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const output = new Uint8Array(data.byteLength + 12);
  const view = new DataView(output.buffer);

  view.setUint32(0, data.byteLength);
  output.set(typeBytes, 4);
  output.set(data, 8);
  view.setUint32(data.byteLength + 8, crc32(concatenate([typeBytes, data])));

  return output;
}

function scanlines(input: {
  readonly rgb: Uint8Array;
  readonly width: number;
  readonly height: number;
}): Uint8Array {
  const rowBytes = input.width * 3;
  const output = new Uint8Array((rowBytes + 1) * input.height);

  for (let row = 0; row < input.height; row += 1) {
    const outputOffset = row * (rowBytes + 1);
    const inputOffset = row * rowBytes;

    output[outputOffset] = 0;
    output.set(input.rgb.subarray(inputOffset, inputOffset + rowBytes), outputOffset + 1);
  }

  return output;
}

export function encodeRgbPngV1(input: {
  readonly rgb: Uint8Array;
  readonly width: number;
  readonly height: number;
}): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);

  view.setUint32(0, input.width);
  view.setUint32(4, input.height);
  header[8] = BITS_PER_CHANNEL;
  header[9] = RGB_COLOR_TYPE;

  return concatenate([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlibSync(scanlines(input))),
    pngChunk('IEND', new Uint8Array()),
  ]);
}
