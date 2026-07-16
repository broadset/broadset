import { strToU8, zlibSync } from 'fflate';
import { decodePDFRawStream, PDFContext, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { decodePdfRawStreamBoundedV1 } from './bounded-stream';

describe('bounded PDF stream decoding', () => {
  it('rejects zlib output as soon as it exceeds the decode budget', () => {
    const context = PDFContext.create();
    const decoded = new Uint8Array(4096).fill(7);
    const stream = PDFRawStream.of(context.obj({ Filter: 'FlateDecode' }), zlibSync(decoded));

    expect(decodePdfRawStreamBoundedV1({ stream, maxOutputBytes: 64 })).toEqual({
      status: 'rejected',
      reason: 'output-limit',
    });
  });

  it('returns bounded decoded bytes', () => {
    const context = PDFContext.create();
    const decoded = new Uint8Array([1, 2, 3, 4]);
    const supported = PDFRawStream.of(context.obj({ Filter: 'FlateDecode' }), zlibSync(decoded));

    expect(decodePdfRawStreamBoundedV1({ stream: supported, maxOutputBytes: 4 })).toEqual({
      status: 'decoded',
      bytes: decoded,
    });
  });

  it('decodes an ASCII85 and Flate chain used by producer content streams', () => {
    const context = PDFContext.create();
    const decoded = strToU8('BT /F1 12 Tf 10 20 Td (Chained producer text) Tj ET');
    const encoded = ascii85Encode(zlibSync(decoded));
    const stream = PDFRawStream.of(
      context.obj({ Filter: [PDFName.of('ASCII85Decode'), PDFName.of('FlateDecode')] }),
      encoded,
    );

    const result = decodePdfRawStreamBoundedV1({ stream, maxOutputBytes: decoded.byteLength });

    expect(result.status).toBe('decoded');
    expect(result.status === 'decoded' ? [...result.bytes] : []).toEqual([...decoded]);
  });

  it('decodes bounded LZW and RunLength producer streams', () => {
    const context = PDFContext.create();
    const lzw = PDFRawStream.of(context.obj({ Filter: 'LZWDecode' }), packNineBitCodes([256, 65, 66, 258, 257]));
    const runLength = PDFRawStream.of(
      context.obj({ Filter: 'RunLengthDecode' }),
      new Uint8Array([2, 65, 66, 67, 254, 90, 128]),
    );

    const lzwResult = decodePdfRawStreamBoundedV1({ stream: lzw, maxOutputBytes: 4 });
    const runLengthResult = decodePdfRawStreamBoundedV1({ stream: runLength, maxOutputBytes: 6 });

    expect(lzwResult.status === 'decoded' ? [...lzwResult.bytes] : []).toEqual([65, 66, 65, 66]);
    expect(runLengthResult.status === 'decoded' ? [...runLengthResult.bytes] : []).toEqual([65, 66, 67, 90, 90, 90]);
  });

  it('decodes ASCIIHex including a padded final nibble', () => {
    const context = PDFContext.create();
    const stream = PDFRawStream.of(
      context.obj({ Filter: 'ASCIIHexDecode' }),
      strToU8('48656c6c6f4>'),
    );
    const result = decodePdfRawStreamBoundedV1({ stream, maxOutputBytes: 6 });

    expect(result.status === 'decoded' ? [...result.bytes] : []).toEqual([72, 101, 108, 108, 111, 64]);
  });

  it('aligns filter-array DecodeParms and honors LZW EarlyChange zero', () => {
    const context = PDFContext.create();
    const decoded = Uint8Array.from({ length: 260 }, (_value, index) => index % 251);
    const lzw = packLzwLiteralStream(decoded, 0);
    const encoded = asciiHexEncode(lzw);
    const asciiOnly = PDFRawStream.of(context.obj({ Filter: 'AHx' }), encoded);
    const lzwOnly = PDFRawStream.of(
      context.obj({ Filter: 'LZWDecode', DecodeParms: { EarlyChange: 0 } }),
      lzw,
    );
    const stream = PDFRawStream.of(
      context.obj({
        Filter: [PDFName.of('AHx'), PDFName.of('LZWDecode')],
        DecodeParms: [null, { EarlyChange: 0 }],
      }),
      encoded,
    );
    const asciiResult = decodePdfRawStreamBoundedV1({ stream: asciiOnly, maxOutputBytes: lzw.byteLength });
    const result = decodePdfRawStreamBoundedV1({ stream, maxOutputBytes: decoded.byteLength });

    expect(asciiResult).toEqual({ status: 'decoded', bytes: lzw });
    expect([...decodePDFRawStream(lzwOnly).decode()]).toEqual([...decoded]);
    expect(result).toEqual({ status: 'decoded', bytes: decoded });
  });

  it('enforces the output budget at every filter stage', () => {
    const context = PDFContext.create();
    const encoded = ascii85Encode(zlibSync(new Uint8Array(4096).fill(3)));
    const stream = PDFRawStream.of(
      context.obj({ Filter: [PDFName.of('ASCII85Decode'), PDFName.of('FlateDecode')] }),
      encoded,
    );

    expect(decodePdfRawStreamBoundedV1({ stream, maxOutputBytes: 64 })).toEqual({
      status: 'rejected',
      reason: 'output-limit',
    });
  });

  it('rejects an overlong nested filter chain before decoding it', () => {
    const context = PDFContext.create();
    const decoded = new Uint8Array([1, 2, 3, 4]);
    let encoded: Uint8Array = decoded;

    for (let index = 0; index < 5; index += 1) encoded = zlibSync(encoded);

    const stream = PDFRawStream.of(
      context.obj({ Filter: Array.from({ length: 5 }, () => PDFName.of('FlateDecode')) }),
      encoded,
    );

    expect(decodePdfRawStreamBoundedV1({ stream, maxOutputBytes: decoded.byteLength })).toEqual({
      status: 'rejected',
      reason: 'filter-limit',
    });
  });

  it('rejects aggregate decode work across an allowed-length chain', () => {
    const context = PDFContext.create();
    const decoded = new Uint8Array(64).fill(7);
    let encoded: Uint8Array = decoded;

    for (let index = 0; index < 4; index += 1) encoded = runLengthLiteralEncode(encoded);

    const stream = PDFRawStream.of(
      context.obj({ Filter: Array.from({ length: 4 }, () => PDFName.of('RunLengthDecode')) }),
      encoded,
    );

    expect(decodePdfRawStreamBoundedV1({ stream, maxOutputBytes: encoded.byteLength })).toEqual({
      status: 'rejected',
      reason: 'work-limit',
    });
  });

  it('charges repeated LZW clear codes against the operation budget', () => {
    const context = PDFContext.create();
    const codes = [...Array.from({ length: 2_000 }, () => 256), 257];
    const stream = PDFRawStream.of(context.obj({ Filter: 'LZWDecode' }), packNineBitCodes(codes));

    expect([...decodePDFRawStream(stream).decode()]).toEqual([]);

    expect(decodePdfRawStreamBoundedV1({ stream, maxOutputBytes: 0 })).toEqual({
      status: 'rejected',
      reason: 'work-limit',
    });
  });
});

function runLengthLiteralEncode(bytes: Uint8Array): Uint8Array {
  const encoded: number[] = [];

  for (let offset = 0; offset < bytes.byteLength; offset += 128) {
    const chunk = bytes.subarray(offset, Math.min(bytes.byteLength, offset + 128));

    encoded.push(chunk.byteLength - 1, ...chunk);
  }

  encoded.push(128);

  return new Uint8Array(encoded);
}

function ascii85Encode(bytes: Uint8Array): Uint8Array {
  let encoded = '';

  for (let offset = 0; offset < bytes.byteLength; offset += 4) {
    const remaining = Math.min(4, bytes.byteLength - offset);
    let value = 0;

    for (let index = 0; index < 4; index += 1) value = value * 256 + (bytes[offset + index] ?? 0);

    if (remaining === 4 && value === 0) {
      encoded += 'z';
      continue;
    }

    const digits = new Array<number>(5);

    for (let index = 4; index >= 0; index -= 1) {
      digits[index] = value % 85;
      value = Math.floor(value / 85);
    }

    encoded += digits.slice(0, remaining + 1).map((digit) => String.fromCharCode(digit + 33)).join('');
  }

  return strToU8(`${encoded}~>`);
}

function packNineBitCodes(codes: readonly number[]): Uint8Array {
  const output: number[] = [];
  let pending = 0;
  let pendingBits = 0;

  for (const code of codes) {
    pending = pending * 512 + code;
    pendingBits += 9;

    while (pendingBits >= 8) {
      pendingBits -= 8;

      const divisor = 2 ** pendingBits;

      output.push(Math.floor(pending / divisor) % 256);
      pending %= divisor;
    }
  }

  if (pendingBits > 0) output.push((pending * 2 ** (8 - pendingBits)) % 256);

  return new Uint8Array(output);
}

function asciiHexEncode(bytes: Uint8Array): Uint8Array {
  return strToU8(`${[...bytes].map((byte: number): string => byte.toString(16).padStart(2, '0')).join('')}>`);
}

function packLzwLiteralStream(bytes: Uint8Array, earlyChange: 0 | 1): Uint8Array {
  const output: number[] = [];
  const state = { pending: 0, pendingBits: 0 };
  let codeWidth = 9;
  let nextCode = 258;
  let hasPrevious = false;

  appendPackedCode({ output, state, code: 256, width: codeWidth });

  for (let index = 0; index < bytes.byteLength; index += 1) {
    appendPackedCode({ output, state, code: bytes[index] ?? 0, width: codeWidth });

    if (hasPrevious) {
      nextCode += 1;
      if (codeWidth < 12 && nextCode + earlyChange === 2 ** codeWidth) codeWidth += 1;
    }

    hasPrevious = true;
  }

  appendPackedCode({ output, state, code: 257, width: codeWidth });

  if (state.pendingBits > 0) output.push((state.pending * 2 ** (8 - state.pendingBits)) % 256);

  return new Uint8Array(output);
}

function appendPackedCode(input: {
  readonly output: number[];
  readonly state: { pending: number; pendingBits: number };
  readonly code: number;
  readonly width: number;
}): void {
  input.state.pending = input.state.pending * 2 ** input.width + input.code;
  input.state.pendingBits += input.width;

  while (input.state.pendingBits >= 8) {
    input.state.pendingBits -= 8;

    const divisor = 2 ** input.state.pendingBits;

    input.output.push(Math.floor(input.state.pending / divisor) % 256);
    input.state.pending %= divisor;
  }
}
