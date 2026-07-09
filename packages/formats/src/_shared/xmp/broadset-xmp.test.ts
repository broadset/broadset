import { describe, expect, it } from 'vitest';

import { BROADSET_XMP_NAMESPACE, type BroadsetXmpPacket, readBroadsetXmp, writeBroadsetXmp } from './broadset-xmp';

/**
 * Phase 2 `_shared/xmp/` — tests pin the read / write contract for
 * the shared `broadset:` namespace per IO-D-08. Round-trip stability
 * matters: a packet written by one carrier must parse back to the
 * same shape when read from any other carrier.
 */
describe('writeBroadsetXmp / readBroadsetXmp round-trip', () => {
  /**
   * @description The canonical happy path: a full packet with one
   * element round-trips without data loss. Ensures every field the
   * reconciliation pipeline needs (documentId, version, exportedAt,
   * element entries) survives the RDF/XML encoding.
   */
  it('round-trips a full packet with a single element entry', () => {
    const packet: BroadsetXmpPacket = {
      documentId: 'doc-abc',
      version: '1.0',
      exportedAt: '2026-04-23T12:00:00Z',
      elements: [{ id: 'el-1', fingerprint: 'fp-1' }],
    };
    const xml = writeBroadsetXmp(packet);
    const parsed = readBroadsetXmp(xml);

    expect(parsed).toEqual(packet);
  });

  /**
   * @description An empty elements array is valid and round-trips as
   * an empty `rdf:Seq`. Documents with zero tracked elements are a
   * legitimate state (e.g. an empty canvas exported as PSD).
   */
  it('round-trips a packet with no element entries', () => {
    const packet: BroadsetXmpPacket = {
      documentId: 'doc-empty',
      version: '1.0',
      exportedAt: '2026-04-23T00:00:00Z',
      elements: [],
    };
    const xml = writeBroadsetXmp(packet);
    const parsed = readBroadsetXmp(xml);

    expect(parsed).toEqual(packet);
  });

  /**
   * @description Multiple elements preserve order and per-element
   * identity. Ordering matters so the reconciliation pipeline can
   * correlate preserved metadata with the current visual layout
   * deterministically.
   */
  it('preserves order and identity across many element entries', () => {
    const packet: BroadsetXmpPacket = {
      documentId: 'doc-multi',
      version: '1.0',
      exportedAt: '2026-04-23T08:30:00Z',
      elements: [
        { id: 'el-a', fingerprint: 'fp-a' },
        { id: 'el-b', fingerprint: 'fp-b' },
        { id: 'el-c', fingerprint: 'fp-c' },
      ],
    };
    const xml = writeBroadsetXmp(packet);
    const parsed = readBroadsetXmp(xml);

    expect(parsed?.elements).toEqual(packet.elements);
  });

  /**
   * @description XML-special characters in element ids (ampersands,
   * angle brackets, quotes) must round-trip via proper entity escaping.
   * Importers frequently surface ids that came from external
   * (non-Broadset) tools with arbitrary contents.
   */
  it('escapes XML-special characters in identifiers', () => {
    const packet: BroadsetXmpPacket = {
      documentId: 'doc-<id>&"/\'',
      version: '1.0',
      exportedAt: '2026-04-23T00:00:00Z',
      elements: [{ id: 'el<1>&"/\'', fingerprint: 'fp/1' }],
    };
    const xml = writeBroadsetXmp(packet);

    expect(xml).not.toContain('<id>');
    expect(xml).toContain('&lt;id&gt;');

    const parsed = readBroadsetXmp(xml);

    expect(parsed).toEqual(packet);
  });
});

describe('writeBroadsetXmp output shape', () => {
  /**
   * @description The rendered packet must declare the canonical
   * `broadset:` namespace URI so downstream consumers can locate it
   * via standard RDF/XML tooling.
   */
  it('includes the canonical broadset: namespace URI', () => {
    const xml = writeBroadsetXmp({
      documentId: 'doc-1',
      version: '1.0',
      exportedAt: '2026-04-23T00:00:00Z',
      elements: [],
    });

    expect(xml).toContain(BROADSET_XMP_NAMESPACE);
  });

  /**
   * @description Zod validation rejects packets missing required
   * fields so a buggy caller can't emit an incomplete XMP surface.
   */
  it('throws when the packet is missing required fields', () => {
    expect(() =>
      writeBroadsetXmp({
        documentId: '',
        version: '1.0',
        exportedAt: '2026-04-23T00:00:00Z',
        elements: [],
      }),
    ).toThrow();
  });
});

describe('readBroadsetXmp — error handling', () => {
  /**
   * @description Empty / whitespace-only input returns `null` so the
   * caller can treat "no metadata" as a normal import state.
   */
  it('returns null for empty and whitespace-only input', () => {
    expect(readBroadsetXmp('')).toBeNull();
    expect(readBroadsetXmp('   \n\t ')).toBeNull();
  });

  /**
   * @description Malformed XML returns `null` without throwing —
   * importers continue processing the document per IO-D-18.
   */
  it('returns null for malformed XML', () => {
    expect(readBroadsetXmp('<rdf:RDF><unclosed')).toBeNull();
  });

  /**
   * @description XMP from a different namespace (no `broadset:`
   * namespace) returns null so the caller falls back to the preserved-
   * metadata absent path.
   */
  it('returns null when no broadset: description is present', () => {
    const xml = [
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
      '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
      '    <rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">',
      '      <dc:title>Not Broadset</dc:title>',
      '    </rdf:Description>',
      '  </rdf:RDF>',
      '</x:xmpmeta>',
    ].join('\n');

    expect(readBroadsetXmp(xml)).toBeNull();
  });

  /**
   * @description Accepts a `Uint8Array` input as well as a string so
   * carriers that extract raw bytes (PSD / PDF XMP streams) can pass
   * the payload without a manual decode step.
   */
  it('accepts Uint8Array input', () => {
    const packet: BroadsetXmpPacket = {
      documentId: 'doc-bytes',
      version: '1.0',
      exportedAt: '2026-04-23T00:00:00Z',
      elements: [{ id: 'el-1', fingerprint: 'fp-1' }],
    };
    const xml = writeBroadsetXmp(packet);
    const bytes = new TextEncoder().encode(xml);

    expect(readBroadsetXmp(bytes)).toEqual(packet);
  });
});
