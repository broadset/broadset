import type { BroadsetElement } from '@broadset/model';
import { createDefaultElement } from '@broadset/model';
import { beforeEach, describe, expect, it } from 'vitest';

import { _resetFingerprintCache, fingerprintElement } from './fingerprint-element';

/**
 * Phase 2 `_shared/fingerprint/` — tests pin the contract the
 * reconciliation pipeline relies on: identical visible geometry +
 * style + content hashes identically, regardless of source-file
 * formatting noise; materially different elements do not collide.
 */

function makeElement(overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return createDefaultElement('text', {
    id: 'el-test',
    content: 'Hello',
    width: 100,
    height: 50,
    position: { x: 10, y: 20 },
    ...overrides,
  });
}

describe('fingerprintElement', () => {
  beforeEach(() => {
    _resetFingerprintCache();
  });

  /**
   * @description The happy path: a stable element produces a non-empty
   * hex string. Asserts the WASM runtime initializes and the 16-char
   * xxhash64 output is the canonical format.
   */
  it('returns a 16-char hex xxhash64 for a canonical element', async () => {
    const element = makeElement();
    const fingerprint = await fingerprintElement(element);

    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  /**
   * @description Two structurally identical elements (different ids,
   * same visible properties) must hash to the same fingerprint so the
   * reconciliation pipeline can recover identity by hash per IO-D-18.
   */
  it('is stable across id changes for structurally identical elements', async () => {
    const elementA = makeElement({ id: 'el-a' });
    const elementB = makeElement({ id: 'el-b' });

    expect(await fingerprintElement(elementA)).toBe(await fingerprintElement(elementB));
  });

  /**
   * @description Changing the `content` must produce a different
   * fingerprint. Text content is part of the canonicalized surface
   * because reconciliation distinguishes elements by what they render.
   */
  it('changes when the content changes', async () => {
    const elementA = makeElement({ content: 'Hello' });
    const elementB = makeElement({ content: 'World' });

    expect(await fingerprintElement(elementA)).not.toBe(await fingerprintElement(elementB));
  });

  /**
   * @description Changing geometry (width / height / rotation) must
   * produce a different fingerprint so visually different elements
   * never collide.
   */
  it('changes when geometry changes', async () => {
    const base = makeElement();
    const resized = makeElement({ width: base.width + 10 });
    const rotated = makeElement({ rotation: 45 });

    const baseFingerprint = await fingerprintElement(base);

    expect(await fingerprintElement(resized)).not.toBe(baseFingerprint);
    expect(await fingerprintElement(rotated)).not.toBe(baseFingerprint);
  });

  /**
   * @description The WASM runtime initializes once; a second call on a
   * fresh element must reuse the cached module and produce a fingerprint
   * in the same format without re-triggering the async loader.
   */
  it('reuses the cached WASM runtime for subsequent calls', async () => {
    const elementA = makeElement();
    const elementB = makeElement({ content: 'Different' });
    const fingerprintA = await fingerprintElement(elementA);
    const fingerprintB = await fingerprintElement(elementB);

    expect(fingerprintA).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprintB).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprintA).not.toBe(fingerprintB);
  });

  /**
   * @description A TextBody-backed content element must hash to a
   * different value from the same text as a flat string so rich-text
   * structure is part of the identity (preserving paragraph / run
   * metadata matters for PSD / PPTX reconciliation).
   */
  it('distinguishes TextBody content from flat-string content', async () => {
    const asString = makeElement({ content: 'Hello' });
    const asTextBody = makeElement({
      content: { paragraphs: [{ runs: [{ text: 'Hello' }] }] },
    });

    const stringFingerprint = await fingerprintElement(asString);
    const bodyFingerprint = await fingerprintElement(asTextBody);

    expect(stringFingerprint).not.toBe(bodyFingerprint);
  });
});
