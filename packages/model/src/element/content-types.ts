const ALLOWED_TAGS = new Set(['b', 'i', 'u', 'br', 'span', 'strong', 'em']);
const ALLOWED_INLINE_STYLE_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
]);

function sanitizeInlineStyle(styleValue: string): string {
  const declarations = styleValue.split(';');
  const safeDeclarations: string[] = [];

  for (const declaration of declarations) {
    const trimmed = declaration.trim();

    if (trimmed === '') {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':');

    if (separatorIndex <= 0) {
      continue;
    }

    const property = trimmed.slice(0, separatorIndex).trim().toLowerCase();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!ALLOWED_INLINE_STYLE_PROPERTIES.has(property) || value === '') {
      continue;
    }

    if (/[<>`]/.test(value) || /expression\s*\(|url\s*\(|javascript:|data:/i.test(value)) {
      continue;
    }

    safeDeclarations.push(`${property}: ${value}`);
  }

  return safeDeclarations.join('; ');
}

export function sanitizeTextContent(html: string): string {
  let result = html.replace(/<(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  result = result.replace(/<(script|style|iframe|object|embed|form)\b[^>]*\/?>/gi, '');

  return result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)\/?>/g, (match, tagName, attrs) => {
    const lower = String(tagName).toLowerCase();

    if (!ALLOWED_TAGS.has(lower)) {
      return '';
    }

    if (match.startsWith('</')) {
      return `</${lower}>`;
    }

    const styleMatch = /\bstyle\s*=\s*(['"])(.*?)\1/i.exec(String(attrs));
    const safeStyleValue = styleMatch === null ? '' : sanitizeInlineStyle(styleMatch[2] ?? '');
    const escapedStyleValue = safeStyleValue.replace(/"/g, '&quot;');
    const styleAttribute = escapedStyleValue === '' ? '' : ` style="${escapedStyleValue}"`;

    return `<${lower}${styleAttribute}>`;
  });
}

const SVG_PATH_COMMANDS = new Set([
  'M',
  'm',
  'L',
  'l',
  'H',
  'h',
  'V',
  'v',
  'C',
  'c',
  'S',
  's',
  'Q',
  'q',
  'T',
  't',
  'A',
  'a',
  'Z',
  'z',
]);

const NUMERIC_TOKEN_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function isNumericToken(token: string): boolean {
  return NUMERIC_TOKEN_RE.test(token);
}

export function isValidSvgPathData(pathData: string): boolean {
  if (pathData === '') {
    return true;
  }

  const trimmed = pathData.trim();

  if (trimmed.length === 0) {
    return true;
  }

  if (!trimmed.startsWith('M') && !trimmed.startsWith('m')) {
    return false;
  }

  const tokens = trimmed.split(/[\s,]+/);

  for (const token of tokens) {
    if (token === '') {
      continue;
    }

    if (isNumericToken(token)) {
      continue;
    }

    const firstCharacter = token[0] ?? '';

    if (token.length === 1 && SVG_PATH_COMMANDS.has(firstCharacter)) {
      continue;
    }

    if (token.length > 1 && SVG_PATH_COMMANDS.has(firstCharacter) && isNumericToken(token.slice(1))) {
      continue;
    }

    return false;
  }

  return true;
}
