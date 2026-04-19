const VISIBLE_WHEN_TOKEN_RE =
  /&&|\|\||==|!=|>=|<=|>|<|!|\(|\)|true|false|-?\d+(?:\.\d+)?|'[^']*'|[a-zA-Z_][a-zA-Z0-9_]*/g;

const VISIBLE_WHEN_BINARY_OPERATORS = new Set(['&&', '||', '==', '!=', '>=', '<=', '>', '<']);

function isVisibleWhenOperand(token: string): boolean {
  return /^(?:true|false|-?\d+(?:\.\d+)?|'[^']*'|[a-zA-Z_][a-zA-Z0-9_]*)$/.test(token);
}

interface VisibleWhenParserState {
  readonly depth: number;
  readonly expectsOperand: boolean;
}

/**
 * Advance the visible-when parser state by one token. Returns the next
 * state, or null if the token is illegal in the current position.
 */
function stepVisibleWhenParser(token: string, state: VisibleWhenParserState): VisibleWhenParserState | null {
  if (token === '(') {
    return state.expectsOperand ? { depth: state.depth + 1, expectsOperand: true } : null;
  }

  if (token === ')') {
    return !state.expectsOperand && state.depth > 0
      ? { depth: state.depth - 1, expectsOperand: false }
      : null;
  }

  if (token === '!') {
    return state.expectsOperand ? state : null;
  }

  if (VISIBLE_WHEN_BINARY_OPERATORS.has(token)) {
    return state.expectsOperand ? null : { depth: state.depth, expectsOperand: true };
  }

  return state.expectsOperand && isVisibleWhenOperand(token)
    ? { depth: state.depth, expectsOperand: false }
    : null;
}

export function isValidVisibleWhenExpression(expression: string | null | undefined): boolean {
  if (expression === null || expression === undefined || expression.trim() === '') {
    return true;
  }

  const trimmed = expression.replace(/\s+/g, '');
  const tokens = trimmed.match(VISIBLE_WHEN_TOKEN_RE);

  if (tokens?.join('') !== trimmed) {
    return false;
  }

  let state: VisibleWhenParserState = { depth: 0, expectsOperand: true };

  for (const token of tokens) {
    const next = stepVisibleWhenParser(token, state);

    if (next === null) {
      return false;
    }

    state = next;
  }

  return state.depth === 0 && !state.expectsOperand;
}

export function isLikelyUrlLikeContent(value: string): boolean {
  if (value === '') {
    return true;
  }

  if (/^(https?:\/\/|data:|\.\/|\.\.\/|\/)/.test(value)) {
    return true;
  }

  return !/\s/.test(value);
}

export function isTickerContent(value: string): boolean {
  if (value === '') {
    return true;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string');
  } catch {
    return false;
  }
}
