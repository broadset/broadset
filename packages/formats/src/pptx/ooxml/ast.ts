import { parseXml } from './xml';

/**
 * Namespace-aware AST navigation over fast-xml-parser's `preserveOrder`
 * output. Replaces the regex hot path in the importer.
 *
 * Shape produced by `parseXml` (with `preserveOrder: true`):
 *
 * ```json
 * [
 *   { "?xml": [{ "#text": "" }], ":@": { "@_version": "1.0" } },
 *   { "p:sld": [...children], ":@": { "@_xmlns:p": "...", "@_xmlns:a": "..." } }
 * ]
 * ```
 *
 * Each node is a single-key object whose key is the qualified tag name
 * (`prefix:local`) or `#text` for character data. The value is the
 * children array. Optional `:@` sibling key carries attributes prefixed
 * with `@_`. We unify everything onto a typed `XmlNode` shape so callers
 * never touch the raw fast-xml-parser arrays.
 */

/** OOXML / DrawingML / Presentation namespace URIs we resolve to canonical prefixes. */
export const OOXML_NS = {
  drawingml: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  presentationml: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  relationships: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  contentTypes: 'http://schemas.openxmlformats.org/package/2006/content-types',
  packageRelationships: 'http://schemas.openxmlformats.org/package/2006/relationships',
  compatibility: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
} as const;

/** Canonical prefix → namespace URI. The importer matches by URI, not prefix. */
export const CANONICAL_PREFIX_TO_NS: Readonly<Record<string, string>> = {
  a: OOXML_NS.drawingml,
  p: OOXML_NS.presentationml,
  r: OOXML_NS.relationships,
  mc: OOXML_NS.compatibility,
};

/**
 * Typed AST node. Element nodes carry a qualified-name `qname` (the raw
 * `prefix:local` string from the source), a resolved `ns` URI from the
 * scoped namespace bindings, a `local` part, an `attrs` map keyed by
 * unprefixed attribute name (the canonical OOXML pattern — readers
 * don't care about attribute namespaces), and `children`. Text nodes
 * carry only `text`.
 */
export interface XmlElement {
  readonly kind: 'element';
  readonly qname: string;
  readonly local: string;
  readonly ns: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}

export interface XmlText {
  readonly kind: 'text';
  readonly text: string;
}

export type XmlNode = XmlElement | XmlText;

/**
 * Parse and normalise an OOXML XML string into a list of typed root
 * children. The XML declaration (`<?xml …?>`) is filtered out; what
 * comes back is the document element list (usually one element).
 */
export function parseOoxml(input: string): readonly XmlNode[] {
  const raw = parseXml(input);

  if (!Array.isArray(raw)) return [];

  const initial: NamespaceBindings = { ...CANONICAL_PREFIX_TO_NS };
  const out: XmlNode[] = [];

  for (const node of raw) {
    const normalized = normaliseRaw(node, initial);

    if (normalized !== null) out.push(normalized);
  }

  return out;
}

interface NamespaceBindings {
  readonly [prefix: string]: string;
}

function normaliseRaw(raw: unknown, parentBindings: NamespaceBindings): XmlNode | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const node = raw as Record<string, unknown>;
  const keys = Object.keys(node).filter((k) => k !== ':@');

  if (keys.length === 0) return null;

  const qname = keys[0];

  if (qname === undefined) return null;

  const value = node[qname];

  if (qname === '#text') {
    return { kind: 'text', text: typeof value === 'string' ? value : '' };
  }

  // Skip `<?xml … ?>` and processing instructions.
  if (qname.startsWith('?')) return null;

  const rawAttrs = (node[':@'] as Record<string, unknown> | undefined) ?? {};
  const bindings = mergeNamespaceBindings(parentBindings, rawAttrs);
  const { prefix, local } = splitQName(qname);
  const ns = bindings[prefix] ?? '';
  const attrs = collectAttributes(rawAttrs);
  const childrenRaw = Array.isArray(value) ? value : [];
  const children: XmlNode[] = [];

  for (const child of childrenRaw) {
    const c = normaliseRaw(child, bindings);

    if (c !== null) children.push(c);
  }

  return { kind: 'element', qname, local, ns, attrs, children };
}

function splitQName(qname: string): { prefix: string; local: string } {
  const colon = qname.indexOf(':');

  if (colon < 0) return { prefix: '', local: qname };

  return { prefix: qname.slice(0, colon), local: qname.slice(colon + 1) };
}

function mergeNamespaceBindings(
  parent: NamespaceBindings,
  rawAttrs: Record<string, unknown>,
): NamespaceBindings {
  let next: Record<string, string> | null = null;

  for (const [key, value] of Object.entries(rawAttrs)) {
    if (typeof value !== 'string') continue;

    if (key === '@_xmlns') {
      next ??= { ...parent };
      next[''] = value;
    } else if (key.startsWith('@_xmlns:')) {
      next ??= { ...parent };
      next[key.slice('@_xmlns:'.length)] = value;
    }
  }

  return next ?? parent;
}

function collectAttributes(rawAttrs: Record<string, unknown>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(rawAttrs)) {
    if (!key.startsWith('@_')) continue;
    if (typeof value !== 'string') continue;

    const stripped = key.slice('@_'.length);

    // Preserve the prefixed form (e.g. `r:id`) so `serializeNode`
    // round-trips losslessly. Callers read attributes via `getAttr`
    // which normalises lookup by local name, so consumers don't have
    // to know whether the source had a prefix or not.
    //
    // `xmlns` / `xmlns:*` declarations stay in the attrs map too — they
    // are real XML attributes that must survive serialisation, even
    // though `mergeNamespaceBindings` (above) reads them separately
    // for prefix-resolution.
    out[stripped] = value;
  }

  return out;
}

/**
 * Find the first child element whose namespace+localName matches the
 * canonical prefix:local. Matches by namespace URI under the hood, so
 * `findChild(node, 'a:off')` finds `<a:off>`, `<dml:off>`, etc. as long
 * as the prefix maps to the DrawingML URI.
 */
export function findChild(node: XmlElement, qname: string): XmlElement | null {
  const target = resolveCanonical(qname);

  for (const child of node.children) {
    if (child.kind === 'element' && child.local === target.local && child.ns === target.ns) {
      return child;
    }
  }

  return null;
}

/**
 * Find the first child element by explicit namespace URI + local name.
 * Useful for non-OOXML namespaces where the canonical prefix table
 * doesn't apply (interop ledger, custom-xml, broadset metadata).
 */
export function findChildByNs(node: XmlElement, ns: string, local: string): XmlElement | null {
  for (const child of node.children) {
    if (child.kind === 'element' && child.local === local && child.ns === ns) {
      return child;
    }
  }

  return null;
}

/** Multi-result variant of {@link findChildByNs}. */
export function findChildrenByNs(node: XmlElement, ns: string, local: string): readonly XmlElement[] {
  const out: XmlElement[] = [];

  for (const child of node.children) {
    if (child.kind === 'element' && child.local === local && child.ns === ns) {
      out.push(child);
    }
  }

  return out;
}

/**
 * Find every direct child matching the canonical prefix:local. Order
 * is preserved.
 */
export function findChildren(node: XmlElement, qname: string): readonly XmlElement[] {
  const target = resolveCanonical(qname);
  const out: XmlElement[] = [];

  for (const child of node.children) {
    if (child.kind === 'element' && child.local === target.local && child.ns === target.ns) {
      out.push(child);
    }
  }

  return out;
}

/**
 * Recursively find the first descendant element matching the
 * canonical prefix:local. Useful for "somewhere in this subtree" reads
 * where the depth is variable (e.g. `<a:effectLst>` inside `<p:spPr>`
 * vs inside `<p:txBody>` per-run).
 */
export function findDescendant(node: XmlElement, qname: string): XmlElement | null {
  const target = resolveCanonical(qname);

  for (const child of node.children) {
    if (child.kind !== 'element') continue;
    if (child.local === target.local && child.ns === target.ns) return child;

    const inner = findDescendant(child, qname);

    if (inner !== null) return inner;
  }

  return null;
}

/**
 * Recursively collect every descendant element matching the canonical
 * prefix:local, in document order.
 */
export function findDescendants(node: XmlElement, qname: string): readonly XmlElement[] {
  const target = resolveCanonical(qname);
  const out: XmlElement[] = [];

  collectDescendants(node, target, out);

  return out;
}

function collectDescendants(
  node: XmlElement,
  target: { readonly local: string; readonly ns: string },
  out: XmlElement[],
): void {
  for (const child of node.children) {
    if (child.kind !== 'element') continue;
    if (child.local === target.local && child.ns === target.ns) out.push(child);
    collectDescendants(child, target, out);
  }
}

/**
 * Read an attribute value by local name. Returns `undefined` when
 * absent. Tolerant of namespace prefixes — `getAttr(node, 'id')`
 * matches both `id="…"` and `r:id="…"` so callers never have to
 * branch on whether the source prefixed its attributes.
 */
export function getAttr(node: XmlElement, name: string): string | undefined {
  const direct = node.attrs[name];

  if (direct !== undefined) return direct;

  // Fallback to prefixed form: any attr key whose local part matches.
  for (const [key, value] of Object.entries(node.attrs)) {
    const colon = key.indexOf(':');

    if (colon >= 0 && key.slice(colon + 1) === name) return value;
  }

  return undefined;
}

/**
 * Concatenate the text content of every descendant text node, in
 * document order. Mirrors the DOM `textContent` semantics so callers
 * can pull `<a:t>` text without walking children manually.
 */
export function getText(node: XmlElement): string {
  let out = '';

  for (const child of node.children) {
    if (child.kind === 'text') out += child.text;
    else out += getText(child);
  }

  return out;
}

/**
 * Pretty-print a node back to a serialised XML string. Used by
 * importers that need to round-trip an unrecognised subtree as a raw
 * blob (the IO-D-18 preservation path).
 */
export function serializeNode(node: XmlNode): string {
  if (node.kind === 'text') return escapeText(node.text);

  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');
  const children = node.children.map((c) => serializeNode(c)).join('');

  return children.length === 0 ? `<${node.qname}${attrs}/>` : `<${node.qname}${attrs}>${children}</${node.qname}>`;
}

function escapeText(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(input: string): string {
  return escapeText(input).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Resolve a canonical `prefix:local` string to its namespace URI +
 * local-name pair. The canonical prefix table covers OOXML's well-known
 * prefixes (`a:`, `p:`, `r:`, `mc:`); anything else is treated as
 * namespace-less (matches only un-prefixed elements).
 */
function resolveCanonical(qname: string): { local: string; ns: string } {
  const colon = qname.indexOf(':');

  if (colon < 0) return { local: qname, ns: '' };

  const prefix = qname.slice(0, colon);
  const local = qname.slice(colon + 1);
  const ns = CANONICAL_PREFIX_TO_NS[prefix] ?? '';

  return { local, ns };
}

/** Convenience: the document's first element node, or `null` if the input was empty / declaration-only. */
export function rootElement(nodes: readonly XmlNode[]): XmlElement | null {
  for (const n of nodes) {
    if (n.kind === 'element') return n;
  }

  return null;
}
