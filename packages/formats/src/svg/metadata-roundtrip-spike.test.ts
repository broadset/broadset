/**
 * P7.1 — SVG metadata round-trip spike (in-process).
 *
 * The Phase 7 plan calls for verifying that a minimal SVG carrying a
 * `<metadata>` RDF/XML packet with the `broadset:` namespace round-trips
 * through Illustrator and Inkscape. That check requires the desktop
 * editors themselves and is tracked as a manual gate before Phase 7.2
 * metadata emission lands. This suite runs the in-process analogue:
 * parse + re-serialise via DOMParser / XMLSerializer and confirm the
 * packet survives structurally.
 *
 * The goal is to catch jsdom-level regressions early — if jsdom (or a
 * future parser swap) drops namespaced attributes or collapses
 * `<metadata>` children, the Phase 7.3+ import path is dead on arrival.
 * The external-tool fixtures from Phase 5 of the plan cover the
 * Illustrator / Inkscape matrix.
 */
import { describe, expect, it } from 'vitest';

import { SVG_BROADSET_NAMESPACE } from './types';

const BROADSET_NS = SVG_BROADSET_NAMESPACE;
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const SVG_NS = 'http://www.w3.org/2000/svg';

function buildSvgWithMetadata(): string {
  return `<svg xmlns="${SVG_NS}" xmlns:broadset="${BROADSET_NS}" xmlns:rdf="${RDF_NS}" width="100" height="100" viewBox="0 0 100 100">
    <metadata>
      <rdf:RDF>
        <rdf:Description rdf:about="">
          <broadset:documentId>doc-1</broadset:documentId>
          <broadset:version>0.1.0</broadset:version>
          <broadset:exportedAt>2026-04-24T00:00:00Z</broadset:exportedAt>
          <broadset:elements>
            <rdf:Seq>
              <rdf:li broadset:elementId="el-1" broadset:contentHash="abcdef0123456789"/>
              <rdf:li broadset:elementId="el-2" broadset:contentHash="0011223344556677"/>
            </rdf:Seq>
          </broadset:elements>
        </rdf:Description>
      </rdf:RDF>
    </metadata>
    <rect width="50" height="50" data-bs-id="el-1" data-bs-kind="rectangle" broadset:contentHash="abcdef0123456789"/>
  </svg>`;
}

describe('SVG metadata round-trip spike', () => {
  /**
   * @description The canonical `broadset:` namespace URI declared on
   * the root `<svg>` element MUST be the shared Broadset XMP URI from
   * IO-D-08. Phase 7.0 locked this invariant down; the spike confirms
   * it at the code-boundary level.
   */
  it('declares the shared Broadset namespace URI', () => {
    expect(BROADSET_NS).toBe('https://broadset.io/ns/xmp/1.0/');
  });

  /**
   * @description DOMParser parses a well-formed SVG with a nested
   * `<metadata><rdf:RDF>` packet without error — the foundation of
   * the Phase 7.3 fast-path importer.
   */
  it('DOMParser round-trips the minimal SVG without error', () => {
    const parser = new DOMParser();
    const src = buildSvgWithMetadata();
    const parsed = parser.parseFromString(src, 'image/svg+xml');

    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(parsed.documentElement.tagName.toLowerCase()).toBe('svg');
  });

  /**
   * @description The `<metadata>` element survives parse and carries
   * the `rdf:RDF` child with the `broadset:` namespace intact.
   */
  it('preserves <metadata> + <rdf:RDF> children', () => {
    const parser = new DOMParser();
    const src = buildSvgWithMetadata();
    const parsed = parser.parseFromString(src, 'image/svg+xml');
    const metadata = parsed.getElementsByTagName('metadata');

    expect(metadata.length).toBe(1);

    const rdfRoots = parsed.getElementsByTagNameNS(RDF_NS, 'RDF');

    expect(rdfRoots.length).toBe(1);
  });

  /**
   * @description Namespaced attribute values (`broadset:elementId`,
   * `broadset:contentHash`) survive parse and lookup by namespace URI
   * — the mechanism the importer relies on for per-element identity
   * recovery when `data-bs-*` is stripped by an external editor.
   */
  it('preserves broadset:-namespaced attributes on elements', () => {
    const parser = new DOMParser();
    const src = buildSvgWithMetadata();
    const parsed = parser.parseFromString(src, 'image/svg+xml');
    const rect = parsed.getElementsByTagNameNS(SVG_NS, 'rect')[0];

    expect(rect).toBeDefined();
    expect(rect?.getAttributeNS(BROADSET_NS, 'contentHash')).toBe('abcdef0123456789');
    expect(rect?.getAttribute('data-bs-id')).toBe('el-1');
    expect(rect?.getAttribute('data-bs-kind')).toBe('rectangle');
  });

  /**
   * @description The `broadset:elements` `rdf:Seq` children preserve
   * their per-item identifiers on round-trip. This is the mechanism
   * the Phase 7.3a fast-path relies on to hydrate the per-element
   * fingerprint list.
   */
  it('preserves rdf:Seq element list', () => {
    const parser = new DOMParser();
    const src = buildSvgWithMetadata();
    const parsed = parser.parseFromString(src, 'image/svg+xml');
    const items = parsed.getElementsByTagNameNS(RDF_NS, 'li');

    expect(items.length).toBe(2);
    expect(items[0]?.getAttributeNS(BROADSET_NS, 'elementId')).toBe('el-1');
    expect(items[1]?.getAttributeNS(BROADSET_NS, 'elementId')).toBe('el-2');
  });

  /**
   * @description XMLSerializer round-trips the parsed document back
   * to markup that itself re-parses cleanly. This is the foundation
   * of the P7.4b chain-round-trip test — external tools that run
   * their own serialise / parse pipeline (Illustrator, Inkscape)
   * MUST preserve the same shape; we can't fully prove that
   * in-process, but we can prove the DOM layer doesn't corrupt the
   * packet on its own.
   */
  it('XMLSerializer → DOMParser round-trip is idempotent for the metadata packet', () => {
    const parser = new DOMParser();
    const src = buildSvgWithMetadata();
    const first = parser.parseFromString(src, 'image/svg+xml');
    const serialised = new XMLSerializer().serializeToString(first);
    const second = parser.parseFromString(serialised, 'image/svg+xml');

    expect(second.querySelector('parsererror')).toBeNull();

    const metadata = second.getElementsByTagName('metadata');

    expect(metadata.length).toBe(1);

    const items = second.getElementsByTagNameNS(RDF_NS, 'li');

    expect(items.length).toBe(2);
    expect(items[0]?.getAttributeNS(BROADSET_NS, 'elementId')).toBe('el-1');
  });
});
