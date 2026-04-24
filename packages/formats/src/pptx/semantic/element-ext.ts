import { escapeXmlAttribute, escapeXmlText } from '../ooxml/xml';
import { BROADSET_ELEMENT_EXT_URI, type ElementMetaExtension } from '../types';

/**
 * Per-shape `<p:extLst>` element tagging.
 *
 * Every Broadset element emits a `<p:ext uri="{broadset-element-ext}">…</p:ext>`
 * under its non-visual properties. The extension carries structured
 * per-element semantics that don't fit in the shape name: dataField,
 * visibleWhen, repeater, animations, originalKind, and the dirty flag.
 *
 * OOXML conforming readers (PowerPoint, Keynote, LibreOffice) MUST
 * preserve unknown `<p:ext>` elements verbatim across save — that's the
 * mechanism that makes this pattern durable across round-trips.
 */

const BROADSET_META_NS = 'https://broadset.io/ns/pptx/1.0/';

/**
 * Serialize an {@link ElementMetaExtension} to its wire XML form — a
 * single `<p:ext>` element containing one `<bset:elementMeta>` child
 * with each field rendered as an attribute where possible and as a
 * child element for free-form content (preserved blob).
 */
export function buildElementExt(meta: ElementMetaExtension): string {
  const attrs: string[] = [
    `id="${escapeXmlAttribute(meta.id)}"`,
    `kind="${escapeXmlAttribute(meta.kind)}"`,
    `dirty="${meta.dirty ? '1' : '0'}"`,
  ];

  if (meta.dataField !== undefined && meta.dataField.length > 0) {
    attrs.push(`dataField="${escapeXmlAttribute(meta.dataField)}"`);
  }

  if (meta.visibleWhen !== undefined && meta.visibleWhen.length > 0) {
    attrs.push(`visibleWhen="${escapeXmlAttribute(meta.visibleWhen)}"`);
  }

  if (meta.repeater !== undefined && meta.repeater.length > 0) {
    attrs.push(`repeater="${escapeXmlAttribute(meta.repeater)}"`);
  }

  if (meta.originalKind !== undefined && meta.originalKind !== meta.kind) {
    attrs.push(`originalKind="${escapeXmlAttribute(meta.originalKind)}"`);
  }

  const animationsXml =
    meta.animations !== undefined && meta.animations.length > 0
      ? `<bset:animations>${meta.animations.map((a) => `<bset:ref id="${escapeXmlAttribute(a)}"/>`).join('')}</bset:animations>`
      : '';

  const preservedXml =
    meta.preservedBlob !== undefined && meta.preservedBlob.length > 0
      ? `<bset:preservedBlob>${escapeXmlText(meta.preservedBlob)}</bset:preservedBlob>`
      : '';

  return `<p:ext uri="${BROADSET_ELEMENT_EXT_URI}"><bset:elementMeta xmlns:bset="${BROADSET_META_NS}" ${attrs.join(' ')}>${animationsXml}${preservedXml}</bset:elementMeta></p:ext>`;
}

/**
 * Parse an `<p:ext>` XML body back into an {@link ElementMetaExtension}.
 * Returns `null` for strings that don't contain a broadset-element-ext
 * entry — callers fall back to fingerprint matching.
 *
 * The parser is intentionally permissive about attribute order and
 * unknown attributes so future versions of the metadata schema don't
 * break the importer.
 */
export function parseElementExt(input: string): ElementMetaExtension | null {
  if (!input.includes(BROADSET_ELEMENT_EXT_URI)) return null;

  const id = getAttr(input, 'id');
  const kind = getAttr(input, 'kind');

  if (id === null || kind === null) return null;

  const dirtyValue = getAttr(input, 'dirty') ?? '0';
  const dirty = dirtyValue === '1' || dirtyValue === 'true';

  const dataField = getAttr(input, 'dataField') ?? undefined;
  const visibleWhen = getAttr(input, 'visibleWhen') ?? undefined;
  const repeater = getAttr(input, 'repeater') ?? undefined;
  const originalKind = getAttr(input, 'originalKind') ?? undefined;

  const animations = [...input.matchAll(/<bset:ref\s+id="([^"]*)"\s*\/>/g)].map((m) => m[1] ?? '').filter(Boolean);
  const preservedBlob = extractBetween(input, '<bset:preservedBlob>', '</bset:preservedBlob>') ?? undefined;

  const base: ElementMetaExtension = { id, kind, dirty };

  return {
    ...base,
    ...(dataField ? { dataField } : {}),
    ...(visibleWhen ? { visibleWhen } : {}),
    ...(repeater ? { repeater } : {}),
    ...(originalKind ? { originalKind } : {}),
    ...(animations.length > 0 ? { animations } : {}),
    ...(preservedBlob ? { preservedBlob: decodeXmlEntities(preservedBlob) } : {}),
  };
}

function getAttr(input: string, name: string): string | null {
  const re = new RegExp(`\\b${name}="([^"]*)"`);
  const match = input.match(re);

  if (!match) return null;

  const raw = match[1] ?? '';

  return decodeXmlEntities(raw);
}

function extractBetween(input: string, open: string, close: string): string | null {
  const start = input.indexOf(open);

  if (start < 0) return null;

  const end = input.indexOf(close, start + open.length);

  if (end < 0) return null;

  return input.slice(start + open.length, end);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
