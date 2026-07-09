/**
 * Small recursive-descent parser for arithmetic expressions used by `NumField`
 * (e.g. "200+50", "(100+20)*2"). Exists so user expression input can be
 * evaluated without resorting to `new Function` / `eval`, which would introduce
 * an RCE surface if any sanitation bug slipped through.
 *
 * Supports: decimal number literals, `+`, `-`, `*`, `/`, parentheses, unary
 * `+`/`-`, and whitespace. Anything outside this grammar yields `null`.
 */

const NUMBER_RE = /^\d+(?:\.\d+)?|^\.\d+/;

type ArithmeticOperator = '+' | '-' | '*' | '/';

type Token =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'op'; readonly op: ArithmeticOperator }
  | { readonly kind: 'lparen' }
  | { readonly kind: 'rparen' };

interface ParserState {
  readonly tokens: readonly Token[];
  pos: number;
}

function tokenize(input: string): readonly Token[] | null {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const ch = input[index];

    if (ch === ' ' || ch === '\t') {
      index += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      index += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      index += 1;
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ kind: 'op', op: ch });
      index += 1;
      continue;
    }

    const numberMatch = NUMBER_RE.exec(input.slice(index));

    if (numberMatch === null) {
      return null;
    }

    const value = Number(numberMatch[0]);

    if (!Number.isFinite(value)) {
      return null;
    }

    tokens.push({ kind: 'num', value });
    index += numberMatch[0].length;
  }

  return tokens;
}

function parseAddSub(state: ParserState): number | null {
  let left = parseMulDiv(state);

  if (left === null) {
    return null;
  }

  while (state.pos < state.tokens.length) {
    const token = state.tokens[state.pos];

    if (token?.kind !== 'op' || (token.op !== '+' && token.op !== '-')) {
      break;
    }

    state.pos += 1;

    const right = parseMulDiv(state);

    if (right === null) {
      return null;
    }

    left = token.op === '+' ? left + right : left - right;
  }

  return left;
}

function parseMulDiv(state: ParserState): number | null {
  let left = parseUnary(state);

  if (left === null) {
    return null;
  }

  while (state.pos < state.tokens.length) {
    const token = state.tokens[state.pos];

    if (token?.kind !== 'op' || (token.op !== '*' && token.op !== '/')) {
      break;
    }

    state.pos += 1;

    const right = parseUnary(state);

    if (right === null) {
      return null;
    }

    if (token.op === '/' && right === 0) {
      return null;
    }

    left = token.op === '*' ? left * right : left / right;
  }

  return left;
}

function parseUnary(state: ParserState): number | null {
  const token = state.tokens[state.pos];

  if (token?.kind === 'op' && (token.op === '+' || token.op === '-')) {
    state.pos += 1;

    const factor = parseFactor(state);

    if (factor === null) {
      return null;
    }

    return token.op === '-' ? -factor : factor;
  }

  return parseFactor(state);
}

function parseFactor(state: ParserState): number | null {
  const token = state.tokens[state.pos];

  if (token === undefined) {
    return null;
  }

  if (token.kind === 'num') {
    state.pos += 1;

    return token.value;
  }

  if (token.kind === 'lparen') {
    state.pos += 1;

    const inner = parseAddSub(state);

    if (inner === null) {
      return null;
    }

    if (state.tokens[state.pos]?.kind !== 'rparen') {
      return null;
    }

    state.pos += 1;

    return inner;
  }

  return null;
}

/**
 * Evaluate a numeric arithmetic expression supporting `+ - * / ( )`, unary
 * `+`/`-`, and decimal literals. Returns `null` for any malformed input,
 * division by zero, or non-finite result.
 */
export function evaluateArithmeticExpression(raw: string): number | null {
  const trimmed = raw.trim();

  if (trimmed === '') {
    return null;
  }

  const tokens = tokenize(trimmed);

  if (tokens === null || tokens.length === 0) {
    return null;
  }

  const state: ParserState = { tokens, pos: 0 };
  const result = parseAddSub(state);

  if (result === null || state.pos !== tokens.length) {
    return null;
  }

  return Number.isFinite(result) ? result : null;
}
