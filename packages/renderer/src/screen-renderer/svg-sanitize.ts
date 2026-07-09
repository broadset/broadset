/**
 * Parses and sanitizes untrusted SVG content for safe DOM injection.
 *
 * The renderer mounts user/import-provided SVG markup into the live document;
 * without sanitization, a hostile SVG payload could execute JavaScript via
 * `<script>`, `<foreignObject>` script islands, `onload`/`onerror` handlers,
 * or `javascript:` / `data:` URIs on href attributes. This module parses the
 * source with `DOMParser`, walks the resulting tree, and drops or rewrites
 * anything that could introduce script execution.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const BLOCKED_ELEMENT_NAMES: ReadonlySet<string> = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'animate',
  'animatetransform',
  'animatemotion',
  'set',
  'handler',
  'listener',
]);

const URL_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set(['href', 'xlink:href', 'src', 'from', 'to', 'values', 'by']);

// Allow only safe, non-scriptable URL schemes when an attribute references a URL.
const SAFE_URL_SCHEME_RE = /^(?:https?:|mailto:|tel:|#|\/)/iu;

// Allow inline raster and vector image data URIs (no scriptable MIME types).
const SAFE_DATA_URI_RE = /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);/iu;

function isEventHandlerAttribute(name: string): boolean {
  return name.length > 2 && name.startsWith('on');
}

function sanitizeUrlAttributeValue(rawValue: string): string | null {
  const value = rawValue.trim();

  if (value === '') {
    return '';
  }

  if (SAFE_URL_SCHEME_RE.test(value) || SAFE_DATA_URI_RE.test(value)) {
    return value;
  }

  return null;
}

function sanitizeElement(element: Element): void {
  for (const attribute of snapshotAttributes(element)) {
    const name = attribute.name.toLowerCase();

    if (isEventHandlerAttribute(name)) {
      element.removeAttribute(attribute.name);

      continue;
    }

    if (URL_ATTRIBUTE_NAMES.has(name)) {
      const sanitized = sanitizeUrlAttributeValue(attribute.value);

      if (sanitized === null) {
        element.removeAttribute(attribute.name);
      } else if (sanitized !== attribute.value) {
        element.setAttribute(attribute.name, sanitized);
      }
    }
  }

  for (const child of snapshotChildren(element)) {
    if (BLOCKED_ELEMENT_NAMES.has(child.tagName.toLowerCase())) {
      child.remove();

      continue;
    }

    sanitizeElement(child);
  }
}

function snapshotAttributes(element: Element): readonly Attr[] {
  const attributes: Attr[] = [];

  for (let index = 0; index < element.attributes.length; index += 1) {
    const attribute = element.attributes.item(index);

    if (attribute !== null) attributes.push(attribute);
  }

  return attributes;
}

function snapshotChildren(element: Element): readonly Element[] {
  const children: Element[] = [];

  for (let index = 0; index < element.children.length; index += 1) {
    const child = element.children.item(index);

    if (child !== null) children.push(child);
  }

  return children;
}

/**
 * Parses an untrusted SVG markup string and returns a sanitized `<svg>`
 * element suitable for direct DOM insertion. Returns `null` when the input is
 * not a well-formed SVG document or contains no `<svg>` root.
 */
export function parseSanitizedSvg(rawSvgMarkup: string): SVGElement | null {
  if (rawSvgMarkup.trim() === '') {
    return null;
  }

  const parser = new DOMParser();
  const document_ = parser.parseFromString(rawSvgMarkup, 'image/svg+xml');

  if (document_.getElementsByTagName('parsererror').length > 0) {
    return null;
  }

  const root = document_.documentElement;

  if (root.namespaceURI !== SVG_NAMESPACE || root.tagName.toLowerCase() !== 'svg') {
    return null;
  }

  sanitizeElement(root);

  if (!(root instanceof SVGElement)) {
    return null;
  }

  return root;
}

/**
 * Replaces the children of `host` with the sanitized contents of `rawSvgMarkup`.
 * If the input cannot be parsed as SVG, `host` is cleared.
 */
export function renderSanitizedSvgInto(host: HTMLElement, rawSvgMarkup: string): SVGElement | null {
  const sanitizedRoot = parseSanitizedSvg(rawSvgMarkup);

  if (sanitizedRoot === null) {
    host.replaceChildren();

    return null;
  }

  host.replaceChildren(sanitizedRoot);

  return sanitizedRoot;
}
