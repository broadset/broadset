/**
 * Allowlist for URL schemes that may appear inside CSS `url(...)`
 * functional references. Anything outside the allowlist (most
 * importantly `javascript:`, but also `vbscript:`, `data:` for
 * non-image MIMEs, `file:`, custom schemes) gets stripped from CSS
 * text before the bytes leave the importer.
 *
 * The matcher is intentionally narrower than the SVG href allowlist
 * in `import-security.ts` — preserved blobs are opaque on re-export,
 * so we can only trust what we sanitise here.
 */

const SAFE_URL_PREFIXES: readonly string[] = ['data:image/', 'https://', 'http://', '#', '/'];

const URL_PREFIX_PATTERN = /url\(/gi;

function isSafeUrl(url: string): boolean {
  const lower = url.toLowerCase().trim();

  return SAFE_URL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Find the closing `)` for a quoted `url("…")` or `url('…')`. The
 * cursor `i` points at the opening quote character.
 */
function findQuotedUrlClose(cssText: string, i: number, quote: string): number {
  let cursor = i + 1;

  while (cursor < cssText.length && cssText[cursor] !== quote) cursor += 1;
  if (cursor >= cssText.length) return -1;
  cursor += 1;
  while (cursor < cssText.length && cssText[cursor] !== ')') cursor += 1;
  if (cursor >= cssText.length) return -1;

  return cursor;
}

/**
 * Find the closing `)` for an unquoted `url(…)` body, tolerating
 * nested `()` pairs (e.g. `url(javascript:alert(1))`).
 */
function findUnquotedUrlClose(cssText: string, startIndex: number): number {
  let depth = 1;
  let cursor = startIndex;

  while (cursor < cssText.length) {
    const ch = cssText[cursor];

    if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return cursor;
    }

    cursor += 1;
  }

  return -1;
}

/**
 * Locate the matching close-paren for a `url(` that began at
 * `openIndex`. Honours quoted url contents (single + double) and
 * tolerates nested `()` pairs in unquoted urls. Returns the index of
 * the closing `)`, or `-1` when the input is malformed.
 *
 * Linear in the length of the slice scanned — no nested unbounded
 * quantifiers, per the regex-safety rule in
 * `agents/instructions/typescript.instructions.md`.
 */
function findUrlClose(cssText: string, openIndex: number): number {
  let i = openIndex;

  // Skip leading whitespace.
  while (i < cssText.length && /\s/.test(cssText[i] ?? '')) i += 1;

  const first = cssText[i];

  if (first === '"' || first === "'") {
    return findQuotedUrlClose(cssText, i, first);
  }

  return findUnquotedUrlClose(cssText, i);
}

/**
 * Strip the surrounding quotes (if any) and trim whitespace from the
 * raw url-contents slice between `url(` and the matching `)`.
 */
function extractUrlValue(rawContents: string): string {
  const trimmed = rawContents.trim();

  if (trimmed.length >= 2) {
    const first = trimmed.charAt(0);
    const last = trimmed.charAt(trimmed.length - 1);

    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}

/**
 * Replace any `url(...)` reference in `cssText` whose target scheme
 * is not on the safe list with the empty string. Preserves the rest
 * of the declaration so e.g. `background: red url(javascript:…) no-repeat`
 * becomes `background: red  no-repeat` (the property still parses).
 */
export function sanitizeCssUrls(cssText: string): string {
  URL_PREFIX_PATTERN.lastIndex = 0;

  const out: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_PREFIX_PATTERN.exec(cssText)) !== null) {
    const startOfUrl = match.index;
    const afterOpen = startOfUrl + match[0].length;
    const closeIndex = findUrlClose(cssText, afterOpen);

    if (closeIndex === -1) {
      // Malformed — keep the rest of the string verbatim and stop.
      out.push(cssText.slice(cursor));
      cursor = cssText.length;
      break;
    }

    const rawContents = cssText.slice(afterOpen, closeIndex);
    const value = extractUrlValue(rawContents);

    out.push(cssText.slice(cursor, startOfUrl));

    if (isSafeUrl(value)) {
      out.push(cssText.slice(startOfUrl, closeIndex + 1));
    }

    cursor = closeIndex + 1;
    URL_PREFIX_PATTERN.lastIndex = cursor;
  }

  out.push(cssText.slice(cursor));

  return out.join('');
}

/**
 * Convenience wrapper for the inline `style=""` attribute: strips
 * dangerous CSS `url(...)` references while preserving the rest of
 * the declaration text.
 */
export function sanitizeStyleAttribute(styleText: string): string {
  return sanitizeCssUrls(styleText);
}
