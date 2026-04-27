import DOMPurify from 'dompurify';

/**
 * Phase 2 `_shared/sanitize/` — wraps DOMPurify with a Broadset-
 * specific SVG sanitization policy. Used by the SVG importer, the
 * `svg`-type element re-render path, and anywhere foreign markup
 * enters the store. Guarantees that no inline script, event handler,
 * `javascript:` URL, foreign object, or unknown namespace reaches the
 * renderer — per the importer security contract in
 * `project/spec/formats/spec.md`.
 */

/**
 * Structured, renderer-consumable view of the sanitized SVG fragment.
 * Carries the cleaned markup string (safe to assign to `innerHTML` or
 * parse into a DOM) plus the raw sanitized root element so native
 * renderers can walk the tree without re-parsing.
 */
export interface SvgFragmentAst {
  /** Sanitized SVG markup, safe to re-emit verbatim. */
  readonly markup: string;
  /** Parsed root element for renderer consumption. `null` when the markup was empty. */
  readonly root: Element | null;
}

export interface SvgSanitizationRemoval {
  readonly kind: 'element' | 'attribute';
  readonly name: string;
  readonly from?: string | undefined;
}

export interface SvgSanitizationReport {
  readonly removed: readonly SvgSanitizationRemoval[];
  readonly empty: boolean;
}

export interface SvgSanitizationResult {
  readonly ast: SvgFragmentAst;
  readonly report: SvgSanitizationReport;
}

const SVG_XMLNS = 'http://www.w3.org/2000/svg';

/**
 * DOMPurify configuration for Broadset SVG imports. Follows the SVG
 * profile plus explicit forbidden tags / attributes per the importer
 * security contract (no execution surface reaches the renderer).
 */
const FORBIDDEN_TAGS: readonly string[] = ['script', 'foreignObject'];
const FORBIDDEN_ATTRS: readonly string[] = ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur'];

const BROADSET_SVG_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: [...FORBIDDEN_TAGS],
  FORBID_ATTR: [...FORBIDDEN_ATTRS],
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: false,
  WHOLE_DOCUMENT: false,
  RETURN_DOM_FRAGMENT: false as const,
};

function wrapIfFragment(input: string): { readonly wrapped: string; readonly isFragment: boolean } {
  return /<\s*svg\b/i.test(input) ?
      { wrapped: input, isFragment: false }
    : { wrapped: `<svg xmlns="${SVG_XMLNS}">${input}</svg>`, isFragment: true };
}

function unwrapFragmentMarkup(sanitized: string, isFragment: boolean): string {
  if (!isFragment) return sanitized;

  const openMatch = sanitized.match(/<\s*svg\b[^>]*>/i);
  const closeMatch = sanitized.match(/<\/\s*svg\s*>/i);

  if (openMatch === null || closeMatch === null || openMatch.index === undefined || closeMatch.index === undefined) {
    return sanitized;
  }

  const openEnd = openMatch.index + openMatch[0].length;

  return sanitized.slice(openEnd, closeMatch.index);
}

/**
 * Sanitizes an SVG markup string against the Broadset policy.
 *
 * - Strips `<script>`, `<foreignObject>`, inline event-handler
 *   attributes, `data-*` attributes, and `javascript:` URLs.
 * - Returns an empty report + null root when the input is empty or
 *   whitespace-only.
 * - Never throws — malformed markup produces an empty result so the
 *   caller preserves the document per IO-D-18 (no silent drops).
 *
 * Accepts both full `<svg>` documents and bare fragments (e.g.
 * `<rect/>`); fragments are wrapped in a synthetic `<svg>` root for
 * sanitization and unwrapped from the output.
 */
export function sanitizeSvg(input: string): SvgSanitizationResult {
  const trimmed = input.trim();

  if (trimmed === '') {
    return {
      ast: { markup: '', root: null },
      report: { removed: [], empty: true },
    };
  }

  const { wrapped, isFragment } = wrapIfFragment(trimmed);
  const sanitizedWrapped = DOMPurify.sanitize(wrapped, BROADSET_SVG_CONFIG);
  const removed = collectRemovals();
  const markup = unwrapFragmentMarkup(sanitizedWrapped, isFragment);

  if (markup.trim() === '') {
    return {
      ast: { markup: '', root: null },
      report: { removed, empty: true },
    };
  }

  return {
    ast: { markup, root: parseSvgRoot(isFragment ? sanitizedWrapped : markup) },
    report: { removed, empty: false },
  };
}

interface DomPurifyRemoval {
  readonly element?: Node;
  readonly attribute?: Attr;
  readonly from?: Node;
}

function collectRemovals(): readonly SvgSanitizationRemoval[] {
  const entries = DOMPurify.removed as readonly DomPurifyRemoval[];
  const removals: SvgSanitizationRemoval[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (entry.element !== undefined) {
      const name = (entry.element as Element).nodeName.toLowerCase();
      const key = `element:${name}`;

      if (!seen.has(key)) {
        seen.add(key);
        removals.push({ kind: 'element', name });
      }
    } else if (entry.attribute !== undefined) {
      const name = entry.attribute.name.toLowerCase();
      const from = entry.from !== undefined ? (entry.from as Element).nodeName.toLowerCase() : undefined;
      const key = `attribute:${name}:${from ?? ''}`;

      if (!seen.has(key)) {
        seen.add(key);
        removals.push({ kind: 'attribute', name, from });
      }
    }
  }

  return removals;
}

function parseSvgRoot(markup: string): Element | null {
  try {
    const parser = new DOMParser();
    const source = /<\s*svg\b/i.test(markup) ? markup : `<svg xmlns="${SVG_XMLNS}">${markup}</svg>`;
    const doc = parser.parseFromString(source, 'image/svg+xml');
    const root = doc.documentElement;

    return root.getElementsByTagName('parsererror').length === 0 ? root : null;
  } catch {
    return null;
  }
}
