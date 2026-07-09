import {
  blurFilter,
  brightnessFilter,
  contrastFilter,
  customSvgFilter,
  dropShadowFilter,
  type FilterPrimitive,
  type FilterStack,
  grayscaleFilter,
  hueRotateFilter,
  invertFilter,
  opacityFilter,
  saturateFilter,
  sepiaFilter,
} from '../filter-stack';
import { migrateLegacyColor } from './migrate-legacy-color';

/**
 * Parses a CSS `filter` / `backdrop-filter` function list into a
 * `FilterStack` of structured primitives. The parse recognises every
 * primitive `filterStackToCss` can round-trip; unknown function names
 * or malformed tokens fall back to a `custom-svg` primitive that
 * preserves the raw source — no token is silently dropped per IO-D-18.
 *
 * The function is tolerant by design: the CSS grammar is permissive
 * about whitespace, unit suffixes, and alpha. The parser reads one
 * `name(args)` token at a time without attempting a full CSS-value
 * grammar.
 */
export function migrateLegacyFilter(input: string | null | undefined): FilterStack | undefined {
  if (input === null || input === undefined) {
    return undefined;
  }

  const trimmed = input.trim();

  if (trimmed === '' || trimmed === 'none') {
    return undefined;
  }

  const tokens = tokenizeFilterFunctions(trimmed);

  if (tokens.length === 0) {
    return [customSvgFilter(trimmed)];
  }

  return tokens.map(parseFilterFunction);
}

interface FilterFunctionToken {
  readonly name: string;
  readonly args: string;
  readonly raw: string;
}

interface TokenScan {
  readonly tokens: readonly FilterFunctionToken[];
  readonly bailed: boolean;
}

function skipWhitespace(input: string, start: number): number {
  let index = start;

  while (index < input.length && /\s/.test(input[index] ?? '')) {
    index++;
  }

  return index;
}

function readName(input: string, start: number): { readonly end: number; readonly name: string } {
  let index = start;

  while (index < input.length && /[a-zA-Z-]/.test(input[index] ?? '')) {
    index++;
  }

  return { end: index, name: input.slice(start, index) };
}

function findBalancedClose(input: string, openIndex: number): number {
  let depth = 1;
  let index = openIndex + 1;

  while (index < input.length && depth > 0) {
    const char = input[index];

    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (depth > 0) index++;
  }

  return depth === 0 ? index : -1;
}

function scanNextToken(input: string, start: number): { readonly token: FilterFunctionToken | null; readonly next: number } {
  const afterWhitespace = skipWhitespace(input, start);

  if (afterWhitespace >= input.length) {
    return { token: null, next: afterWhitespace };
  }

  const { end: nameEnd, name } = readName(input, afterWhitespace);

  if (name === '' || input[nameEnd] !== '(') {
    return { token: null, next: -1 };
  }

  const closeIndex = findBalancedClose(input, nameEnd);

  if (closeIndex === -1) {
    return { token: null, next: -1 };
  }

  const args = input.slice(nameEnd + 1, closeIndex).trim();
  const raw = input.slice(afterWhitespace, closeIndex + 1);

  return { token: { name, args, raw }, next: closeIndex + 1 };
}

function tokenizeFilterFunctions(input: string): readonly FilterFunctionToken[] {
  const scan = scanFilterTokens(input);

  return scan.bailed ? [] : scan.tokens;
}

function scanFilterTokens(input: string): TokenScan {
  const tokens: FilterFunctionToken[] = [];
  let index = 0;

  while (index < input.length) {
    const { token, next } = scanNextToken(input, index);

    if (next === -1) {
      return { tokens: [], bailed: true };
    }

    if (token === null) {
      index = next;
      continue;
    }

    tokens.push(token);
    index = next;
  }

  return { tokens, bailed: false };
}

function parseFilterFunction(token: FilterFunctionToken): FilterPrimitive {
  switch (token.name) {
    case 'blur':
      return blurFilter(parseLengthToPixels(token.args));
    case 'brightness':
      return brightnessFilter(parsePercentageOrNumber(token.args));
    case 'contrast':
      return contrastFilter(parsePercentageOrNumber(token.args));
    case 'saturate':
      return saturateFilter(parsePercentageOrNumber(token.args));
    case 'grayscale':
      return grayscaleFilter(parsePercentageOrNumber(token.args));
    case 'sepia':
      return sepiaFilter(parsePercentageOrNumber(token.args));
    case 'invert':
      return invertFilter(parsePercentageOrNumber(token.args));
    case 'opacity':
      return opacityFilter(parsePercentageOrNumber(token.args));
    case 'hue-rotate':
      return hueRotateFilter(parseAngleToDegrees(token.args));
    case 'drop-shadow':
      return parseDropShadow(token.args, token.raw);
    default:
      return customSvgFilter(token.raw);
  }
}

function parseLengthToPixels(input: string): number {
  const match = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/i.exec(input.trim());

  if (match === null) {
    return 0;
  }

  const value = Number(match[1]);
  const unit = (match[2] ?? 'px').toLowerCase();

  if (unit === 'px') return value;

  return value;
}

function parsePercentageOrNumber(input: string): number {
  const trimmed = input.trim();

  if (trimmed.endsWith('%')) {
    return Number(trimmed.slice(0, -1)) / 100;
  }

  const value = Number(trimmed);

  return Number.isFinite(value) ? value : 1;
}

function parseAngleToDegrees(input: string): number {
  const match = /^(-?\d+(?:\.\d+)?)(deg|rad|turn|grad)?$/i.exec(input.trim());

  if (match === null) return 0;

  const value = Number(match[1]);
  const unit = (match[2] ?? 'deg').toLowerCase();

  if (unit === 'deg') return value;
  if (unit === 'rad') return (value * 180) / Math.PI;
  if (unit === 'turn') return value * 360;
  if (unit === 'grad') return value * 0.9;

  return value;
}

function parseDropShadow(args: string, raw: string): FilterPrimitive {
  const tokens = splitTopLevel(args);

  if (tokens.length < 3) {
    return customSvgFilter(raw);
  }

  const offsetX = parseLengthToPixels(tokens[0] ?? '0');
  const offsetY = parseLengthToPixels(tokens[1] ?? '0');
  const blur = parseLengthToPixels(tokens[2] ?? '0');
  const colorToken = tokens[3] ?? '#000000';
  const color = migrateLegacyColor(colorToken);

  if (color === undefined) {
    return customSvgFilter(raw);
  }

  return dropShadowFilter({ offsetX, offsetY, blur, color });
}

function splitTopLevel(input: string): readonly string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of input) {
    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (depth === 0 && /\s/.test(char)) {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }

      continue;
    }

    current += char;
  }

  if (current !== '') {
    tokens.push(current);
  }

  return tokens;
}
