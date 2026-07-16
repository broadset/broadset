import type { PdfColorV1, PdfImageUseV1, PdfMatrixV1, PdfPathCommandV1, PdfPathV1 } from './types';

type PdfTokenV1 =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'name'; readonly value: string }
  | { readonly kind: 'word'; readonly value: string }
  | { readonly kind: 'opaque' };

interface PdfGraphicsStateV1 {
  readonly transform: PdfMatrixV1;
  readonly fill: PdfColorV1;
  readonly stroke: PdfColorV1;
  readonly lineWidth: number;
}

interface ParsedPdfOperatorsV1 {
  readonly paths: readonly PdfPathV1[];
  readonly imageUses: readonly PdfImageUseV1[];
  readonly textStates: readonly {
    readonly fontName: string;
    readonly fontSize: number;
    readonly color: PdfColorV1;
    readonly transform: PdfMatrixV1;
  }[];
}

const IDENTITY_MATRIX: PdfMatrixV1 = [1, 0, 0, 1, 0, 0];
const DEFAULT_COLOR: PdfColorV1 = { space: 'gray', channels: [0] };

function isWhitespace(character: string | undefined): boolean {
  return character === ' ' || character === '\t' || character === '\r' || character === '\n' || character === '\f' || character === '\0';
}

function isDelimiter(character: string | undefined): boolean {
  return character === undefined || isWhitespace(character) || character === '(' || character === ')' || character === '<' ||
    character === '>' || character === '[' || character === ']' || character === '{' || character === '}' ||
    character === '/' || character === '%';
}

function skipComment(content: string, start: number): number {
  let cursor = start;

  while (cursor < content.length && content[cursor] !== '\n' && content[cursor] !== '\r') cursor += 1;

  return cursor;
}

function skipLiteralString(content: string, start: number): number {
  let cursor = start + 1;
  let depth = 1;

  while (cursor < content.length && depth > 0) {
    const character = content[cursor];

    if (character === '\\') {
      cursor += 2;
      continue;
    }

    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    cursor += 1;
  }

  return cursor;
}

function skipBracketed(content: string, start: number, open: string, close: string): number {
  let cursor = start + open.length;
  let depth = 1;

  while (cursor < content.length && depth > 0) {
    if (content.startsWith(open, cursor)) {
      depth += 1;
      cursor += open.length;
      continue;
    }

    if (content.startsWith(close, cursor)) {
      depth -= 1;
      cursor += close.length;
      continue;
    }

    if (content[cursor] === '(') {
      cursor = skipLiteralString(content, cursor);
      continue;
    }

    cursor += 1;
  }

  return cursor;
}

type PdfTokenReadV1 = { readonly token: PdfTokenV1 | undefined; readonly next: number };

function readStructuralToken(content: string, cursor: number): PdfTokenReadV1 | undefined {
  const character = content[cursor];

  if (character === '%') return readToken(content, skipComment(content, cursor));
  if (character === '(') return { token: { kind: 'opaque' }, next: skipLiteralString(content, cursor) };
  if (character === '[') return { token: { kind: 'opaque' }, next: skipBracketed(content, cursor, '[', ']') };

  if (character === '<') {
    const dictionary = content[cursor + 1] === '<';

    return {
      token: { kind: 'opaque' },
      next: dictionary ? skipBracketed(content, cursor, '<<', '>>') : skipBracketed(content, cursor, '<', '>'),
    };
  }

  if (character === '/') {
    let end = cursor + 1;

    while (end < content.length && !isDelimiter(content[end])) end += 1;

    return { token: { kind: 'name', value: content.slice(cursor + 1, end) }, next: end };
  }

  return undefined;
}

function readToken(content: string, start: number): PdfTokenReadV1 {
  let cursor = start;

  while (cursor < content.length && isWhitespace(content[cursor])) cursor += 1;

  if (cursor >= content.length) return { token: undefined, next: cursor };

  const structural = readStructuralToken(content, cursor);

  if (structural !== undefined) return structural;

  let end = cursor;

  while (end < content.length && !isDelimiter(content[end])) end += 1;

  const value = content.slice(cursor, end);
  const number = Number(value);

  return Number.isFinite(number) && value !== ''
    ? { token: { kind: 'number', value: number }, next: end }
    : { token: { kind: 'word', value }, next: end };
}

function tokenize(content: string): readonly PdfTokenV1[] {
  const tokens: PdfTokenV1[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const read = readToken(content, cursor);

    if (read.token !== undefined) tokens.push(read.token);
    cursor = read.next > cursor ? read.next : cursor + 1;
  }

  return tokens;
}

function multiply(left: PdfMatrixV1, right: PdfMatrixV1): PdfMatrixV1 {
  const [a, b, c, d, e, f] = left;
  const [g, h, i, j, k, l] = right;

  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ];
}

function transformPoint(matrix: PdfMatrixV1, x: number, y: number): readonly [number, number] {
  return [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5],
  ];
}

function numericOperands(operands: readonly PdfTokenV1[]): readonly number[] {
  return operands.flatMap((operand) => operand.kind === 'number' ? [operand.value] : []);
}

function lastName(operands: readonly PdfTokenV1[]): string | undefined {
  for (let index = operands.length - 1; index >= 0; index -= 1) {
    const operand = operands[index];

    if (operand?.kind === 'name') return operand.value;
  }

  return undefined;
}

function colorFromOperands(space: PdfColorV1['space'], values: readonly number[]): PdfColorV1 | undefined {
  if (space === 'gray' && values.length >= 1) return { space, channels: [values.at(-1) ?? 0] };

  if (space === 'rgb' && values.length >= 3) {
    return { space, channels: [values.at(-3) ?? 0, values.at(-2) ?? 0, values.at(-1) ?? 0] };
  }

  if (space === 'cmyk' && values.length >= 4) {
    return {
      space,
      channels: [values.at(-4) ?? 0, values.at(-3) ?? 0, values.at(-2) ?? 0, values.at(-1) ?? 0],
    };
  }

  return undefined;
}

function colorSpace(operator: string): PdfColorV1['space'] | undefined {
  if (operator === 'g' || operator === 'G') return 'gray';
  if (operator === 'rg' || operator === 'RG') return 'rgb';
  if (operator === 'k' || operator === 'K') return 'cmyk';

  return undefined;
}

class PdfOperatorInterpreterV1 {
  private readonly paths: PdfPathV1[] = [];
  private readonly imageUses: PdfImageUseV1[] = [];
  private readonly stack: PdfGraphicsStateV1[] = [];
  private readonly textStates: ParsedPdfOperatorsV1['textStates'][number][] = [];
  private state: PdfGraphicsStateV1 = {
    transform: IDENTITY_MATRIX,
    fill: DEFAULT_COLOR,
    stroke: DEFAULT_COLOR,
    lineWidth: 1,
  };
  private commands: PdfPathCommandV1[] = [];
  private textMatrix: PdfMatrixV1 = IDENTITY_MATRIX;
  private fontName = 'Helvetica';
  private fontSize = 12;

  read(): ParsedPdfOperatorsV1 {
    return { paths: this.paths, imageUses: this.imageUses, textStates: this.textStates };
  }

  apply(operator: string, operands: readonly PdfTokenV1[]): void {
    const values = numericOperands(operands);

    if (this.applyPathOperator(operator, values)) return;
    if (this.applyGraphicsOperator(operator, values)) return;
    if (this.applyColorOperator(operator, values)) return;
    if (this.applyTextOperator(operator, operands, values)) return;

    if (operator === 'Do') {
      const resourceName = lastName(operands);

      if (resourceName !== undefined) this.imageUses.push({ resourceName, transform: this.state.transform });

      return;
    }

    this.applyPaintOperator(operator);
  }

  private closePath(): void {
    if (this.commands.at(-1)?.kind !== 'close') this.commands.push({ kind: 'close' });
  }

  private paintPath(input: { readonly fill: boolean; readonly stroke: boolean; readonly evenodd: boolean }): void {
    if (this.commands.length > 0) {
      this.paths.push({
        commands: this.commands,
        fillRule: input.evenodd ? 'evenodd' : 'nonzero',
        fill: input.fill ? this.state.fill : undefined,
        stroke: input.stroke ? this.state.stroke : undefined,
        lineWidth: Math.max(0, this.state.lineWidth),
      });
    }

    this.commands = [];
  }

  private applyPathOperator(operator: string, values: readonly number[]): boolean {
    if (operator === 'm' && values.length >= 2) {
      this.commands.push({
        kind: 'move',
        point: transformPoint(this.state.transform, values.at(-2) ?? 0, values.at(-1) ?? 0),
      });

      return true;
    }

    if (operator === 'l' && values.length >= 2) {
      this.commands.push({
        kind: 'line',
        point: transformPoint(this.state.transform, values.at(-2) ?? 0, values.at(-1) ?? 0),
      });

      return true;
    }

    if (operator === 'c' && values.length >= 6) {
      this.commands.push({
        kind: 'cubic',
        control1: transformPoint(this.state.transform, values.at(-6) ?? 0, values.at(-5) ?? 0),
        control2: transformPoint(this.state.transform, values.at(-4) ?? 0, values.at(-3) ?? 0),
        point: transformPoint(this.state.transform, values.at(-2) ?? 0, values.at(-1) ?? 0),
      });

      return true;
    }

    if (operator === 're' && values.length >= 4) {
      const x = values.at(-4) ?? 0;
      const y = values.at(-3) ?? 0;
      const width = values.at(-2) ?? 0;
      const height = values.at(-1) ?? 0;

      this.commands.push(
        { kind: 'move', point: transformPoint(this.state.transform, x, y) },
        { kind: 'line', point: transformPoint(this.state.transform, x + width, y) },
        { kind: 'line', point: transformPoint(this.state.transform, x + width, y + height) },
        { kind: 'line', point: transformPoint(this.state.transform, x, y + height) },
        { kind: 'close' },
      );

      return true;
    }

    if (operator === 'h') {
      this.closePath();

      return true;
    }

    return false;
  }

  private applyGraphicsOperator(operator: string, values: readonly number[]): boolean {
    if (operator === 'q') {
      this.stack.push(this.state);

      return true;
    }

    if (operator === 'Q') {
      this.state = this.stack.pop() ?? this.state;

      return true;
    }

    if (operator === 'w') {
      this.state = { ...this.state, lineWidth: values.at(-1) ?? this.state.lineWidth };

      return true;
    }

    if (operator !== 'cm' || values.length < 6) return false;

    const matrix: PdfMatrixV1 = [
      values.at(-6) ?? 1,
      values.at(-5) ?? 0,
      values.at(-4) ?? 0,
      values.at(-3) ?? 1,
      values.at(-2) ?? 0,
      values.at(-1) ?? 0,
    ];

    this.state = { ...this.state, transform: multiply(this.state.transform, matrix) };

    return true;
  }

  private applyColorOperator(operator: string, values: readonly number[]): boolean {
    const space = colorSpace(operator);

    if (space === undefined) return false;

    const color = colorFromOperands(space, values);

    if (color !== undefined && operator === operator.toLowerCase()) this.state = { ...this.state, fill: color };
    if (color !== undefined && operator !== operator.toLowerCase()) this.state = { ...this.state, stroke: color };

    return true;
  }

  private applyTextOperator(
    operator: string,
    operands: readonly PdfTokenV1[],
    values: readonly number[],
  ): boolean {
    if (operator === 'BT') {
      this.textMatrix = IDENTITY_MATRIX;

      return true;
    }

    if (operator === 'Tm' && values.length >= 6) {
      this.textMatrix = [
        values.at(-6) ?? 1,
        values.at(-5) ?? 0,
        values.at(-4) ?? 0,
        values.at(-3) ?? 1,
        values.at(-2) ?? 0,
        values.at(-1) ?? 0,
      ];

      return true;
    }

    if ((operator === 'Td' || operator === 'TD') && values.length >= 2) {
      this.textMatrix = [
        this.textMatrix[0],
        this.textMatrix[1],
        this.textMatrix[2],
        this.textMatrix[3],
        this.textMatrix[4] + (values.at(-2) ?? 0),
        this.textMatrix[5] + (values.at(-1) ?? 0),
      ];

      return true;
    }

    if (operator === 'Tf') {
      this.fontName = lastName(operands) ?? this.fontName;
      this.fontSize = values.at(-1) ?? this.fontSize;

      return true;
    }

    if (operator !== 'Tj' && operator !== 'TJ') return false;

    this.textStates.push({
      fontName: this.fontName,
      fontSize: this.fontSize,
      color: this.state.fill,
      transform: multiply(this.state.transform, this.textMatrix),
    });

    return true;
  }

  private applyPaintOperator(operator: string): void {
    if (operator === 'f' || operator === 'F') this.paintPath({ fill: true, stroke: false, evenodd: false });
    else if (operator === 'f*') this.paintPath({ fill: true, stroke: false, evenodd: true });
    else if (operator === 'S') this.paintPath({ fill: false, stroke: true, evenodd: false });
    else if (operator === 's') {
      this.closePath();
      this.paintPath({ fill: false, stroke: true, evenodd: false });
    } else if (operator === 'B' || operator === 'b') {
      if (operator === 'b') this.closePath();
      this.paintPath({ fill: true, stroke: true, evenodd: false });
    } else if (operator === 'B*' || operator === 'b*') {
      if (operator === 'b*') this.closePath();
      this.paintPath({ fill: true, stroke: true, evenodd: true });
    } else if (operator === 'n') this.commands = [];
  }
}

export function parsePdfOperatorsV1(content: string): ParsedPdfOperatorsV1 {
  const interpreter = new PdfOperatorInterpreterV1();
  let operands: PdfTokenV1[] = [];

  for (const token of tokenize(content)) {
    if (token.kind !== 'word') {
      operands.push(token);
      continue;
    }

    interpreter.apply(token.value, operands);
    operands = [];
  }

  return interpreter.read();
}
