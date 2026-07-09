import { type BroadsetDocument, type BroadsetElement, createEmptyBroadsetDocument } from '@broadset/model';
import { readPsd } from 'ag-psd';

import { reconcile, type ReconcileResult } from '../_shared/reconcile';
import type { BroadsetXmpElementEntry } from '../_shared/xmp';
import { readDocumentXmpPacket } from './import-xmp';

/**
 * Phase 5 P5.5 — PSD reconciliation. Wraps `_shared/reconcile` to
 * produce a four-bucket diff between the preserved Broadset metadata
 * (hydrated from the XMP packet on re-import, see P5.4a) and the
 * current visual layer tree (what Photoshop wrote to the PSD).
 *
 * Dirty-flag discipline: `extensions.psd.dirty === false` elements
 * that round-trip byte-identical stay out of `modifications`. When
 * Photoshop edits an element the flag flips to `true` on re-import
 * via the editor middleware; those edits land as modifications.
 */

interface PsdReconcileInput {
  readonly preserved: BroadsetDocument;
  readonly current: BroadsetDocument;
  /**
   * Fingerprint map keyed by element id across both populations. The
   * caller computes these via `_shared/fingerprint/fingerprintElement`
   * (async) or a sync fallback — `reconcile` doesn't care which, it
   * only needs stable comparable strings.
   */
  readonly fingerprintsByElementId: ReadonlyMap<string, string>;
}

export function reconcilePsd(input: PsdReconcileInput): ReconcileResult {
  return reconcile({
    preservedMetadata: { elements: input.preserved.elements.map(normaliseForReconcile) },
    currentVisual: { elements: input.current.elements.map(normaliseForReconcile) },
    fingerprintsByElementId: input.fingerprintsByElementId,
  });
}

/**
 * Strip the `extensions.psd` bookkeeping (`dirty`, `roundTrip`)
 * before reconciling. The flags are import-side state — present after
 * `importPsdDocument` hydrates an element, absent on elements parsed
 * from the preserved XMP payload — so diffing them surfaces false
 * `modifications` that obscure the actual external edits the user
 * made in Photoshop. Mirrors the SVG `normaliseForReconcile`
 * strategy in `svg/roundtrip.ts`.
 */
function normaliseForReconcile(el: BroadsetElement): BroadsetElement {
  // The model declares `extensions` as non-nullable, but several
  // older test fixtures cast through `as BroadsetElement` and omit
  // the field — so we treat the value as possibly-undefined at the
  // boundary to keep the destructure safe.
  const source = el.extensions as ({ psd?: unknown } & Record<string, unknown>) | undefined;
  const { psd: _psd, ...restExtensions } = source ?? {};

  return { ...el, extensions: restExtensions };
}

/**
 * Returns the element ids whose `extensions.psd.dirty === true`, i.e.
 * edits the user or an external tool made after import. The exporter
 * re-synthesises these from current Broadset state and emits the
 * preserved original blob for the remainder.
 */
export function dirtyElementIds(doc: BroadsetDocument): readonly string[] {
  const out: string[] = [];

  for (const el of doc.elements) {
    if (isDirty(el)) out.push(el.id);
  }

  return out;
}

function isDirty(element: BroadsetElement): boolean {
  const psd = (element.extensions as { readonly psd?: { readonly dirty?: unknown } } | undefined)?.psd;

  if (psd === undefined) return false;

  return psd.dirty === true;
}

/**
 * Hydrate the preserved Broadset document a Broadset-exported PSD
 * carries in its XMP packet. Mirrors `readPreservedPptxDocument` so
 * cross-format reconciliation wiring can ask each format the same
 * question — "do you have a preserved snapshot to diff against?" —
 * without reaching into format-specific internals.
 *
 * Returns `null` when the byte stream is not a recognisable PSD,
 * carries no XMP packet, or carries a packet whose `elements[]` lack
 * the JSON `payload` reconciliation depends on (older Broadset
 * exports, third-party PSDs, or aggressive metadata-strip tools).
 */
export function readPreservedPsdDocument(data: Uint8Array): BroadsetDocument | null {
  let parsed: { readonly imageResources?: { readonly xmpMetadata?: string } };

  try {
    parsed = readPsd(data.buffer as ArrayBuffer, {
      skipCompositeImageData: true,
      skipThumbnail: true,
      // Skip pixel-image data entirely — we only need the
      // image-resources block for the XMP packet, not the layer
      // bitmaps. Saves the heavy decode pass on the reconciliation
      // probe path.
      useImageData: false,
    });
  } catch {
    return null;
  }

  const packet = readDocumentXmpPacket(parsed);

  if (packet === null) return null;

  const elements: BroadsetElement[] = [];

  for (const entry of packet.elements) {
    const element = tryParseElementPayload(entry);

    if (element !== null) elements.push(element);
  }

  if (elements.length === 0) return null;

  const empty = createEmptyBroadsetDocument();

  return { ...empty, id: packet.documentId, elements };
}

/**
 * Best-effort parse of an XMP element entry's JSON payload into a
 * `BroadsetElement`. Returns `null` when the payload is absent,
 * unparseable, or carries a mismatching `id` — corrupt payloads fall
 * through so reconciliation never crashes on a tampered packet.
 */
function tryParseElementPayload(entry: BroadsetXmpElementEntry): BroadsetElement | null {
  if (entry.payload === undefined) return null;

  try {
    const value = JSON.parse(entry.payload) as unknown;

    if (value === null || typeof value !== 'object') return null;
    if (!('id' in value) || !('type' in value) || !('style' in value)) return null;
    if ((value as { id: unknown }).id !== entry.id) return null;

    return value as BroadsetElement;
  } catch {
    return null;
  }
}
