import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createEmptyBroadsetDocument,
  createPageElementInstanceForElement,
} from '@broadset/model';

import type { BroadsetXmpElementEntry, BroadsetXmpPdfAIdentifier } from '../../_shared/xmp';
import type { MarkedContentKind, MarkedContentTag } from '../types';

/**
 * Optional PDF/A round-trip surface. When present on the document
 * `extensions.pdf.pdfa` block, the next export pass can re-emit the
 * `pdfaid:` identifier without the user having to re-opt-in.
 */
interface FastPathHydrationOptions {
  readonly pdfa?: BroadsetXmpPdfAIdentifier | undefined;
  /**
   * XMP `broadset:elements` payload entries keyed by element id.
   * When the importer can parse the payload as a full
   * `BroadsetElement` JSON snapshot, the fast path uses it verbatim
   * — recovering geometry, style, content, and any extensions the
   * placeholder-only path drops. Missing or malformed payloads fall
   * back to `createDefaultElement` so the import still produces a
   * usable document.
   */
  readonly xmpEntries?: readonly BroadsetXmpElementEntry[];
}

/**
 * Hydrate a `BroadsetDocument` from a recovered XMP document id plus the
 * per-element marked-content tags collected from the PDF. This is the
 * fast-path invoked when a Broadset-exported PDF is re-imported.
 *
 * When the XMP packet carries a per-element JSON payload (the export
 * pipeline writes one for every element), the importer rehydrates the
 * full element verbatim — geometry, style, and extensions all
 * survive. When no payload is present (older exports, or a third-party
 * tool that scrubbed the broadset:payload field), the importer falls
 * back to `createDefaultElement` placeholder geometry.
 */
export function hydrateDocumentFromFastPath(
  documentId: string,
  tags: readonly MarkedContentTag[],
  options: FastPathHydrationOptions = {},
): BroadsetDocument {
  const empty = createEmptyBroadsetDocument();
  const payloadById = new Map<string, string>();

  for (const entry of options.xmpEntries ?? []) {
    if (entry.payload !== undefined) payloadById.set(entry.id, entry.payload);
  }

  const elements: BroadsetElement[] = tags.map((tag, index) => hydrateElement(tag, index, payloadById.get(tag.id)));

  const documentExtensions =
    options.pdfa !== undefined ?
      {
        pdf: {
          pdfa: { part: options.pdfa.part, conformance: options.pdfa.conformance },
        },
      }
    : undefined;

  const rootInstances = elements.filter((el) => el.parentId === null).map(createPageElementInstanceForElement);
  const pages = empty.pages.map((page, index) => (index === 0 ? { ...page, elements: rootInstances } : page));

  return {
    ...empty,
    id: documentId,
    elements,
    pages,
    ...(documentExtensions !== undefined ? { extensions: documentExtensions } : {}),
  };
}

/**
 * Hydrate one element from its marked-content tag, preferring the
 * XMP payload (full snapshot) when present and parseable. Falls back
 * to `createDefaultElement` placeholder geometry otherwise.
 */
function hydrateElement(tag: MarkedContentTag, index: number, payload: string | undefined): BroadsetElement {
  const fromPayload = payload === undefined ? null : tryParseElementPayload(payload, tag);

  if (fromPayload !== null) {
    return mergePdfExtensions(fromPayload, tag);
  }

  return createDefaultElement(elementTypeForKind(tag.kind), {
    id: tag.id,
    name: `Element ${String(index + 1)}`,
    ...(tag.dataField !== undefined ?
      {
        dataField: {
          fieldName: tag.dataField,
          overflow: 'clip',
        },
      }
    : {}),
    extensions: pdfExtensions(tag),
  });
}

/**
 * Attempt to parse a `BroadsetXmpElementEntry.payload` as a
 * `BroadsetElement` JSON snapshot. Returns `null` when the payload
 * isn't valid JSON, isn't an object, or carries an `id` / `type` that
 * disagrees with the marked-content tag — corrupt payloads fall
 * through to placeholder hydration so import never crashes.
 */
function tryParseElementPayload(payload: string, tag: MarkedContentTag): BroadsetElement | null {
  try {
    const parsed = JSON.parse(payload) as unknown;

    if (!isElementShape(parsed)) return null;

    if (parsed.id !== tag.id) return null;

    return parsed;
  } catch {
    return null;
  }
}

function isElementShape(value: unknown): value is BroadsetElement {
  return value !== null && typeof value === 'object' && 'id' in value && 'type' in value && 'style' in value;
}

/**
 * Merge the marked-content tag's PDF-specific extensions
 * (`dirty`, `preservationBlob`, `source`) onto the parsed payload's
 * extensions block so the importer's contract is preserved even when
 * the payload predates the dirty-flag work.
 */
function mergePdfExtensions(element: BroadsetElement, tag: MarkedContentTag): BroadsetElement {
  const existingExtensions = (element.extensions as Record<string, unknown> | undefined) ?? {};
  const existingPdf = (existingExtensions['pdf'] as Record<string, unknown> | undefined) ?? {};

  return {
    ...element,
    extensions: {
      ...existingExtensions,
      pdf: {
        ...existingPdf,
        ...pdfExtensions(tag).pdf,
      },
    },
  };
}

function pdfExtensions(tag: MarkedContentTag): { readonly pdf: Record<string, unknown> } {
  return {
    pdf: {
      dirty: tag.dirty,
      ...(tag.preservationBlob !== undefined ? { preservationBlob: tag.preservationBlob } : {}),
      // P6.4a marker — lets the editor's dirty-flag middleware
      // distinguish Broadset-native creations from imports so
      // subsequent edits flip the flag to `true` and the exporter
      // re-synthesises them instead of re-emitting a stale blob.
      source: 'pdf-import-fast-path',
    },
  };
}

function elementTypeForKind(kind: MarkedContentKind): BroadsetElement['type'] {
  // `MarkedContentKind` is a subset of `BroadsetElement['type']` (they
  // mirror one-to-one per `pdf/types.ts`), but TypeScript cannot narrow
  // across the two unions in one step without assignment assertions.
  // The switch statement is exhaustive over `MarkedContentKind` and
  // returns string-literal types the compiler narrows cleanly.
  switch (kind) {
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'svg':
      return 'svg';
    case 'path':
      return 'path';
    case 'rectangle':
      return 'rectangle';
    case 'ellipse':
      return 'ellipse';
    case 'qrcode':
      return 'qrcode';
    case 'group':
      return 'group';
    case 'video':
      return 'video';
    case 'clock':
      return 'clock';
    case 'ticker':
      return 'ticker';
  }
}
