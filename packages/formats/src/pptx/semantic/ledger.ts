import type { BroadsetElement } from '@broadset/model';

import { fingerprintElement } from '../../_shared';
import { findChildrenByNs, getAttr, parseOoxml, rootElement } from '../ooxml/ast';
import { XML_DECLARATION } from '../ooxml/xml';
import type { PptxLedgerEntry, PptxRoundTripLedger } from '../types';

const LEDGER_NS = 'https://broadset.io/ns/pptx/interop/1.0/';

/**
 * Interop ledger. `customXml/broadset-interop.xml` carries one entry per
 * Broadset element with its fingerprint at export time. On re-import,
 * the importer compares the stored fingerprint against the current
 * element's fingerprint; a match means "untouched, re-emit the blob
 * byte-for-byte", a mismatch means "external edit, use current state".
 */

/**
 * Compute a {@link PptxRoundTripLedger} for a collection of elements.
 * Fingerprints are produced via `_shared/fingerprint/fingerprintElement`
 * so cross-format reconciliation can reuse the same identity function.
 */
export async function buildLedger(options: {
  readonly documentId: string;
  readonly version: string;
  readonly exportedAt: string;
  readonly elements: readonly BroadsetElement[];
}): Promise<PptxRoundTripLedger> {
  const entries: PptxLedgerEntry[] = [];

  for (const element of options.elements) {
    const fingerprint = await fingerprintElement(element);

    entries.push({ elementId: element.id, fingerprint });
  }

  return {
    documentId: options.documentId,
    version: options.version,
    exportedAt: options.exportedAt,
    entries,
  };
}

/** Serialize a ledger to its `customXml/broadset-interop.xml` body. */
export function buildLedgerXml(ledger: PptxRoundTripLedger): string {
  const entries = ledger.entries
    .map((e) => `<entry id="${escapeAttr(e.elementId)}" fingerprint="${escapeAttr(e.fingerprint)}"/>`)
    .join('');

  return `${XML_DECLARATION}<ledger xmlns="${LEDGER_NS}" documentId="${escapeAttr(ledger.documentId)}" version="${escapeAttr(ledger.version)}" exportedAt="${escapeAttr(ledger.exportedAt)}">${entries}</ledger>`;
}

/**
 * Parse a ledger XML body. Returns `null` for empty / non-ledger input so
 * callers can branch on absence. Resolves elements by explicit
 * namespace URI so the ledger's `xmlns="…"` default-namespace entries
 * are matched correctly.
 */
export function parseLedgerXml(body: string): PptxRoundTripLedger | null {
  const root = rootElement(parseOoxml(body));

  if (root?.local !== 'ledger' || root.ns !== LEDGER_NS) return null;

  const documentId = getAttr(root, 'documentId') ?? '';
  const version = getAttr(root, 'version') ?? '';
  const exportedAt = getAttr(root, 'exportedAt') ?? '';
  const entries: PptxLedgerEntry[] = [];

  for (const entry of findChildrenByNs(root, LEDGER_NS, 'entry')) {
    const elementId = getAttr(entry, 'id');
    const fingerprint = getAttr(entry, 'fingerprint');

    if (elementId === undefined || fingerprint === undefined) continue;
    if (elementId.length === 0 || fingerprint.length === 0) continue;

    entries.push({ elementId, fingerprint });
  }

  return { documentId, version, exportedAt, entries };
}

/**
 * Map a ledger's entries by `elementId` for O(1) lookup during the
 * importer fast-path.
 */
export function indexLedger(ledger: PptxRoundTripLedger): ReadonlyMap<string, string> {
  const map = new Map<string, string>();

  for (const entry of ledger.entries) {
    map.set(entry.elementId, entry.fingerprint);
  }

  return map;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
