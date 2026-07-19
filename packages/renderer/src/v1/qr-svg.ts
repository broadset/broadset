const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type ErrorCorrection = 'L' | 'M' | 'Q' | 'H';
type Cell = boolean | undefined;

interface BlockSpec {
  readonly dataCodewords: number;
  readonly eccPerBlock: number;
  readonly blockCount: number;
  readonly shortDataCodewords: number;
  readonly shortBlockCount: number;
}

const ECC_CODEWORDS_PER_BLOCK: Readonly<Record<ErrorCorrection, readonly number[]>> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const ERROR_CORRECTION_BLOCKS: Readonly<Record<ErrorCorrection, readonly number[]>> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const FORMAT_ECC: Readonly<Record<ErrorCorrection, number>> = { L: 1, M: 0, Q: 3, H: 2 };
const MAX_VERSION = 40;
const MAX_SUPPORTED_UTF16_LENGTH = 2_953;

function pushBits(target: number[], value: number, count: number): void {
  for (let index = count - 1; index >= 0; index -= 1) target.push((value >>> index) & 1);
}

function bytesToCodewords(bytes: Uint8Array, version: number, spec: BlockSpec): readonly number[] {
  const capacity = spec.dataCodewords;
  const bits: number[] = [];

  pushBits(bits, 4, 4);
  pushBits(bits, bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((byte) => {
    pushBits(bits, byte, 8);
  });

  const capacityBits = capacity * 8;

  pushBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];

  for (let offset = 0; offset < bits.length; offset += 8) {
    let value = 0;

    for (let bit = 0; bit < 8; bit += 1) value = (value << 1) | (bits[offset + bit] ?? 0);
    data.push(value);
  }

  let pad = 0;

  while (data.length < capacity) {
    data.push(pad % 2 === 0 ? 236 : 17);
    pad += 1;
  }

  return data;
}

function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;

  if (version >= 2) {
    const alignmentCount = Math.floor(version / 7) + 2;

    result -= (25 * alignmentCount - 10) * alignmentCount - 55;
  }

  if (version >= 7) result -= 36;

  return result;
}

function blockSpec(version: number, level: ErrorCorrection): BlockSpec | undefined {
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[level][version];
  const blockCount = ERROR_CORRECTION_BLOCKS[level][version];

  if (eccPerBlock === undefined || eccPerBlock < 0 || blockCount === undefined || blockCount < 1) return undefined;

  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const dataCodewords = rawCodewords - eccPerBlock * blockCount;
  const shortBlockCodewords = Math.floor(rawCodewords / blockCount);

  return {
    dataCodewords,
    eccPerBlock,
    blockCount,
    shortDataCodewords: shortBlockCodewords - eccPerBlock,
    shortBlockCount: blockCount - (rawCodewords % blockCount),
  };
}

function gfMultiply(left: number, right: number): number {
  let a = left;
  let b = right;
  let result = 0;

  while (b > 0) {
    if ((b & 1) === 1) result ^= a;
    a <<= 1;
    if ((a & 0x100) !== 0) a ^= 0x11d;
    b >>= 1;
  }

  return result;
}

function generatorPolynomial(degree: number): readonly number[] {
  let polynomial: readonly number[] = [1];
  let root = 1;

  for (let index = 0; index < degree; index += 1) {
    const next = new Array<number>(polynomial.length + 1).fill(0);

    polynomial.forEach((coefficient, coefficientIndex) => {
      next[coefficientIndex] = (next[coefficientIndex] ?? 0) ^ coefficient;
      next[coefficientIndex + 1] = (next[coefficientIndex + 1] ?? 0) ^ gfMultiply(coefficient, root);
    });
    polynomial = next;
    root = gfMultiply(root, 2);
  }

  return polynomial;
}

function errorCorrection(data: readonly number[], degree: number): readonly number[] {
  const generator = generatorPolynomial(degree);
  const remainder = new Array<number>(degree).fill(0);

  data.forEach((value) => {
    const factor = value ^ (remainder.shift() ?? 0);

    remainder.push(0);
    generator.slice(1).forEach((coefficient, index) => {
      remainder[index] = (remainder[index] ?? 0) ^ gfMultiply(coefficient, factor);
    });
  });

  return remainder;
}

function interleavedCodewords(data: readonly number[], spec: BlockSpec): readonly number[] {
  let offset = 0;
  const blocks = Array.from({ length: spec.blockCount }, (_, blockIndex) => {
    const length = spec.shortDataCodewords + (blockIndex < spec.shortBlockCount ? 0 : 1);
    const block = data.slice(offset, offset + length);

    offset += length;

    return block;
  });
  const eccBlocks = blocks.map((block) => errorCorrection(block, spec.eccPerBlock));
  const result: number[] = [];
  const longestDataBlock = spec.shortDataCodewords + (spec.shortBlockCount < spec.blockCount ? 1 : 0);

  for (let index = 0; index < longestDataBlock; index += 1) {
    blocks.forEach((block) => {
      const value = block[index];

      if (value !== undefined) result.push(value);
    });
  }

  for (let index = 0; index < spec.eccPerBlock; index += 1) {
    eccBlocks.forEach((block) => result.push(block[index] ?? 0));
  }

  return result;
}

function setFinder(matrix: Cell[][], left: number, top: number): void {
  const size = matrix.length;

  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const row = top + y;
      const column = left + x;

      if (row < 0 || column < 0 || row >= size || column >= size) continue;

      const target = matrix[row];

      if (target !== undefined)
        target[column] =
          x >= 0 &&
          x <= 6 &&
          y >= 0 &&
          y <= 6 &&
          (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
    }
  }
}

function alignmentPositions(version: number): readonly number[] {
  if (version === 1) return [];

  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = version === 32 ? 26 : Math.ceil((size - 13) / (count * 2 - 2)) * 2;
  const result = new Array<number>(count);
  let position = size - 7;

  result[0] = 6;

  for (let index = count - 1; index >= 1; index -= 1) {
    result[index] = position;
    position -= step;
  }

  return result;
}

function placeVersion(matrix: Cell[][], version: number): void {
  if (version < 7) return;

  let remainder = version << 12;

  for (let bit = 17; bit >= 12; bit -= 1) {
    if (((remainder >>> bit) & 1) === 1) remainder ^= 0x1f25 << (bit - 12);
  }

  const bits = (version << 12) | remainder;
  const size = matrix.length;

  for (let index = 0; index < 18; index += 1) {
    const dark = ((bits >>> index) & 1) === 1;
    const firstRow = Math.floor(index / 3);
    const firstColumn = size - 11 + (index % 3);
    const row = matrix[firstRow];
    const transposedRow = matrix[firstColumn];

    if (row !== undefined) row[firstColumn] = dark;
    if (transposedRow !== undefined) transposedRow[firstRow] = dark;
  }
}

function formatCoordinates(size: number): {
  readonly vertical: readonly (readonly number[])[];
  readonly horizontal: readonly (readonly number[])[];
} {
  return {
    vertical: [
      ...Array.from({ length: 6 }, (_, index) => [index, 8]),
      [7, 8],
      [8, 8],
      ...Array.from({ length: 7 }, (_, index) => [size - 7 + index, 8]),
    ],
    horizontal: [
      ...Array.from({ length: 8 }, (_, index) => [8, size - 1 - index]),
      [8, 7],
      ...Array.from({ length: 6 }, (_, index) => [8, 5 - index]),
    ],
  };
}

function reserveFormat(matrix: Cell[][]): void {
  const { vertical, horizontal } = formatCoordinates(matrix.length);

  vertical.concat(horizontal).forEach(([row = 0, column = 0]) => {
    const target = matrix[row];

    if (target !== undefined) target[column] = false;
  });
}

function formatBits(level: ErrorCorrection): number {
  let value = FORMAT_ECC[level] << 3;
  let remainder = value << 10;

  for (let bit = 14; bit >= 10; bit -= 1) {
    if (((remainder >>> bit) & 1) === 1) remainder ^= 0x537 << (bit - 10);
  }

  return ((value << 10) | remainder) ^ 0x5412;
}

function placeFormat(matrix: Cell[][], level: ErrorCorrection): void {
  const bits = formatBits(level);
  const { vertical, horizontal } = formatCoordinates(matrix.length);

  vertical.forEach(([row = 0, column = 0], index) => {
    const target = matrix[row];

    if (target !== undefined) target[column] = ((bits >>> index) & 1) === 1;
  });
  horizontal.forEach(([row = 0, column = 0], index) => {
    const target = matrix[row];

    if (target !== undefined) target[column] = ((bits >>> index) & 1) === 1;
  });
}

function createBaseMatrix(version: number): Cell[][] {
  const size = 17 + version * 4;
  const matrix: Cell[][] = Array.from({ length: size }, () => new Array<Cell>(size).fill(undefined));

  setFinder(matrix, 0, 0);
  setFinder(matrix, size - 7, 0);
  setFinder(matrix, 0, size - 7);

  const timingRow = matrix[6];

  for (let index = 8; index < size - 8; index += 1) {
    if (timingRow !== undefined) timingRow[index] = index % 2 === 0;

    const timingColumnRow = matrix[index];

    if (timingColumnRow !== undefined) timingColumnRow[6] = index % 2 === 0;
  }

  const positions = alignmentPositions(version);

  // Alignment patterns are centered on every position pair, not only the diagonal.
  positions.forEach((centerY, rowIndex) => {
    positions.forEach((centerX, columnIndex) => {
      const lastIndex = positions.length - 1;

      if (
        (rowIndex === 0 && columnIndex === 0) ||
        (rowIndex === 0 && columnIndex === lastIndex) ||
        (rowIndex === lastIndex && columnIndex === 0)
      )
        return;

      for (let y = -2; y <= 2; y += 1) {
        const target = matrix[centerY + y];

        if (target !== undefined)
          for (let x = -2; x <= 2; x += 1)
            target[centerX + x] = Math.max(Math.abs(x), Math.abs(y)) !== 1;
      }
    });
  });
  placeVersion(matrix, version);

  const darkModuleRow = matrix[size - 8];

  if (darkModuleRow !== undefined) darkModuleRow[8] = true;
  reserveFormat(matrix);

  return matrix;
}

function placeData(matrix: Cell[][], bits: readonly number[]): void {
  const size = matrix.length;
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1;

    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;

      for (let offset = 0; offset < 2; offset += 1) {
        const column = right - offset;

        const target = matrix[row];

        if (target === undefined || target[column] !== undefined) continue;

        const bit = bits[bitIndex] ?? 0;

        target[column] = (bit === 1) !== ((row + column) % 2 === 0);
        bitIndex += 1;
      }
    }

    upward = !upward;
  }
}

function buildMatrix(
  bytes: Uint8Array,
  level: ErrorCorrection,
  version: number,
  spec: BlockSpec,
): readonly (readonly boolean[])[] {
  const matrix = createBaseMatrix(version);
  const codewords = interleavedCodewords(bytesToCodewords(bytes, version, spec), spec);
  const bits = codewords.flatMap((value) => Array.from({ length: 8 }, (_, index) => (value >>> (7 - index)) & 1));

  placeData(matrix, bits);

  placeFormat(matrix, level);

  return matrix.map((row) => row.map((cell) => cell ?? false));
}

function selectVersion(
  byteLength: number,
  level: ErrorCorrection,
): { readonly version: number; readonly spec: BlockSpec } | undefined {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const spec = blockSpec(version, level);
    const countBits = version <= 9 ? 8 : 16;

    if (spec !== undefined && 4 + countBits + byteLength * 8 <= spec.dataCodewords * 8) return { version, spec };
  }

  return undefined;
}

/** Create a detached SVG QR symbol for UTF-8 byte-mode content through QR version 40. */
export function createQrCodeSvgV1(options: {
  readonly document: Document;
  readonly value: string;
  readonly errorCorrection: ErrorCorrection;
  readonly quietZoneCssPixels: number;
}): SVGSVGElement | undefined {
  if (options.value.length === 0 || options.value.length > MAX_SUPPORTED_UTF16_LENGTH) return undefined;

  const bytes = new TextEncoder().encode(options.value);
  const selected = selectVersion(bytes.length, options.errorCorrection);

  if (selected === undefined) return undefined;

  const matrix = buildMatrix(bytes, options.errorCorrection, selected.version, selected.spec);
  const svg = options.document.createElementNS(SVG_NAMESPACE, 'svg');

  svg.setAttribute('viewBox', `0 0 ${String(matrix.length)} ${String(matrix.length)}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `QR code: ${options.value}`);
  svg.dataset['qrVersion'] = String(selected.version);
  svg.style.setProperty('width', '100%');
  svg.style.setProperty('height', '100%');
  svg.style.setProperty('background', 'white');
  svg.style.setProperty('box-sizing', 'border-box');
  svg.style.setProperty('padding', `${String(Math.max(0, options.quietZoneCssPixels))}px`);

  const data: string[] = [];

  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (!dark) return;
      data.push(`M${String(x)} ${String(y)}h1v1h-1z`);
    });
  });

  const modules = options.document.createElementNS(SVG_NAMESPACE, 'path');

  modules.dataset['qrModules'] = String(matrix.length);
  modules.setAttribute('d', data.join(''));
  modules.setAttribute('fill', 'black');
  svg.append(modules);

  return svg;
}
