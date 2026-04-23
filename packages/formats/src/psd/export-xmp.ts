import { type BroadsetDocument, type BroadsetElement } from '@broadset/model';

import { type BroadsetXmpPacket, writeBroadsetXmp } from '../_shared/xmp';

/**
 * Phase 5 P5.2a — builds the document-level `broadset:`-namespaced
 * XMP packet every exported PSD carries. Uses a sync FNV-1a hash of
 * the element's canonical form so the packet can be produced from the
 * sync `exportPsdBytes` entry without awaiting the async xxhash-wasm
 * initialization used by `_shared/fingerprint/fingerprintElement`.
 *
 * The fingerprint is documentation for the reconciliation fallback —
 * the primary key is the element `id`, which the PSD importer reads
 * directly out of the XMP packet when present (and from per-element
 * `BsPs` tags when the importer lands them in P5.4).
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x00000100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

function fnv1aHex(input: string): string {
  let hash = FNV_OFFSET;

  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }

  return hash.toString(16).padStart(16, '0');
}

function canonicalizeElement(el: BroadsetElement): string {
  const content = typeof el.content === 'string' ? el.content : JSON.stringify(el.content);
  const stylePairs = Object.entries(el.style)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .sort((a, b) => a.localeCompare(b));

  return [
    `t=${el.type}`,
    `w=${String(el.width)}`,
    `h=${String(el.height)}`,
    `r=${String(el.rotation)}`,
    `c=${content}`,
    `s=[${stylePairs.join('|')}]`,
  ].join(';');
}

/**
 * Produces the XMP packet for a document. Every element (groups
 * included) contributes a `{ id, fingerprint }` entry. Callers
 * serialize via `writeBroadsetXmp()` and attach the result to
 * `psd.imageResources.xmpMetadata`.
 */
export function buildBroadsetXmpPacket(doc: BroadsetDocument, exportedAt: Date = new Date()): BroadsetXmpPacket {
  return {
    documentId: doc.id,
    version: '1.0',
    exportedAt: exportedAt.toISOString(),
    elements: doc.elements.map((el) => ({
      id: el.id,
      fingerprint: fnv1aHex(canonicalizeElement(el)),
    })),
  };
}

export function writeBroadsetXmpForDocument(doc: BroadsetDocument, exportedAt?: Date): string {
  return writeBroadsetXmp(buildBroadsetXmpPacket(doc, exportedAt));
}
