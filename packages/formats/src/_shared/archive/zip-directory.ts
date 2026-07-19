import { strFromU8 } from 'fflate';

export interface ZipDirectoryEntry {
  readonly name: string;
  readonly encrypted: boolean;
  readonly symlink: boolean;
  readonly compression: number;
  readonly compressedBytes: number;
  readonly originalBytes: number;
  readonly crc32: number;
  readonly localHeaderOffset: number;
  readonly zip64SizeFields: boolean;
  readonly unsignedDescriptorOffset: number | undefined;
}

interface ZipDirectoryEnd {
  readonly endOffset: number;
  readonly entryCount: number;
  readonly directoryBytes: number;
  readonly directoryOffset: number;
}

const END_SIGNATURE = 0x0605_4b50;
const CENTRAL_SIGNATURE = 0x0201_4b50;
const LOCAL_SIGNATURE = 0x0403_4b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x0807_4b50;
const ZIP64_EXTRA_ID = 0x0001;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffff_ffff;

export function parseZipDirectory(bytes: Uint8Array): readonly ZipDirectoryEntry[] | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = parseDirectoryEnd(view);

  if (end === undefined) return undefined;

  const entries: ZipDirectoryEntry[] = [];
  let offset = end.directoryOffset;

  for (let index = 0; index < end.entryCount; index += 1) {
    const record = parseDirectoryRecord({ bytes, view, offset, end });

    if (record === undefined) return undefined;

    entries.push(record.entry);
    offset = record.nextOffset;
  }

  return offset === end.directoryOffset + end.directoryBytes ? entries : undefined;
}

function parseDirectoryEnd(view: DataView): ZipDirectoryEnd | undefined {
  const endOffset = findEndOffset(view);

  if (endOffset === undefined || endOffset + 22 > view.byteLength) return undefined;
  if (readUint16(view, endOffset + 4) !== 0 || readUint16(view, endOffset + 6) !== 0) return undefined;

  const entriesOnDisk = readUint16(view, endOffset + 8);
  const entryCount = readUint16(view, endOffset + 10);
  const directoryBytes = readUint32(view, endOffset + 12);
  const directoryOffset = readUint32(view, endOffset + 16);
  const invalidSentinel =
    entriesOnDisk === UINT16_MAX ||
    entryCount === UINT16_MAX ||
    directoryBytes === UINT32_MAX ||
    directoryOffset === UINT32_MAX;
  const invalidBounds = directoryOffset > endOffset || directoryBytes > endOffset - directoryOffset;

  return invalidSentinel || entriesOnDisk !== entryCount || invalidBounds ?
      undefined
    : { endOffset, entryCount, directoryBytes, directoryOffset };
}

function parseDirectoryRecord(input: {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  readonly offset: number;
  readonly end: ZipDirectoryEnd;
}): { readonly entry: ZipDirectoryEntry; readonly nextOffset: number } | undefined {
  const { bytes, view, offset, end } = input;

  if (offset + 46 > end.endOffset || readUint32(view, offset) !== CENTRAL_SIGNATURE) return undefined;

  const flags = readUint16(view, offset + 8);
  const compression = readUint16(view, offset + 10);
  const crc32 = readUint32(view, offset + 16);
  const storedCompressedBytes = readUint32(view, offset + 20);
  const storedOriginalBytes = readUint32(view, offset + 24);
  const nameLength = readUint16(view, offset + 28);
  const extraLength = readUint16(view, offset + 30);
  const commentLength = readUint16(view, offset + 32);
  const storedLocalOffset = readUint32(view, offset + 42);
  const externalAttributes = readUint32(view, offset + 38);
  const zip64SizeFields = storedCompressedBytes === UINT32_MAX || storedOriginalBytes === UINT32_MAX;
  const nextOffset = offset + 46 + nameLength + extraLength + commentLength;

  if (nextOffset > end.endOffset) return undefined;

  const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
  const extra = bytes.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
  const zip64 = readZip64Values(extra, {
    original: storedOriginalBytes === UINT32_MAX,
    compressed: storedCompressedBytes === UINT32_MAX,
    localOffset: storedLocalOffset === UINT32_MAX,
  });

  if (zip64 === undefined) return undefined;

  const originalBytes = storedOriginalBytes === UINT32_MAX ? zip64.original : storedOriginalBytes;
  const compressedBytes = storedCompressedBytes === UINT32_MAX ? zip64.compressed : storedCompressedBytes;
  const localHeaderOffset = storedLocalOffset === UINT32_MAX ? zip64.localOffset : storedLocalOffset;

  if (originalBytes === undefined || compressedBytes === undefined || localHeaderOffset === undefined) return undefined;
  if (compression === 0 && compressedBytes !== originalBytes) return undefined;

  const entry: ZipDirectoryEntry = {
    name: strFromU8(nameBytes, (flags & 0x0800) === 0),
    encrypted: (flags & 1) !== 0,
    symlink: isUnixSymlink(externalAttributes),
    compression,
    compressedBytes,
    originalBytes,
    crc32,
    localHeaderOffset,
    zip64SizeFields,
    unsignedDescriptorOffset: undefined,
  };
  const localHeader = validateLocalHeader(bytes, view, {
    ...entry,
    nameBytes,
    flags,
    directoryOffset: end.directoryOffset,
  });

  return localHeader === undefined ? undefined : (
      {
        entry: { ...entry, unsignedDescriptorOffset: localHeader.unsignedDescriptorOffset },
        nextOffset,
      }
    );
}

function isUnixSymlink(externalAttributes: number): boolean {
  const UNIX_FILE_TYPE_MASK = 0xf000;
  const UNIX_SYMLINK_TYPE = 0xa000;
  const mode = externalAttributes >>> 16;

  return (mode & UNIX_FILE_TYPE_MASK) === UNIX_SYMLINK_TYPE;
}

function findEndOffset(view: DataView): number | undefined {
  const minimum = Math.max(0, view.byteLength - 65_557);

  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (readUint32(view, offset) !== END_SIGNATURE) continue;

    const commentLength = readUint16(view, offset + 20);

    if (offset + 22 + commentLength === view.byteLength) return offset;
  }

  return undefined;
}

function validateLocalHeader(
  bytes: Uint8Array,
  view: DataView,
  expected: ZipDirectoryEntry & {
    readonly nameBytes: Uint8Array;
    readonly flags: number;
    readonly directoryOffset: number;
  },
): { readonly unsignedDescriptorOffset: number | undefined } | undefined {
  const offset = expected.localHeaderOffset;

  if (offset + 30 > expected.directoryOffset || readUint32(view, offset) !== LOCAL_SIGNATURE) return undefined;

  const localFlags = readUint16(view, offset + 6);
  const nameLength = readUint16(view, offset + 26);
  const extraLength = readUint16(view, offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const invalidMetadata =
    localFlags !== expected.flags ||
    readUint16(view, offset + 8) !== expected.compression ||
    dataOffset > expected.directoryOffset ||
    expected.compressedBytes > expected.directoryOffset - dataOffset ||
    nameLength !== expected.nameBytes.byteLength ||
    !equalBytes(bytes.subarray(offset + 30, offset + 30 + nameLength), expected.nameBytes);

  if (invalidMetadata) return undefined;
  if ((localFlags & 8) !== 0) return validateDataDescriptor(view, dataOffset + expected.compressedBytes, expected);

  const matches =
    readUint32(view, offset + 14) === expected.crc32 &&
    readUint32(view, offset + 18) === expected.compressedBytes &&
    readUint32(view, offset + 22) === expected.originalBytes;

  return matches ? { unsignedDescriptorOffset: undefined } : undefined;
}

function validateDataDescriptor(
  view: DataView,
  offset: number,
  expected: ZipDirectoryEntry & { readonly directoryOffset: number },
): { readonly unsignedDescriptorOffset: number | undefined } | undefined {
  const hasSignature = offset + 4 <= expected.directoryOffset && readUint32(view, offset) === DATA_DESCRIPTOR_SIGNATURE;

  if (hasSignature && descriptorMatches(view, offset + 4, expected)) {
    return { unsignedDescriptorOffset: undefined };
  }

  return descriptorMatches(view, offset, expected) ? { unsignedDescriptorOffset: offset } : undefined;
}

function descriptorMatches(
  view: DataView,
  fieldOffset: number,
  expected: ZipDirectoryEntry & { readonly directoryOffset: number },
): boolean {
  const zip64 = expected.zip64SizeFields;
  const sizeBytes = zip64 ? 8 : 4;
  const endOffset = fieldOffset + 4 + sizeBytes * 2;

  if (endOffset > expected.directoryOffset || readUint32(view, fieldOffset) !== expected.crc32) return false;

  const compressed = zip64 ? readSafeUint64(view, fieldOffset + 4) : readUint32(view, fieldOffset + 4);
  const original =
    zip64 ? readSafeUint64(view, fieldOffset + 4 + sizeBytes) : readUint32(view, fieldOffset + 4 + sizeBytes);

  return compressed === expected.compressedBytes && original === expected.originalBytes;
}

function readZip64Values(
  extra: Uint8Array,
  needed: { readonly original: boolean; readonly compressed: boolean; readonly localOffset: boolean },
): { readonly original?: number; readonly compressed?: number; readonly localOffset?: number } | undefined {
  if (!needed.original && !needed.compressed && !needed.localOffset) return {};

  const field = findZip64Field(extra);

  return field === undefined ? undefined : consumeZip64Values(field, needed);
}

function findZip64Field(extra: Uint8Array): Uint8Array | undefined {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let offset = 0;

  while (offset + 4 <= extra.byteLength) {
    const id = readUint16(view, offset);
    const size = readUint16(view, offset + 2);
    const end = offset + 4 + size;

    if (end > extra.byteLength) return undefined;
    if (id === ZIP64_EXTRA_ID) return extra.subarray(offset + 4, end);

    offset = end;
  }

  return undefined;
}

function consumeZip64Values(
  field: Uint8Array,
  needed: { readonly original: boolean; readonly compressed: boolean; readonly localOffset: boolean },
): { readonly original?: number; readonly compressed?: number; readonly localOffset?: number } | undefined {
  const view = new DataView(field.buffer, field.byteOffset, field.byteLength);
  // ZIP64 values are consumed sequentially into this local parse result.
  const result: { original?: number; compressed?: number; localOffset?: number } = {};
  let offset = 0;

  const keys: readonly ('original' | 'compressed' | 'localOffset')[] = ['original', 'compressed', 'localOffset'];

  for (const key of keys) {
    if (!needed[key]) continue;
    if (offset + 8 > field.byteLength) return undefined;

    const value = readSafeUint64(view, offset);

    if (value === undefined) return undefined;

    result[key] = value;
    offset += 8;
  }

  return result;
}

function readSafeUint64(view: DataView, offset: number): number | undefined {
  const high = readUint32(view, offset + 4);
  const low = readUint32(view, offset);
  const value = high * 0x1_0000_0000 + low;

  return Number.isSafeInteger(value) ? value : undefined;
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}
