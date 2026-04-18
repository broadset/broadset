const VISIBLE_WHEN_TOKEN_RE =
  /&&|\|\||==|!=|>=|<=|>|<|!|\(|\)|true|false|-?\d+(?:\.\d+)?|'[^']*'|[a-zA-Z_][a-zA-Z0-9_]*/g;

function isVisibleWhenOperand(token: string): boolean {
  return /^(?:true|false|-?\d+(?:\.\d+)?|'[^']*'|[a-zA-Z_][a-zA-Z0-9_]*)$/.test(token);
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

  let depth = 0;
  let expectsOperand = true;

  for (const token of tokens) {
    if (token === '(') {
      if (!expectsOperand) {
        return false;
      }

      depth += 1;
      continue;
    }

    if (token === ')') {
      if (expectsOperand || depth === 0) {
        return false;
      }

      depth -= 1;
      continue;
    }

    if (token === '!') {
      if (!expectsOperand) {
        return false;
      }

      continue;
    }

    if (token === '&&' || token === '||') {
      if (expectsOperand) {
        return false;
      }

      expectsOperand = true;
      continue;
    }

    if (token === '==' || token === '!=' || token === '>=' || token === '<=' || token === '>' || token === '<') {
      if (expectsOperand) {
        return false;
      }

      expectsOperand = true;
      continue;
    }

    if (!isVisibleWhenOperand(token) || !expectsOperand) {
      return false;
    }

    expectsOperand = false;
  }

  return depth === 0 && !expectsOperand;
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
