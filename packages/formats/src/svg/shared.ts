/**
 * URL scheme allowlist for image/pattern hrefs emitted on export.
 * Symmetric to the importer's `javascript:` / `data:text/html`
 * stripping: a malicious or compromised `assetResolver` cannot
 * produce viewer-exploit SVG by returning `javascript:alert(1)` or
 * an HTML-bearing data URI as the resolved href.
 *
 * Allowed: empty string, relative paths (`/`, `./`, `../`, no-scheme),
 * `http`, `https`, `data:image/*`, fragment refs (`#…`).
 * Rejected: every other scheme — `javascript:`, `vbscript:`,
 * `file:`, `data:text/html`, `data:application/*`, etc.
 */
export function isAllowedImageUrlScheme(url: string): boolean {
  if (url === '' || url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
    return true;
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);

  if (schemeMatch === null) {
    return true;
  }

  const scheme = (schemeMatch[1] ?? '').toLowerCase();

  if (scheme === 'http' || scheme === 'https') {
    return true;
  }

  if (scheme === 'data') {
    return /^data:image\//i.test(url);
  }

  return false;
}
