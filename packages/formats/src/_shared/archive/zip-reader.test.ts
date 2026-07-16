import { Zip, ZipPassThrough, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { readBoundedZip } from './zip-reader';

const generousLimits = {
  maxInputBytes: 1024 * 1024,
  maxEntries: 32,
  maxEntryBytes: 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024,
  maxExpansionRatio: 100,
  maxPathDepth: 8,
};

describe('shared bounded ZIP reader', () => {
  it('enforces the central-directory entry count before exposing over-cap entries', () => {
    const result = readBoundedZip({
      bytes: zipSync({ 'a.bin': new Uint8Array([1]), 'b.bin': new Uint8Array([2]) }),
      limits: { ...generousLimits, maxEntries: 1 },
    });

    expect(result.entries.size).toBe(1);
    expect(result.issues.some(({ code }) => code === 'entry-count-limit')).toBe(true);
  });

  it('rejects traversal, absolute, backslash, NUL, and over-depth paths before exposure', () => {
    const paths = [
      '../escape.bin',
      '/absolute.bin',
      'C:/absolute.bin',
      'ppt\\evil.bin',
      'nul\0name.bin',
      'a/b/c/d/e.bin',
    ];

    for (const path of paths) {
      const result = readBoundedZip({
        bytes: zipSync({ [path]: new Uint8Array([1]) }),
        limits: { ...generousLimits, maxPathDepth: 3 },
      });

      expect(result.entries.size).toBe(0);
      expect(result.issues.some(({ code }) => code === 'invalid-path' || code === 'path-depth-limit')).toBe(true);
    }
  });

  it('rejects suspicious compression ratios before inflating an entry', () => {
    const result = readBoundedZip({
      bytes: zipSync({ 'ppt/media/bomb.bin': new Uint8Array(128 * 1024) }),
      limits: { ...generousLimits, maxExpansionRatio: 2 },
    });

    expect(result.entries.has('ppt/media/bomb.bin')).toBe(false);
    expect(result.issues.some(({ code }) => code === 'expansion-ratio-limit')).toBe(true);
  });

  it('enforces cumulative declared bytes and returns malformed archives without throwing', () => {
    const capped = readBoundedZip({
      bytes: zipSync({ 'a.bin': new Uint8Array(8), 'b.bin': new Uint8Array(8) }),
      limits: { ...generousLimits, maxTotalBytes: 12 },
    });
    const malformed = readBoundedZip({ bytes: new Uint8Array([1, 2, 3]), limits: generousLimits });

    expect(capped.entries.size).toBe(1);
    expect(capped.issues.some(({ code }) => code === 'total-size-limit')).toBe(true);
    expect(malformed.status).toBe('rejected');
    expect(malformed.issues.some(({ code }) => code === 'malformed-archive')).toBe(true);
  });

  it('rejects duplicate canonical paths instead of accepting last-entry-wins ambiguity', async () => {
    const result = readBoundedZip({ bytes: await duplicatePathZip(), limits: generousLimits });

    expect(result.status).toBe('rejected');
    expect(result.entries.size).toBe(0);
    expect(result.issues.some(({ code }) => code === 'duplicate-path')).toBe(true);
    expect(result.issues.some(({ code }) => code === 'malformed-archive')).toBe(true);
  });

  it('treats canonically equivalent Unicode paths as duplicates', () => {
    const result = readBoundedZip({
      bytes: zipSync({ 'café.bin': new Uint8Array([1]), 'café.bin': new Uint8Array([2]) }),
      limits: generousLimits,
    });

    expect(result.status).toBe('rejected');
    expect(result.entries.size).toBe(0);
    expect(result.issues.some(({ code }) => code === 'duplicate-path')).toBe(true);
  });

  it('rejects a non-canonical Unicode path instead of silently omitting it', () => {
    const result = readBoundedZip({
      bytes: zipSync({ 'café.bin': new Uint8Array([1]) }),
      limits: generousLimits,
    });

    expect(result.entries.size).toBe(0);
    expect(result.issues.some(({ code }) => code === 'invalid-path')).toBe(true);
  });

  it('enforces entry limits against emitted bytes when declared output size is forged to zero', () => {
    const archive = zipSync({ 'payload.bin': new Uint8Array(4096).fill(7) });

    patchAllSignatures(archive, 0x0403_4b50, 22, 0);
    patchAllSignatures(archive, 0x0201_4b50, 24, 0);

    const result = readBoundedZip({
      bytes: archive,
      limits: { ...generousLimits, maxEntryBytes: 64 },
    });

    expect(result.entries.size).toBe(0);
    expect(result.issues.some(({ code }) => code === 'declared-size-mismatch')).toBe(true);
  });

  it('checks emitted length and CRC before exposing an entry', async () => {
    const wrongLength = await streamedZip('length.bin', new Uint8Array([1, 2, 3, 4]));
    const wrongChecksum = await streamedZip('checksum.bin', new Uint8Array([5, 6, 7, 8]));

    patchAllSignatures(wrongLength, 0x0201_4b50, 24, 1);
    patchAllSignatures(wrongChecksum, 0x0201_4b50, 16, 0);

    const lengthResult = readBoundedZip({ bytes: wrongLength, limits: generousLimits });
    const checksumResult = readBoundedZip({ bytes: wrongChecksum, limits: generousLimits });

    expect(lengthResult.entries.size).toBe(0);
    expect(
      lengthResult.issues.some(({ code }) => code === 'declared-size-mismatch' || code === 'malformed-archive'),
    ).toBe(true);
    expect(checksumResult.entries.size).toBe(0);
    expect(checksumResult.issues.some(({ code }) => code === 'checksum-mismatch' || code === 'malformed-archive')).toBe(
      true,
    );
  });

  it('rejects disagreement between local and central metadata before decompression', () => {
    const archive = zipSync({ 'payload.bin': new Uint8Array([1, 2, 3]) });

    patchAllSignatures(archive, 0x0201_4b50, 24, 0);

    const result = readBoundedZip({ bytes: archive, limits: generousLimits });

    expect(result.status).toBe('rejected');
    expect(result.issues.some(({ code }) => code === 'malformed-archive')).toBe(true);
  });

  it('skips unsupported compression entry-locally while preserving unaffected entries', () => {
    const archive = zipSync({ 'bad.bin': new Uint8Array([1]), 'good.bin': new Uint8Array([2]) });

    patchNthSignature({ bytes: archive, signature: 0x0403_4b50, fieldOffset: 8, value: 99, valueBytes: 2 });
    patchNthSignature({ bytes: archive, signature: 0x0201_4b50, fieldOffset: 10, value: 99, valueBytes: 2 });

    const result = readBoundedZip({ bytes: archive, limits: generousLimits });

    expect(result.entries.has('bad.bin')).toBe(false);
    expect(result.entries.get('good.bin')).toEqual(new Uint8Array([2]));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'unsupported-compression', path: 'bad.bin' }));
  });

  it('rejects a Unix symlink entry before exposing its payload', () => {
    const archive = zipSync({ 'linked.bin': new Uint8Array([1]) });

    patchNthSignature({ bytes: archive, signature: 0x0201_4b50, fieldOffset: 5, value: 3, valueBytes: 2 });
    patchNthSignature({
      bytes: archive,
      signature: 0x0201_4b50,
      fieldOffset: 38,
      value: 0xa000_0000,
      valueBytes: 4,
    });

    const result = readBoundedZip({ bytes: archive, limits: generousLimits });

    expect(result.entries.size).toBe(0);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid-path', path: 'linked.bin' }));
  });

  it('rejects symlink mode bits from an alternate creator host', () => {
    const archive = zipSync({ 'linked.bin': new Uint8Array([1]) });

    patchNthSignature({ bytes: archive, signature: 0x0201_4b50, fieldOffset: 5, value: 19, valueBytes: 2 });
    patchNthSignature({
      bytes: archive,
      signature: 0x0201_4b50,
      fieldOffset: 38,
      value: 0xa000_0000,
      valueBytes: 4,
    });

    const result = readBoundedZip({ bytes: archive, limits: generousLimits });

    expect(result.entries.size).toBe(0);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid-path', path: 'linked.bin' }));
  });

  it('rejects a local-only record instead of silently ignoring it', () => {
    const archive = insertLocalRecord(
      zipSync({ 'listed.bin': new Uint8Array([1]) }),
      zipSync({ 'local-only.bin': new Uint8Array([2]) }),
    );

    const result = readBoundedZip({ bytes: archive, limits: generousLimits });

    expect(result.status).toBe('rejected');
    expect(result.entries.size).toBe(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'malformed-archive', path: 'local-only.bin' }),
    );
  });

  it('rejects duplicate same-name local-record smuggling', () => {
    const archive = insertLocalRecord(
      zipSync({ 'same.bin': new Uint8Array([1]) }),
      zipSync({ 'same.bin': new Uint8Array([9]) }),
    );

    const result = readBoundedZip({ bytes: archive, limits: generousLimits });

    expect(result.status).toBe('rejected');
    expect(result.entries.size).toBe(0);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'malformed-archive', path: 'same.bin' }));
  });

  it('rejects signed data-descriptor CRC and size mismatches', async () => {
    const crcMismatch = await streamedZip('signed-crc.bin', new Uint8Array([1, 2, 3]));
    const sizeMismatch = await streamedZip('signed-size.bin', new Uint8Array([1, 2, 3]));
    const crcDescriptor = findSignatureOffset(crcMismatch, 0x0807_4b50);
    const sizeDescriptor = findSignatureOffset(sizeMismatch, 0x0807_4b50);

    patchUint32(crcMismatch, crcDescriptor + 4, 0);
    patchUint32(sizeMismatch, sizeDescriptor + 8, 0);

    expect(readBoundedZip({ bytes: crcMismatch, limits: generousLimits })).toMatchObject({ status: 'rejected' });
    expect(readBoundedZip({ bytes: sizeMismatch, limits: generousLimits })).toMatchObject({ status: 'rejected' });
  });

  it('accepts an unsigned data descriptor and rejects its inconsistent fields', async () => {
    const signed = await streamedZip('unsigned.bin', new Uint8Array([1, 2, 3]));
    const descriptorOffset = findSignatureOffset(signed, 0x0807_4b50);
    const unsigned = removeBytes(signed, descriptorOffset, 4);

    adjustDirectoryOffset(unsigned, -4);

    const accepted = readBoundedZip({ bytes: unsigned, limits: generousLimits });
    const mismatch = unsigned.slice();

    patchUint32(mismatch, descriptorOffset, 0);

    expect(accepted.status).toBe('read');
    expect(accepted.issues).toEqual([]);
    expect(accepted.entries.get('unsigned.bin')).toEqual(new Uint8Array([1, 2, 3]));
    expect(readBoundedZip({ bytes: mismatch, limits: generousLimits })).toMatchObject({ status: 'rejected' });
  });

  it.each([
    ['signed', true],
    ['unsigned', false],
  ])('accepts a forced-ZIP64 small entry with a %s data descriptor', (_label, signed) => {
    const archive = forcedZip64DescriptorZip(signed);

    const result = readBoundedZip({ bytes: archive, limits: generousLimits });

    expect(result.status).toBe('read');
    expect(result.issues).toEqual([]);
    expect(result.entries.get('forced-zip64.bin')).toEqual(new Uint8Array([1, 2, 3]));
  });
});

function forcedZip64DescriptorZip(signed: boolean): Uint8Array {
  const name = new TextEncoder().encode('forced-zip64.bin');
  const payload = new Uint8Array([1, 2, 3]);
  const descriptorBytes = (signed ? 4 : 0) + 20;
  const localBytes = 30 + name.byteLength + payload.byteLength + descriptorBytes;
  const centralExtraBytes = 20;
  const centralBytes = 46 + name.byteLength + centralExtraBytes;
  const bytes = new Uint8Array(localBytes + centralBytes + 22);
  const view = new DataView(bytes.buffer);
  const flags = 0x0808;
  const crc32 = 0x55bc_801d;

  view.setUint32(0, 0x0403_4b50, true);
  view.setUint16(4, 45, true);
  view.setUint16(6, flags, true);
  view.setUint16(26, name.byteLength, true);
  bytes.set(name, 30);
  bytes.set(payload, 30 + name.byteLength);

  const descriptorOffset = 30 + name.byteLength + payload.byteLength;
  const descriptorFieldOffset = descriptorOffset + (signed ? 4 : 0);

  if (signed) view.setUint32(descriptorOffset, 0x0807_4b50, true);
  view.setUint32(descriptorFieldOffset, crc32, true);
  writeUint64(view, descriptorFieldOffset + 4, payload.byteLength);
  writeUint64(view, descriptorFieldOffset + 12, payload.byteLength);

  const centralOffset = localBytes;

  view.setUint32(centralOffset, 0x0201_4b50, true);
  view.setUint16(centralOffset + 4, 45, true);
  view.setUint16(centralOffset + 6, 45, true);
  view.setUint16(centralOffset + 8, flags, true);
  view.setUint32(centralOffset + 16, crc32, true);
  view.setUint32(centralOffset + 20, 0xffff_ffff, true);
  view.setUint32(centralOffset + 24, 0xffff_ffff, true);
  view.setUint16(centralOffset + 28, name.byteLength, true);
  view.setUint16(centralOffset + 30, centralExtraBytes, true);
  bytes.set(name, centralOffset + 46);

  const extraOffset = centralOffset + 46 + name.byteLength;

  view.setUint16(extraOffset, 0x0001, true);
  view.setUint16(extraOffset + 2, 16, true);
  writeUint64(view, extraOffset + 4, payload.byteLength);
  writeUint64(view, extraOffset + 12, payload.byteLength);

  const endOffset = centralOffset + centralBytes;

  view.setUint32(endOffset, 0x0605_4b50, true);
  view.setUint16(endOffset + 8, 1, true);
  view.setUint16(endOffset + 10, 1, true);
  view.setUint32(endOffset + 12, centralBytes, true);
  view.setUint32(endOffset + 16, centralOffset, true);

  return bytes;
}

function writeUint64(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
  view.setUint32(offset + 4, 0, true);
}

function patchAllSignatures(bytes: Uint8Array, signature: number, fieldOffset: number, value: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let offset = 0; offset + fieldOffset + 4 <= bytes.byteLength; offset += 1) {
    if (view.getUint32(offset, true) === signature) view.setUint32(offset + fieldOffset, value, true);
  }
}

function patchNthSignature(input: {
  readonly bytes: Uint8Array;
  readonly signature: number;
  readonly fieldOffset: number;
  readonly value: number;
  readonly valueBytes: 2 | 4;
  readonly targetIndex?: number;
}): void {
  const view = new DataView(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength);
  let found = 0;

  for (let offset = 0; offset + input.fieldOffset + input.valueBytes <= input.bytes.byteLength; offset += 1) {
    if (view.getUint32(offset, true) !== input.signature) continue;

    if (found === (input.targetIndex ?? 0)) {
      if (input.valueBytes === 2) view.setUint16(offset + input.fieldOffset, input.value, true);
      else view.setUint32(offset + input.fieldOffset, input.value, true);

      return;
    }

    found += 1;
  }
}

function duplicatePathZip(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const archive = new Zip((error, chunk, final): void => {
      if (error !== null) {
        reject(error);

        return;
      }

      chunks.push(chunk);

      if (final) resolve(joinChunks(chunks));
    });
    const first = new ZipPassThrough('same.bin');
    const second = new ZipPassThrough('same.bin');

    archive.add(first);
    archive.add(second);
    first.push(new Uint8Array([1]), true);
    second.push(new Uint8Array([2]), true);
    archive.end();
  });
}

function streamedZip(name: string, bytes: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const archive = new Zip((error, chunk, final): void => {
      if (error !== null) {
        reject(error);

        return;
      }

      chunks.push(chunk);

      if (final) resolve(joinChunks(chunks));
    });
    const file = new ZipPassThrough(name);

    archive.add(file);
    file.push(bytes, true);
    archive.end();
  });
}

function joinChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const joined = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return joined;
}

function insertLocalRecord(archive: Uint8Array, donor: Uint8Array): Uint8Array {
  const directoryOffset = readDirectoryOffset(archive);
  const donorDirectoryOffset = readDirectoryOffset(donor);
  const localRecord = donor.subarray(0, donorDirectoryOffset);
  const joined = new Uint8Array(archive.byteLength + localRecord.byteLength);

  joined.set(archive.subarray(0, directoryOffset), 0);
  joined.set(localRecord, directoryOffset);
  joined.set(archive.subarray(directoryOffset), directoryOffset + localRecord.byteLength);
  adjustDirectoryOffset(joined, localRecord.byteLength);

  return joined;
}

function readDirectoryOffset(bytes: Uint8Array): number {
  const endOffset = findSignatureOffset(bytes, 0x0605_4b50);

  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(endOffset + 16, true);
}

function adjustDirectoryOffset(bytes: Uint8Array, delta: number): void {
  const endOffset = findSignatureOffset(bytes, 0x0605_4b50);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const current = view.getUint32(endOffset + 16, true);

  view.setUint32(endOffset + 16, current + delta, true);
}

function findSignatureOffset(bytes: Uint8Array, signature: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let offset = 0; offset + 4 <= bytes.byteLength; offset += 1) {
    if (view.getUint32(offset, true) === signature) return offset;
  }

  throw new Error(`Missing ZIP signature ${signature.toString(16)}`);
}

function patchUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function removeBytes(bytes: Uint8Array, offset: number, count: number): Uint8Array {
  const result = new Uint8Array(bytes.byteLength - count);

  result.set(bytes.subarray(0, offset), 0);
  result.set(bytes.subarray(offset + count), offset);

  return result;
}
