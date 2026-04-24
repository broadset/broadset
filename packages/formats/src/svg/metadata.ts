import { SVG_BROADSET_NAMESPACE } from './types';

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ParsedElementMetadata {
  readonly elementId: string;
  readonly fingerprint: string;
  readonly originalColor?: string | undefined;
  readonly conicGradient?: string | undefined;
}

export interface ParsedDocumentMetadata {
  readonly documentId: string;
  readonly canvasUnit: 'px' | 'mm' | 'in';
  readonly canvasDpi: number;
  readonly elements: readonly ParsedElementMetadata[];
}

/**
 * Parse the document-level `<metadata>` RDF/XML packet a
 * Broadset-exported SVG carries. Returns `null` when the root
 * `<svg>` does not declare the shared Broadset XMP namespace or no
 * recognisable packet is present — that signals the third-party
 * import path per `project/spec/formats/svg.md` (P7.4b).
 *
 * Hardens against malformed packets per IO-D-18: missing canvas
 * attrs fall back to sensible defaults (`px` / 72 dpi); unknown
 * canvas units collapse to `px`; invalid dpi values collapse to 72.
 */
export function parseMetadataPacket(svgDoc: Document): ParsedDocumentMetadata | null {
  const root = svgDoc.documentElement;

  if (root.lookupNamespaceURI('broadset') !== SVG_BROADSET_NAMESPACE) {
    return null;
  }

  const metadataEl = svgDoc.getElementsByTagName('metadata')[0];

  if (metadataEl === undefined) {
    return null;
  }

  const description = metadataEl.getElementsByTagNameNS(RDF_NS, 'Description')[0];

  if (description === undefined) {
    return null;
  }

  const documentId = firstTextByNs(description, 'documentId') ?? '';

  if (documentId === '') {
    return null;
  }

  const canvasUnit = normaliseCanvasUnit(description.getAttributeNS(SVG_BROADSET_NAMESPACE, 'canvasUnit'));
  const canvasDpi = normaliseCanvasDpi(description.getAttributeNS(SVG_BROADSET_NAMESPACE, 'canvasDpi'));
  const elements: ParsedElementMetadata[] = [];
  const items = metadataEl.getElementsByTagNameNS(RDF_NS, 'li');

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (!item) {
      continue;
    }

    const elementId = item.getAttributeNS(SVG_BROADSET_NAMESPACE, 'elementId');
    const fingerprint = item.getAttributeNS(SVG_BROADSET_NAMESPACE, 'fingerprint');

    if (elementId === null || fingerprint === null) {
      continue;
    }

    const originalColor = item.getAttributeNS(SVG_BROADSET_NAMESPACE, 'originalColor');
    const conicGradient = item.getAttributeNS(SVG_BROADSET_NAMESPACE, 'conicGradient');

    elements.push({
      elementId,
      fingerprint,
      ...(originalColor !== null ? { originalColor } : {}),
      ...(conicGradient !== null ? { conicGradient } : {}),
    });
  }

  return { documentId, canvasUnit, canvasDpi, elements };
}

/**
 * Find every element in the SVG tree that carries a `data-bs-id`
 * attribute. Returns a map keyed by the Broadset id — each tagged
 * element hydrates by id lookup in the fast path.
 */
export function collectTaggedElements(svgDoc: Document): ReadonlyMap<string, Element> {
  const map = new Map<string, Element>();
  const all = svgDoc.getElementsByTagName('*');

  for (let i = 0; i < all.length; i++) {
    const el = all[i];

    if (!el) {
      continue;
    }

    const id = el.getAttribute('data-bs-id');

    if (id === null || id === '') {
      continue;
    }

    if (!map.has(id)) {
      map.set(id, el);
    }
  }

  return map;
}

function firstTextByNs(parent: Element, localName: string): string | null {
  const els = parent.getElementsByTagNameNS(SVG_BROADSET_NAMESPACE, localName);
  const el = els[0];

  if (!el) {
    return null;
  }

  return el.textContent;
}

function normaliseCanvasUnit(raw: string | null): 'px' | 'mm' | 'in' {
  // The model's `Canvas.unit` is limited to `'px' | 'mm' | 'in'`.
  // Historically the SVG exporter never writes `'pt'` or `'em'`
  // because those aren't valid model values. If a hand-edited
  // packet smuggles one in, coerce to `'px'` per IO-D-18.
  switch (raw) {
    case 'mm':
    case 'in':
    case 'px':
      return raw;
    default:
      return 'px';
  }
}

function normaliseCanvasDpi(raw: string | null): number {
  if (raw === null) {
    return 72;
  }

  const parsed = Number.parseFloat(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 72;
}

// Re-export to keep the SVG_NS constant available to callers who
// already consume this module's parsing helpers. Not tree-shaken
// away since DOMParser call-sites use it as the root element
// namespace check.
export { SVG_NS };
