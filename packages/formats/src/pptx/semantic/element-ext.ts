import { findChildByNs, findChildrenByNs, getAttr, getText, parseOoxml, rootElement, type XmlElement } from '../ooxml/ast';
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

const BROADSET_META_NS_URI = BROADSET_META_NS;

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

  const meta = locateElementMetaNode(input);

  if (meta === null) return null;

  return buildExtensionFromMeta(meta);
}

/**
 * Wrap the raw fragment so fast-xml-parser sees a single root, then
 * walk down to the broadset `elementMeta` node. Returns `null` when
 * the fragment doesn't carry a broadset metadata extension.
 */
function locateElementMetaNode(input: string): XmlElement | null {
  const wrapped = `<root xmlns:p="${PRESENTATIONML_NS}">${input}</root>`;
  const root = rootElement(parseOoxml(wrapped));

  if (root === null) return null;

  const ext = findFirstBroadsetExt(root);

  if (ext === null) return null;

  return findChildByNs(ext, BROADSET_META_NS_URI, 'elementMeta');
}

/**
 * Translate an `<bset:elementMeta>` node into the typed extension
 * shape. Required `id` + `kind` attributes are validated; optional
 * fields are folded in only when non-empty so the round-trip
 * idempotency test stays clean.
 */
function buildExtensionFromMeta(meta: XmlElement): ElementMetaExtension | null {
  const id = getAttr(meta, 'id');
  const kind = getAttr(meta, 'kind');

  if (id === undefined || kind === undefined) return null;

  const dirtyValue = getAttr(meta, 'dirty') ?? '0';
  const dirty = dirtyValue === '1' || dirtyValue === 'true';
  const animations = readAnimationRefs(meta);
  const preservedBlobNode = findChildByNs(meta, BROADSET_META_NS_URI, 'preservedBlob');
  const preservedBlob = preservedBlobNode !== null ? getText(preservedBlobNode) : undefined;

  const base: ElementMetaExtension = { id, kind, dirty };
  const optional = readOptionalStringAttrs(meta);

  return {
    ...base,
    ...optional,
    ...(animations.length > 0 ? { animations } : {}),
    ...(preservedBlob !== undefined && preservedBlob.length > 0 ? { preservedBlob } : {}),
  };
}

function readAnimationRefs(meta: XmlElement): readonly string[] {
  const animationsNode = findChildByNs(meta, BROADSET_META_NS_URI, 'animations');

  if (animationsNode === null) return [];

  return findChildrenByNs(animationsNode, BROADSET_META_NS_URI, 'ref')
    .map((r) => getAttr(r, 'id') ?? '')
    .filter((s) => s.length > 0);
}

function readOptionalStringAttrs(meta: XmlElement): {
  readonly dataField?: string;
  readonly visibleWhen?: string;
  readonly repeater?: string;
  readonly originalKind?: string;
} {
  const out: { dataField?: string; visibleWhen?: string; repeater?: string; originalKind?: string } = {};
  const fields: readonly (keyof typeof out)[] = ['dataField', 'visibleWhen', 'repeater', 'originalKind'];

  for (const field of fields) {
    const v = getAttr(meta, field);

    if (v !== undefined && v.length > 0) out[field] = v;
  }

  return out;
}

const PRESENTATIONML_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';

/**
 * Recursively find the first `<p:ext>` (presentationML namespace)
 * whose `uri` attribute matches the broadset-element-ext URI. The
 * metadata is always nested under `<p:ext uri="…">` per OOXML
 * extension conventions.
 */
function findFirstBroadsetExt(node: XmlElement): XmlElement | null {
  for (const child of node.children) {
    if (child.kind !== 'element') continue;

    if (child.local === 'ext' && child.ns === PRESENTATIONML_NS) {
      const uri = getAttr(child, 'uri');

      if (uri === BROADSET_ELEMENT_EXT_URI) return child;
    }

    const inner = findFirstBroadsetExt(child);

    if (inner !== null) return inner;
  }

  return null;
}
