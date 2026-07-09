import { describe, expect, it } from 'vitest';

import { computeElementContentHash, createDefaultElement } from './index';

/**
 * @description The content hash is the stable fingerprint used by cross-format
 * reconciliation when external tools strip `data-bs-*` tags, XMP entries, or
 * shape-name markers. The Phase 1 body is a simple deterministic hash that
 * Phase 2 will replace with `xxhash-wasm`; this suite locks down the
 * canonicalisation contract — what fields are in, what fields are out, and
 * what invariants must hold regardless of the hash implementation.
 */
describe('computeElementContentHash — identity canonicalisation', () => {
  /** @description Two byte-identical elements must produce the same hash. */
  it('is deterministic across equal elements', () => {
    const a = createDefaultElement('text', { content: 'Hello' });
    const b = createDefaultElement('text', { id: a.id, content: 'Hello' });

    expect(computeElementContentHash(a)).toBe(computeElementContentHash(b));
  });

  /** @description Element `type` participates in the hash — the same geometry on a rectangle vs. text must not collide. */
  it('differentiates by element type', () => {
    const text = createDefaultElement('text', { content: '' });
    const rect = createDefaultElement('rectangle', { id: text.id, content: '' });

    expect(computeElementContentHash(text)).not.toBe(computeElementContentHash(rect));
  });

  /** @description Position, size, and rotation participate in the hash. */
  it('differentiates by geometry', () => {
    const a = createDefaultElement('rectangle', { position: { x: 0, y: 0 }, width: 100, height: 100 });
    const b = createDefaultElement('rectangle', { position: { x: 10, y: 0 }, width: 100, height: 100 });
    const c = createDefaultElement('rectangle', { position: { x: 0, y: 0 }, width: 200, height: 100 });
    const d = createDefaultElement('rectangle', { position: { x: 0, y: 0 }, width: 100, height: 100, rotation: 45 });

    const hashes = [a, b, c, d].map(computeElementContentHash);
    const unique = new Set(hashes);

    expect(unique.size).toBe(4);
  });

  /** @description `content` (text, path `d`, URL, …) participates in the hash. */
  it('differentiates by content text', () => {
    const a = createDefaultElement('text', { content: 'Hello' });
    const b = createDefaultElement('text', { content: 'Goodbye' });

    expect(computeElementContentHash(a)).not.toBe(computeElementContentHash(b));
  });

  /** @description Style values participate — e.g. a different `fill` changes the hash. */
  it('differentiates by style values', () => {
    const a = createDefaultElement('rectangle', { style: { fill: '#ff0000' } });
    const b = createDefaultElement('rectangle', { id: a.id, style: { fill: '#00ff00' } });

    expect(computeElementContentHash(a)).not.toBe(computeElementContentHash(b));
  });

  /**
   * @description Style-key iteration order must NOT affect the hash — the
   * canonicalisation sorts keys so two elements whose style literals were
   * written in different orders hash the same.
   */
  it('is style-key-order independent', () => {
    const a = createDefaultElement('rectangle', {
      style: { fill: '#ff0000', stroke: '#000000', strokeWidth: 2 },
    });
    const b = createDefaultElement('rectangle', {
      id: a.id,
      style: { strokeWidth: 2, stroke: '#000000', fill: '#ff0000' },
    });

    expect(computeElementContentHash(a)).toBe(computeElementContentHash(b));
  });

  /**
   * @description Identity metadata (`id`, `name`, `locked`, `parentId`,
   * `groupId`, `extensions`, `dataField`, `visibleWhen`, `repeater`,
   * `typeConfig`, `componentRef`, `autoSize`, `textPathElementId`,
   * `booleanOperation`, `assetId`) MUST NOT participate in the hash — two
   * elements that differ only in these "container" fields describe the same
   * visual and must reconcile to the same identity fingerprint.
   */
  it('ignores identity and container metadata', () => {
    const a = createDefaultElement('text', { content: 'Hello' });
    const b = createDefaultElement('text', {
      content: 'Hello',
      name: 'Different name',
      locked: true,
      parentId: 'some-parent',
      groupId: 'some-group',
      assetId: 'some-asset',
      dataField: { fieldName: 'title', overflow: 'clip' },
      visibleWhen: 'locale == "en"',
      repeater: { dataArrayField: 'items', direction: 'horizontal', gap: 0 },
      componentRef: { componentId: 'card' },
      autoSize: 'shrink-to-fit',
      textPathElementId: 'path-1',
      booleanOperation: 'union',
      extensions: { pdf: { dirty: true } },
    });

    expect(computeElementContentHash(a)).toBe(computeElementContentHash(b));
  });

  /**
   * @description `typeConfig` is a discriminated-union per element type and
   * carries runtime behaviour (loop/autoplay flags for video, countdown
   * configuration for clock, scroll speed for ticker) — it must not
   * participate in the content hash so visual reconciliation stays stable
   * across runtime-behaviour changes.
   */
  it('ignores typeConfig on a video element', () => {
    const a = createDefaultElement('video', {
      content: 'https://example.com/a.mp4',
      typeConfig: { loop: false, autoplay: false, muted: true, startTimeS: 0, endTimeS: null },
    });
    const b = createDefaultElement('video', {
      id: a.id,
      content: 'https://example.com/a.mp4',
      typeConfig: { loop: true, autoplay: true, muted: false, startTimeS: 5, endTimeS: 30 },
    });

    expect(computeElementContentHash(a)).toBe(computeElementContentHash(b));
  });

  /** @description The hash is a non-empty, stable hex-like string. Phase 2 may change the specific algorithm; the shape contract here must survive. */
  it('produces a non-empty string output', () => {
    const hash = computeElementContentHash(createDefaultElement('text', { content: 'Hello' }));

    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });
});
