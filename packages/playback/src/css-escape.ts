// ---------------------------------------------------------------------------
// CSS identifier escaping for safe use in attribute selectors
// ---------------------------------------------------------------------------

const CSS_ESCAPE_RE = /["\\]/g;

/**
 * Escape an element ID for safe use in CSS attribute selectors.
 *
 * Backslash-escapes characters that are special in CSS selectors
 * (double quotes and backslashes). Simple alphanumeric IDs and
 * UUIDs pass through unchanged.
 */
export function escapeCssId(id: string): string {
  return id.replace(CSS_ESCAPE_RE, '\\$&');
}
