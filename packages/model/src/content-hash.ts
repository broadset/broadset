import type { BroadsetElement } from './element/style-types';
import { resolveContentAsPlainString } from './text-body';

/**
 * Content-hash identity for `BroadsetElement`.
 *
 * This module declares the Phase 1 API of cross-format reconciliation's stable
 * fingerprint — the value used to recover element identity after an external
 * tool strips `data-bs-*` tags, XMP entries, or PPTX shape names. Phase 2
 * replaces the body below with a `xxhash-wasm`-backed implementation under
 * `packages/formats/src/_shared/fingerprint/`. The *canonicalisation* contract
 * (which fields are in, which are out, how they are serialised) is what
 * downstream reconciliation depends on, and it is locked down by the tests in
 * `content-hash.test.ts`. Changes to that contract are breaking changes.
 *
 * Fields that participate (see io-prereqs-plan §"Content-hash identity"):
 *   - type
 *   - position (x, y), width, height, rotation
 *   - content
 *   - style (keys sorted)
 *
 * Fields that do NOT participate (identity / container metadata):
 *   - id, name, locked, parentId, groupId
 *   - extensions, dataField, visibleWhen, repeater, typeConfig,
 *     componentRef, autoSize, textPathElementId, booleanOperation, assetId
 */

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;
const HEX_RADIX = 16;
const HEX_PAD_LENGTH = 8;

/** 32-bit FNV-1a string hash — deterministic, branch-free, linear in input length. */
function fnv1a32(input: string): number {
  let hash = FNV_OFFSET_BASIS_32;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME_32) >>> 0;
  }

  return hash >>> 0;
}

function compareStringAscending(a: string, b: string): number {
  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}

function canonicalizeStyle(style: BroadsetElement['style']): string {
  const entries: Array<readonly [string, unknown]> = Object.entries(style)
    .filter(([, value]) => value !== undefined)
    .sort(([keyA], [keyB]) => compareStringAscending(keyA, keyB));

  return entries.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('|');
}

/** Canonicalises an element into the string form consumed by the hash body. */
function canonicalizeElement(element: BroadsetElement): string {
  return [
    `t:${element.type}`,
    `x:${String(element.position.x)}`,
    `y:${String(element.position.y)}`,
    `w:${String(element.width)}`,
    `h:${String(element.height)}`,
    `r:${String(element.rotation)}`,
    `c:${resolveContentAsPlainString(element.content)}`,
    `s:${canonicalizeStyle(element.style)}`,
  ].join(';');
}

/**
 * Returns a stable content-hash string for the given element. Two elements
 * that differ only in identity / container metadata (id, name, locked,
 * parentId, extensions, …) MUST produce the same hash. Two elements that
 * differ in type, geometry, content, or style MUST produce different hashes.
 */
export function computeElementContentHash(element: BroadsetElement): string {
  const canonical = canonicalizeElement(element);

  return fnv1a32(canonical).toString(HEX_RADIX).padStart(HEX_PAD_LENGTH, '0');
}
