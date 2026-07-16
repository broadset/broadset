type BoundedByteLength = { readonly status: 'within'; readonly byteLength: number } | { readonly status: 'exceeded' };

type MarkupBoundsResult =
  | { readonly status: 'within'; readonly nodeCount: number; readonly maxDepth: number }
  | { readonly status: 'rejected'; readonly reason: 'node-limit' | 'depth-limit' };

export function resolvePositiveIntegerLimit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function measureUtf8BytesUpTo(value: string, maxBytes: number): BoundedByteLength {
  let byteLength = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit <= 0x7f) byteLength += 1;
    else if (codeUnit <= 0x7ff) byteLength += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && isLowSurrogate(value.charCodeAt(index + 1))) {
      byteLength += 4;
      index += 1;
    } else byteLength += 3;

    if (byteLength > maxBytes) return { status: 'exceeded' };
  }

  return { status: 'within', byteLength };
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

export function productFitsLimit(factors: readonly number[], limit: number): boolean {
  if (!Number.isSafeInteger(limit) || limit < 0) return false;

  let product = 1;

  for (const factor of factors) {
    if (!Number.isSafeInteger(factor) || factor < 0) return false;
    if (factor !== 0 && product > Math.floor(limit / factor)) return false;

    product *= factor;
  }

  return product <= limit;
}

export function inspectMarkupBounds(
  source: string,
  limits: { readonly maxNodes: number; readonly maxDepth: number },
): MarkupBoundsResult {
  let cursor = 0;
  let depth = 0;
  let deepest = 0;
  let nodeCount = 0;

  while (cursor < source.length) {
    const token = nextMarkupToken(source, cursor);

    if (token === undefined) break;

    cursor = token.end;
    nodeCount += token.nodeCount;

    if (nodeCount > limits.maxNodes) return { status: 'rejected', reason: 'node-limit' };

    if (token.kind === 'ignored') continue;

    if (token.kind === 'closing') {
      depth = Math.max(0, depth - 1);
      continue;
    }

    depth += 1;
    deepest = Math.max(deepest, depth);

    if (deepest > limits.maxDepth) return { status: 'rejected', reason: 'depth-limit' };
    if (token.selfClosing) depth -= 1;
  }

  return { status: 'within', nodeCount, maxDepth: deepest };
}

export function containsForbiddenXmlDeclaration(source: string): boolean {
  let cursor = 0;

  while (cursor < source.length) {
    const opening = source.indexOf('<', cursor);

    if (opening < 0) return false;

    const lexicalRegionEnd = specialMarkupEnd(source, opening);

    if (lexicalRegionEnd !== undefined) {
      cursor = lexicalRegionEnd;
      continue;
    }

    if (source.charCodeAt(opening + 1) !== 0x21) {
      cursor = opening + 1;
      continue;
    }

    let keywordOffset = opening + 2;

    while (isAsciiWhitespace(source.charCodeAt(keywordOffset))) keywordOffset += 1;

    for (const keyword of FORBIDDEN_XML_DECLARATIONS) {
      if (
        asciiKeywordAt(source, keywordOffset, keyword) &&
        hasXmlDeclarationBoundary(source, keywordOffset + keyword.length)
      ) {
        return true;
      }
    }

    cursor = opening + 2;
  }

  return false;
}

const FORBIDDEN_XML_DECLARATIONS = ['DOCTYPE', 'ENTITY', 'ELEMENT', 'ATTLIST', 'NOTATION'] as const;

function hasXmlDeclarationBoundary(source: string, offset: number): boolean {
  const code = source.charCodeAt(offset);

  return Number.isNaN(code) || isAsciiWhitespace(code) || code === 0x3e || code === 0x5b;
}

function asciiKeywordAt(source: string, offset: number, keyword: string): boolean {
  if (offset > source.length - keyword.length) return false;

  for (let index = 0; index < keyword.length; index += 1) {
    const sourceCode = source.charCodeAt(offset + index);
    const upperCode = sourceCode >= 0x61 && sourceCode <= 0x7a ? sourceCode - 0x20 : sourceCode;

    if (upperCode !== keyword.charCodeAt(index)) return false;
  }

  return true;
}

function isAsciiWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

interface MarkupToken {
  readonly kind: 'opening' | 'closing' | 'ignored';
  readonly end: number;
  readonly nodeCount: number;
  readonly selfClosing: boolean;
}

function nextMarkupToken(source: string, cursor: number): MarkupToken | undefined {
  const opening = source.indexOf('<', cursor);

  if (opening < 0) {
    return cursor < source.length ?
        { kind: 'ignored', end: source.length, nodeCount: 1, selfClosing: false }
      : undefined;
  }

  const specialEnd = specialMarkupEnd(source, opening);
  const leadingTextNodes = opening > cursor ? 1 : 0;

  if (specialEnd !== undefined) {
    return { kind: 'ignored', end: specialEnd, nodeCount: leadingTextNodes + 1, selfClosing: false };
  }

  const tagEnd = findTagEnd(source, opening + 1);

  if (tagEnd < 0) return undefined;

  const marker = source.charAt(opening + 1);

  if (marker === '!') return { kind: 'ignored', end: tagEnd + 1, nodeCount: leadingTextNodes + 1, selfClosing: false };
  if (marker === '/') return { kind: 'closing', end: tagEnd + 1, nodeCount: leadingTextNodes, selfClosing: false };

  return {
    kind: 'opening',
    end: tagEnd + 1,
    nodeCount: leadingTextNodes + 1,
    selfClosing: isSelfClosing(source, opening, tagEnd),
  };
}

function specialMarkupEnd(source: string, opening: number): number | undefined {
  if (source.startsWith('<!--', opening)) return afterTerminator(source, opening + 4, '-->');
  if (source.startsWith('<![CDATA[', opening)) return afterTerminator(source, opening + 9, ']]>');
  if (source.startsWith('<?', opening)) return afterTerminator(source, opening + 2, '?>');

  return undefined;
}

function afterTerminator(source: string, start: number, terminator: string): number {
  const end = source.indexOf(terminator, start);

  return end < 0 ? source.length : end + terminator.length;
}

function findTagEnd(source: string, start: number): number {
  let quote = '';

  for (let index = start; index < source.length; index += 1) {
    const character = source.charAt(index);

    if (quote !== '') {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return index;
  }

  return -1;
}

function isSelfClosing(source: string, opening: number, tagEnd: number): boolean {
  for (let index = tagEnd - 1; index > opening; index -= 1) {
    const character = source.charAt(index);

    if (character === '/') return true;
    if (character !== ' ' && character !== '\t' && character !== '\r' && character !== '\n') return false;
  }

  return false;
}
