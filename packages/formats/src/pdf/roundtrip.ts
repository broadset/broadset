import { type BroadsetDocument, type BroadsetElement, createEmptyBroadsetDocument } from '@broadset/model';

import { reconcile,type ReconcileResult } from '../_shared/reconcile';
import type { BroadsetXmpElementEntry } from '../_shared/xmp';
import { readPdfRoundTripMetadata } from './import';

/**
 * Phase 6 P6.5 — PDF reconciliation. Thin wrapper over
 * `_shared/reconcile` that diffs the preserved Broadset metadata (the
 * `BroadsetDocument` hydrated from the XMP + marked-content fast path
 * in P6.4a) against the current operator-level visual document (what
 * the PDF reader re-imported via the P6.4b extraction pass).
 *
 * Output buckets (from `_shared/reconcile/ReconcileResult`):
 *
 * - `modifications` — id-matched pairs whose non-identity fields
 *   differ. Carries `before` / `after` references and a `microdiff`
 *   payload so the import-warning UI can render per-field conflict
 *   markers.
 * - `additions` — elements in `currentVisual` whose ids and fingerprints
 *   do not match any preserved entry. Land on the "Imported from PDF"
 *   staging page per `project/spec/formats/pdf.md` → "Reconciliation
 *   Reporting".
 * - `deletions` — ids in `preservedMetadata` that neither a marked-
 *   content tag nor a fingerprint match could recover. The user
 *   confirms deletion before the element drops.
 * - `recoveredByHash` — deletion / addition pairs whose `/BSET`
 *   marked-content tag was stripped by an aggressive external edit but
 *   whose `fingerprintElement()` hash still matched, preventing a
 *   spurious delete + add event.
 */
export interface PdfReconcileInput {
  readonly preserved: BroadsetDocument;
  readonly current: BroadsetDocument;
  /**
   * Stable fingerprints keyed by element id across both populations.
   * Callers compute these via `_shared/fingerprint/fingerprintElement`
   * (async) before invoking reconciliation; the map is cached once and
   * shared between the two diff sides for a single reconciliation pass.
   */
  readonly fingerprintsByElementId: ReadonlyMap<string, string>;
}

export function reconcilePdf(input: PdfReconcileInput): ReconcileResult {
  return reconcile({
    preservedMetadata: { elements: input.preserved.elements.map(normaliseForReconcile) },
    currentVisual: { elements: input.current.elements.map(normaliseForReconcile) },
    fingerprintsByElementId: input.fingerprintsByElementId,
  });
}

/**
 * Strip the `extensions.pdf` bookkeeping (`dirty`, `source`,
 * `preservationBlob`) before reconciling. The flags are import-side
 * state — present after `importPdfDocument` hydrates an element,
 * absent on elements parsed from the preserved XMP payload — so
 * diffing them surfaces false `modifications` that obscure the actual
 * external edits the user made in Acrobat / etc. Mirrors the SVG
 * `normaliseForReconcile` strategy in `svg/roundtrip.ts`.
 */
function normaliseForReconcile(el: BroadsetElement): BroadsetElement {
  // The model declares `extensions` as non-nullable, but several
  // older test fixtures cast through `as BroadsetElement` and omit
  // the field — so we treat the value as possibly-undefined at the
  // boundary to keep the destructure safe.
  const source = el.extensions as ({ pdf?: unknown } & Record<string, unknown>) | undefined;
  const { pdf: _pdf, ...restExtensions } = source ?? {};

  return { ...el, extensions: restExtensions };
}

/**
 * Returns the element ids whose `extensions.pdf.dirty === true`, i.e.
 * elements the user or an external tool edited after import. The
 * exporter re-synthesises these from current Broadset state and emits
 * the preserved original operator blob for the remainder (dirty-flag
 * discipline — see `project/spec/formats/pdf.md` → "Dirty-Flag
 * Discipline").
 */
export function dirtyElementIds(doc: BroadsetDocument): readonly string[] {
  const out: string[] = [];

  for (const el of doc.elements) {
    if (isDirty(el)) out.push(el.id);
  }

  return out;
}

function isDirty(element: BroadsetElement): boolean {
  const extensions = element.extensions as Readonly<Record<string, unknown>> | undefined;

  if (extensions === undefined) return false;

  const pdf = extensions['pdf'];

  if (pdf === undefined || pdf === null || typeof pdf !== 'object') return false;

  return (pdf as Record<string, unknown>)['dirty'] === true;
}

/**
 * Hydrate the preserved Broadset document a Broadset-exported PDF
 * carries in its XMP packet. Mirrors `readPreservedPptxDocument` and
 * `readPreservedPsdDocument` so cross-format reconciliation wiring
 * can ask each format the same question — "do you have a preserved
 * snapshot to diff against?" — without reaching into format-specific
 * internals.
 *
 * Returns `null` when the byte stream is not a recognisable PDF,
 * carries no XMP packet, or carries a packet whose `elements[]` lack
 * the JSON `payload` reconciliation depends on.
 */
export async function readPreservedPdfDocument(data: Uint8Array): Promise<BroadsetDocument | null> {
  const metadata = await readPdfRoundTripMetadata(data);

  if (metadata.xmp === null) return null;

  const elements: BroadsetElement[] = [];

  for (const entry of metadata.xmp.elements) {
    const element = tryParseElementPayload(entry);

    if (element !== null) elements.push(element);
  }

  if (elements.length === 0) return null;

  const empty = createEmptyBroadsetDocument();

  return { ...empty, id: metadata.xmp.documentId, elements };
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
