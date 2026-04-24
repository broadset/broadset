import type { BroadsetElement } from '@broadset/model';

import { fingerprintElement } from '../../_shared';
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
 * callers can branch on absence.
 */
export function parseLedgerXml(body: string): PptxRoundTripLedger | null {
  if (!body.includes(LEDGER_NS)) return null;

  // Scope attribute lookup to the `<ledger …>` open tag so the XML
  // declaration's own `version="1.0"` does not shadow the ledger's
  // semantic version.
  const openTagMatch = body.match(/<ledger\b[^>]*>/);
  const ledgerTag = openTagMatch?.[0] ?? '';
  const documentId = matchAttr(ledgerTag, 'documentId') ?? '';
  const version = matchAttr(ledgerTag, 'version') ?? '';
  const exportedAt = matchAttr(ledgerTag, 'exportedAt') ?? '';
  const entries: PptxLedgerEntry[] = [];

  for (const match of body.matchAll(/<entry\s+([^/>]+)\/?\s*>/g)) {
    const attrs = match[1] ?? '';
    const elementId = attrs.match(/\bid="([^"]*)"/)?.[1];
    const fingerprint = attrs.match(/\bfingerprint="([^"]*)"/)?.[1];

    if (!elementId || !fingerprint) continue;
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

function matchAttr(body: string, name: string): string | null {
  const re = new RegExp(`\\b${name}="([^"]*)"`);
  const match = body.match(re);

  return match?.[1] ?? null;
}
