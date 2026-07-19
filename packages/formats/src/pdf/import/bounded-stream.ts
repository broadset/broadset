import { Unzlib } from 'fflate';
import { PDFArray, PDFDict, PDFName, PDFNumber, type PDFRawStream } from 'pdf-lib';

type BoundedPdfDecodeResultV1 =
  | { readonly status: 'decoded'; readonly bytes: Uint8Array }
  | {
      readonly status: 'rejected';
      readonly reason: 'output-limit' | 'work-limit' | 'filter-limit' | 'unsupported-filter' | 'malformed';
    };

type PdfFilterNameV1 = 'ASCII85Decode' | 'ASCIIHexDecode' | 'FlateDecode' | 'LZWDecode' | 'RunLengthDecode';

interface PdfFilterSpecV1 {
  readonly name: PdfFilterNameV1;
  readonly earlyChange: 0 | 1;
}

const OUTPUT_CHUNK_BYTES = 4096;
const MAX_PDF_STREAM_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_PDF_FILTER_CHAIN_LENGTH = 4;
const MAX_PDF_FILTER_WORK_BYTES = 192 * 1024 * 1024;
const LZW_CODE_WORK_BYTES = 2;
const MIN_LZW_CODE_BUDGET = 64;

export function decodePdfRawStreamBoundedV1(input: {
  readonly stream: PDFRawStream;
  readonly maxOutputBytes: number;
}): BoundedPdfDecodeResultV1 {
  const maxOutputBytes = validOutputBudget(input.maxOutputBytes);

  if (maxOutputBytes === undefined) return { status: 'rejected', reason: 'output-limit' };

  const rawFilter = input.stream.dict.get(PDFName.of('Filter'));

  if (rawFilter instanceof PDFArray && rawFilter.size() > MAX_PDF_FILTER_CHAIN_LENGTH) {
    return { status: 'rejected', reason: 'filter-limit' };
  }

  const filters = filterSpecs(input.stream);

  if (filters === undefined) return { status: 'rejected', reason: 'unsupported-filter' };

  if (filters.length === 0) {
    return input.stream.contents.byteLength <= maxOutputBytes ?
        { status: 'decoded', bytes: input.stream.contents }
      : { status: 'rejected', reason: 'output-limit' };
  }

  return decodeFilterChain({ filters, bytes: input.stream.contents, maxOutputBytes });
}

function decodeFilterChain(input: {
  readonly filters: readonly PdfFilterSpecV1[];
  readonly bytes: Uint8Array;
  readonly maxOutputBytes: number;
}): BoundedPdfDecodeResultV1 {
  let current = input.bytes;
  const workLimit = filterWorkLimit(current.byteLength, input.maxOutputBytes);
  let workBytes = current.byteLength;

  if (workBytes > workLimit) return { status: 'rejected', reason: 'work-limit' };

  for (const filter of input.filters) {
    const stageMaxBytes =
      filter.name === 'ASCII85Decode' || filter.name === 'ASCIIHexDecode' ?
        Math.min(MAX_PDF_STREAM_OUTPUT_BYTES, Math.max(input.maxOutputBytes, current.byteLength))
      : input.maxOutputBytes;
    const remainingWorkBytes = workLimit - workBytes;
    const boundedStageMaxBytes = Math.min(stageMaxBytes, remainingWorkBytes);

    if (boundedStageMaxBytes < 0) return { status: 'rejected', reason: 'work-limit' };

    const decoded = decodeFilter({
      filter,
      bytes: current,
      maxOutputBytes: boundedStageMaxBytes,
      maxWorkBytes: remainingWorkBytes,
    });

    if (decoded.status === 'rejected') {
      return decoded.reason === 'output-limit' && boundedStageMaxBytes < stageMaxBytes ?
          { status: 'rejected', reason: 'work-limit' }
        : decoded;
    }

    workBytes += decoded.bytes.byteLength;
    current = decoded.bytes;
  }

  return current.byteLength <= input.maxOutputBytes ?
      { status: 'decoded', bytes: current }
    : { status: 'rejected', reason: 'output-limit' };
}

function filterWorkLimit(inputBytes: number, maxOutputBytes: number): number {
  const boundedInputBytes = Math.min(inputBytes, MAX_PDF_FILTER_WORK_BYTES);

  return Math.min(MAX_PDF_FILTER_WORK_BYTES, 2 * (boundedInputBytes + maxOutputBytes));
}

function validOutputBudget(value: number): number | undefined {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_PDF_STREAM_OUTPUT_BYTES ? value : undefined;
}

function decodeFilter(input: {
  readonly filter: PdfFilterSpecV1;
  readonly bytes: Uint8Array;
  readonly maxOutputBytes: number;
  readonly maxWorkBytes: number;
}): BoundedPdfDecodeResultV1 {
  switch (input.filter.name) {
    case 'ASCII85Decode':
      return decodeAscii85Bounded(input.bytes, input.maxOutputBytes);
    case 'ASCIIHexDecode':
      return decodeAsciiHexBounded(input.bytes, input.maxOutputBytes);
    case 'FlateDecode':
      return inflateZlibBounded(input.bytes, input.maxOutputBytes);
    case 'LZWDecode':
      return decodeLzwBounded({
        encoded: input.bytes,
        maxOutputBytes: input.maxOutputBytes,
        maxWorkBytes: input.maxWorkBytes,
        earlyChange: input.filter.earlyChange,
      });
    case 'RunLengthDecode':
      return decodeRunLengthBounded(input.bytes, input.maxOutputBytes);
  }
}

class BoundedByteSink {
  readonly #chunks: Uint8Array[] = [];
  readonly #maxBytes: number;
  #active = new Uint8Array(OUTPUT_CHUNK_BYTES);
  #activeBytes = 0;
  #byteLength = 0;

  constructor(maxBytes: number) {
    this.#maxBytes = maxBytes;
  }

  appendByte(value: number): boolean {
    if (this.#byteLength >= this.#maxBytes) return false;

    if (this.#activeBytes === this.#active.byteLength) {
      this.#chunks.push(this.#active);
      this.#active = new Uint8Array(OUTPUT_CHUNK_BYTES);
      this.#activeBytes = 0;
    }

    this.#active[this.#activeBytes] = value;
    this.#activeBytes += 1;
    this.#byteLength += 1;

    return true;
  }

  append(bytes: Uint8Array): boolean {
    if (bytes.byteLength > this.#maxBytes - this.#byteLength) return false;

    for (let index = 0; index < bytes.byteLength; index += 1) {
      this.appendByte(bytes[index] ?? 0);
    }

    return true;
  }

  finish(): Uint8Array {
    const output = new Uint8Array(this.#byteLength);
    let offset = 0;

    for (const chunk of this.#chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }

    output.set(this.#active.subarray(0, this.#activeBytes), offset);

    return output;
  }
}

function decodeAsciiHexBounded(encoded: Uint8Array, maxOutputBytes: number): BoundedPdfDecodeResultV1 {
  const sink = new BoundedByteSink(maxOutputBytes);
  let highNibble: number | undefined;
  let terminated = false;

  for (let index = 0; index < encoded.byteLength; index += 1) {
    const byte: number = encoded[index] ?? 0;

    if (isPdfWhitespaceByte(byte)) continue;

    if (byte === 62) {
      terminated = true;
      break;
    }

    const nibble = asciiHexNibble(byte);

    if (nibble === undefined) return { status: 'rejected', reason: 'malformed' };

    if (highNibble === undefined) highNibble = nibble;
    else {
      if (!sink.appendByte(highNibble * 16 + nibble)) return { status: 'rejected', reason: 'output-limit' };
      highNibble = undefined;
    }
  }

  return finishAsciiHex({ sink, highNibble, terminated });
}

function finishAsciiHex(input: {
  readonly sink: BoundedByteSink;
  readonly highNibble: number | undefined;
  readonly terminated: boolean;
}): BoundedPdfDecodeResultV1 {
  if (!input.terminated) return { status: 'rejected', reason: 'malformed' };

  if (input.highNibble !== undefined && !input.sink.appendByte(input.highNibble * 16)) {
    return { status: 'rejected', reason: 'output-limit' };
  }

  return { status: 'decoded', bytes: input.sink.finish() };
}

function asciiHexNibble(byte: number): number | undefined {
  if (byte >= 48 && byte <= 57) return byte - 48;
  if (byte >= 65 && byte <= 70) return byte - 55;
  if (byte >= 97 && byte <= 102) return byte - 87;

  return undefined;
}

function inflateZlibBounded(compressed: Uint8Array, maxOutputBytes: number): BoundedPdfDecodeResultV1 {
  const sink = new BoundedByteSink(maxOutputBytes);
  const state = {
    /** Stops compressed input after the first output-cap violation. */
    exceeded: false,
    /** Records the decoder's terminal callback. */
    completed: false,
  };
  const decoder = new Unzlib((chunk, final): void => {
    if (state.exceeded) return;

    state.exceeded = !sink.append(chunk);
    state.completed = final;
  });
  const compressedChunkBytes = 1024;

  try {
    for (let offset = 0; offset < compressed.byteLength && !state.exceeded; offset += compressedChunkBytes) {
      const end = Math.min(compressed.byteLength, offset + compressedChunkBytes);

      decoder.push(compressed.subarray(offset, end), end === compressed.byteLength);
    }
  } catch {
    return { status: 'rejected', reason: 'malformed' };
  }

  if (state.exceeded) return { status: 'rejected', reason: 'output-limit' };
  if (!state.completed) return { status: 'rejected', reason: 'malformed' };

  return { status: 'decoded', bytes: sink.finish() };
}

function decodeAscii85Bounded(encoded: Uint8Array, maxOutputBytes: number): BoundedPdfDecodeResultV1 {
  const sink = new BoundedByteSink(maxOutputBytes);
  const group: number[] = [];
  let cursor = ascii85PayloadStart(encoded);

  while (cursor < encoded.byteLength) {
    const token = readAscii85Token(encoded, cursor);

    cursor = token.next;

    const result = consumeAscii85Token({ token, sink, group });

    if (result !== undefined) return result;
  }

  return { status: 'rejected', reason: 'malformed' };
}

type Ascii85Token =
  | { readonly kind: 'digit'; readonly digit: number; readonly next: number }
  | { readonly kind: 'zero'; readonly next: number }
  | { readonly kind: 'end'; readonly next: number }
  | { readonly kind: 'malformed'; readonly next: number };

function consumeAscii85Token(input: {
  readonly token: Ascii85Token;
  readonly sink: BoundedByteSink;
  readonly group: number[];
}): BoundedPdfDecodeResultV1 | undefined {
  if (input.token.kind === 'malformed') return { status: 'rejected', reason: 'malformed' };
  if (input.token.kind === 'end') return finishAscii85(input.sink, input.group);

  if (input.token.kind === 'zero') {
    if (input.group.length !== 0) return { status: 'rejected', reason: 'malformed' };

    return input.sink.append(new Uint8Array(4)) ? undefined : { status: 'rejected', reason: 'output-limit' };
  }

  input.group.push(input.token.digit);

  if (input.group.length < 5) return undefined;

  if (!appendAscii85Group({ sink: input.sink, digits: input.group, outputBytes: 4 })) {
    return { status: 'rejected', reason: 'output-limit' };
  }

  input.group.length = 0;

  return undefined;
}

function readAscii85Token(encoded: Uint8Array, start: number): Ascii85Token {
  let cursor = start;

  while (cursor < encoded.byteLength && isPdfWhitespaceByte(encoded[cursor] ?? -1)) cursor += 1;

  const byte = encoded[cursor];

  if (byte === undefined) return { kind: 'malformed', next: cursor };
  if (byte === 122) return { kind: 'zero', next: cursor + 1 };

  if (byte === 126) {
    cursor += 1;
    while (cursor < encoded.byteLength && isPdfWhitespaceByte(encoded[cursor] ?? -1)) cursor += 1;

    return encoded[cursor] === 62 ?
        { kind: 'end', next: cursor + 1 }
      : { kind: 'malformed', next: cursor };
  }

  return byte >= 33 && byte <= 117 ?
      { kind: 'digit', digit: byte - 33, next: cursor + 1 }
    : { kind: 'malformed', next: cursor + 1 };
}

function finishAscii85(sink: BoundedByteSink, group: number[]): BoundedPdfDecodeResultV1 {
  if (group.length === 1) return { status: 'rejected', reason: 'malformed' };

  if (group.length > 1) {
    const outputBytes = group.length - 1;

    while (group.length < 5) group.push(84);

    if (!appendAscii85Group({ sink, digits: group, outputBytes })) {
      return { status: 'rejected', reason: 'output-limit' };
    }
  }

  return { status: 'decoded', bytes: sink.finish() };
}

function ascii85PayloadStart(bytes: Uint8Array): number {
  let cursor = 0;

  while (cursor < bytes.byteLength && isPdfWhitespaceByte(bytes[cursor] ?? -1)) cursor += 1;

  return bytes[cursor] === 60 && bytes[cursor + 1] === 126 ? cursor + 2 : cursor;
}

function appendAscii85Group(input: {
  readonly sink: BoundedByteSink;
  readonly digits: readonly number[];
  readonly outputBytes: number;
}): boolean {
  let value = 0;

  for (const digit of input.digits) value = value * 85 + digit;
  if (value > 0xffff_ffff) return false;

  const decoded = new Uint8Array(4);

  for (let index = 3; index >= 0; index -= 1) {
    decoded[index] = value % 256;
    value = Math.floor(value / 256);
  }

  return input.sink.append(decoded.subarray(0, input.outputBytes));
}

function decodeRunLengthBounded(encoded: Uint8Array, maxOutputBytes: number): BoundedPdfDecodeResultV1 {
  const sink = new BoundedByteSink(maxOutputBytes);
  let cursor = 0;

  while (cursor < encoded.byteLength) {
    const packet = decodeRunLengthPacket({ encoded, cursor, sink });

    if (packet.kind === 'continue') cursor = packet.next;
    else if (packet.kind === 'end') return { status: 'decoded', bytes: sink.finish() };
    else return { status: 'rejected', reason: packet.reason };
  }

  return { status: 'rejected', reason: 'malformed' };
}

type RunLengthPacketResult =
  | { readonly kind: 'continue'; readonly next: number }
  | { readonly kind: 'end' }
  | { readonly kind: 'rejected'; readonly reason: 'output-limit' | 'malformed' };

function decodeRunLengthPacket(input: {
  readonly encoded: Uint8Array;
  readonly cursor: number;
  readonly sink: BoundedByteSink;
}): RunLengthPacketResult {
  const control = input.encoded[input.cursor];

  if (control === undefined) return { kind: 'rejected', reason: 'malformed' };
  if (control === 128) return { kind: 'end' };

  if (control <= 127) {
    const next = input.cursor + control + 2;

    if (next > input.encoded.byteLength) return { kind: 'rejected', reason: 'malformed' };

    return input.sink.append(input.encoded.subarray(input.cursor + 1, next)) ?
        { kind: 'continue', next }
      : { kind: 'rejected', reason: 'output-limit' };
  }

  const repeated = input.encoded[input.cursor + 1];

  if (repeated === undefined) return { kind: 'rejected', reason: 'malformed' };

  for (let count = 0; count < 257 - control; count += 1) {
    if (!input.sink.appendByte(repeated)) {
      return { kind: 'rejected', reason: 'output-limit' };
    }
  }

  return { kind: 'continue', next: input.cursor + 2 };
}

function decodeLzwBounded(input: {
  readonly encoded: Uint8Array;
  readonly maxOutputBytes: number;
  readonly maxWorkBytes: number;
  readonly earlyChange: 0 | 1;
}): BoundedPdfDecodeResultV1 {
  const sink = new BoundedByteSink(input.maxOutputBytes);
  const reader = new MsbBitReader(input.encoded);
  const dictionary = createLzwDictionary();
  const maxCodes = Math.max(MIN_LZW_CODE_BUDGET, Math.floor(input.maxWorkBytes / LZW_CODE_WORK_BYTES));
  let codeWidth = 9;
  let nextCode = 258;
  let previous: Uint8Array | undefined;
  let codeCount = 0;

  for (;;) {
    if (codeCount >= maxCodes) return { status: 'rejected', reason: 'work-limit' };

    codeCount += 1;

    const code = reader.read(codeWidth);

    if (code === undefined) return { status: 'rejected', reason: 'malformed' };

    if (code === 256) {
      codeWidth = 9;
      nextCode = 258;
      previous = undefined;
      continue;
    }

    if (code === 257) return { status: 'decoded', bytes: sink.finish() };

    const entry = lzwEntry({ code, dictionary, nextCode, previous });

    if (entry === undefined) return { status: 'rejected', reason: 'malformed' };
    if (!sink.append(entry)) return { status: 'rejected', reason: 'output-limit' };

    if (previous !== undefined) {
      const added = addLzwDictionaryEntry({
        dictionary,
        nextCode,
        codeWidth,
        previous,
        entry,
        earlyChange: input.earlyChange,
      });

      nextCode = added.nextCode;
      codeWidth = added.codeWidth;
    }

    previous = entry;
  }
}

function addLzwDictionaryEntry(input: {
  readonly dictionary: (Uint8Array | undefined)[];
  readonly nextCode: number;
  readonly codeWidth: number;
  readonly previous: Uint8Array;
  readonly entry: Uint8Array;
  readonly earlyChange: 0 | 1;
}): { readonly nextCode: number; readonly codeWidth: number } {
  if (input.nextCode >= 4096) return { nextCode: input.nextCode, codeWidth: input.codeWidth };

  input.dictionary[input.nextCode] = appendLzwByte(input.previous, input.entry[0] ?? 0);

  const nextCode = input.nextCode + 1;
  const codeWidth =
    input.codeWidth < 12 && nextCode + input.earlyChange === 2 ** input.codeWidth ?
      input.codeWidth + 1
    : input.codeWidth;

  return { nextCode, codeWidth };
}

function createLzwDictionary(): (Uint8Array | undefined)[] {
  const dictionary: (Uint8Array | undefined)[] = new Array<Uint8Array | undefined>(4096);

  for (let value = 0; value < 256; value += 1) dictionary[value] = new Uint8Array([value]);

  return dictionary;
}

function lzwEntry(input: {
  readonly code: number;
  readonly dictionary: readonly (Uint8Array | undefined)[];
  readonly nextCode: number;
  readonly previous: Uint8Array | undefined;
}): Uint8Array | undefined {
  const known = input.code < input.nextCode ? input.dictionary[input.code] : undefined;

  if (known !== undefined) return known;
  if (input.code !== input.nextCode || input.previous === undefined) return undefined;

  return appendLzwByte(input.previous, input.previous[0] ?? 0);
}

function appendLzwByte(prefix: Uint8Array, suffix: number): Uint8Array {
  const result = new Uint8Array(prefix.byteLength + 1);

  result.set(prefix);
  result[prefix.byteLength] = suffix;

  return result;
}

class MsbBitReader {
  readonly #bytes: Uint8Array;
  #buffer = 0;
  #bufferBits = 0;
  #cursor = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  read(width: number): number | undefined {
    while (this.#bufferBits < width) {
      const byte = this.#bytes[this.#cursor];

      if (byte === undefined) return undefined;
      this.#buffer = this.#buffer * 256 + byte;
      this.#bufferBits += 8;
      this.#cursor += 1;
    }

    const remainingBits = this.#bufferBits - width;
    const divisor = 2 ** remainingBits;
    const code = Math.floor(this.#buffer / divisor);

    this.#buffer %= divisor;
    this.#bufferBits = remainingBits;

    return code;
  }
}

function isPdfWhitespaceByte(value: number): boolean {
  return value === 0 || value === 9 || value === 10 || value === 12 || value === 13 || value === 32;
}

function filterSpecs(stream: PDFRawStream): readonly PdfFilterSpecV1[] | undefined {
  const filter = stream.dict.get(PDFName.of('Filter'));

  if (filter === undefined) return [];

  if (filter instanceof PDFName) {
    const name = canonicalFilterName(filter.decodeText());
    const params = stream.dict.lookupMaybe(PDFName.of('DecodeParms'), PDFDict);

    return name === undefined ? undefined : [filterSpec(name, params)];
  }

  if (!(filter instanceof PDFArray)) return undefined;

  const specs: PdfFilterSpecV1[] = [];
  const params = stream.dict.lookupMaybe(PDFName.of('DecodeParms'), PDFArray);

  for (let index = 0; index < filter.size(); index += 1) {
    const entry = filter.lookupMaybe(index, PDFName);
    const name = entry === undefined ? undefined : canonicalFilterName(entry.decodeText());

    if (name === undefined) return undefined;
    specs.push(filterSpec(name, params?.lookupMaybe(index, PDFDict)));
  }

  return specs;
}

function filterSpec(name: PdfFilterNameV1, params: PDFDict | undefined): PdfFilterSpecV1 {
  const earlyChangeValue = params?.lookupMaybe(PDFName.of('EarlyChange'), PDFNumber)?.asNumber();

  return { name, earlyChange: earlyChangeValue === 0 ? 0 : 1 };
}

function canonicalFilterName(name: string): PdfFilterNameV1 | undefined {
  switch (name) {
    case 'ASCII85Decode':
    case 'A85':
      return 'ASCII85Decode';
    case 'ASCIIHexDecode':
    case 'AHx':
      return 'ASCIIHexDecode';
    case 'FlateDecode':
    case 'Fl':
      return 'FlateDecode';
    case 'LZWDecode':
    case 'LZW':
      return 'LZWDecode';
    case 'RunLengthDecode':
    case 'RL':
      return 'RunLengthDecode';
    default:
      return undefined;
  }
}
