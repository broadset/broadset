import { describe, expect, it } from 'vitest';

import { AssetDeduplicator, contentHashHex } from './asset-dedup';

/**
 * Phase 4 `_shared/asset-dedup/` — `AssetDeduplicator` collapses
 * duplicate byte blobs across every importer so a PDF with 100
 * copies of the same logo produces one asset, not 100. Backed by
 * xxhash-wasm (h64 → hex string) — same hash family used by the
 * Phase 2 `_shared/fingerprint/` module so bundle cost stays flat.
 */

describe('contentHashHex', () => {
  /**
   * @description Identical byte blobs produce identical hashes — the
   * dedup invariant. Testing with a non-trivial input so the hash
   * isn't a constant value the helper could fake.
   */
  it('returns the same hash for identical bytes', async () => {
    const a = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const b = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(await contentHashHex(a)).toBe(await contentHashHex(b));
  });

  /**
   * @description Distinct byte blobs produce distinct hashes. A
   * single-bit difference flips the hash so dedup cannot collapse
   * visually different content.
   */
  it('returns different hashes for different bytes', async () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 5]);

    expect(await contentHashHex(a)).not.toBe(await contentHashHex(b));
  });

  /**
   * @description Empty bytes hash to a defined, stable value rather
   * than throwing — empty inputs can arrive from malformed importers.
   */
  it('hashes empty bytes to a defined value', async () => {
    const hash = await contentHashHex(new Uint8Array(0));

    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  /**
   * @description The hash is a lowercase hex string of deterministic
   * length so downstream code can slice safely for short-id derivation.
   */
  it('returns a fixed-length lowercase hex string', async () => {
    const hash = await contentHashHex(new Uint8Array([1, 2, 3]));

    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    expect(hash.length).toBe(16);
  });
});

describe('AssetDeduplicator', () => {
  /**
   * @description First registration of a byte blob produces a fresh
   * asset ID and reports `existed: false` so the importer knows to
   * actually emit a new `Asset` record.
   */
  it('registers a fresh blob with existed=false', async () => {
    const dedup = new AssetDeduplicator();
    const result = await dedup.register(new Uint8Array([1, 2, 3]), 'image/png');

    expect(typeof result.assetId).toBe('string');
    expect(result.assetId.length).toBeGreaterThan(0);
    expect(result.existed).toBe(false);
    expect(typeof result.hash).toBe('string');
  });

  /**
   * @description Re-registering identical bytes returns the same
   * asset ID — the core dedup behavior. The second call reports
   * `existed: true` so importers can skip building a duplicate asset
   * record.
   */
  it('collapses duplicate byte blobs to the same asset ID', async () => {
    const dedup = new AssetDeduplicator();
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const first = await dedup.register(bytes, 'image/png');
    const second = await dedup.register(bytes, 'image/png');

    expect(second.assetId).toBe(first.assetId);
    expect(second.existed).toBe(true);
  });

  /**
   * @description Different byte blobs get different IDs even when the
   * MIME type matches — byte content is the dedup key.
   */
  it('produces distinct asset IDs for different bytes', async () => {
    const dedup = new AssetDeduplicator();

    const first = await dedup.register(new Uint8Array([1]), 'image/png');
    const second = await dedup.register(new Uint8Array([2]), 'image/png');

    expect(second.assetId).not.toBe(first.assetId);
    expect(second.existed).toBe(false);
  });

  /**
   * @description Each deduplicator instance keeps its own table so
   * concurrent imports do not accidentally share state. Cross-import
   * dedup is an intentional caller-managed concern, not a global one.
   */
  it('does not share dedup state across instances', async () => {
    const dedupA = new AssetDeduplicator();
    const dedupB = new AssetDeduplicator();
    const bytes = new Uint8Array([1, 2, 3]);

    const first = await dedupA.register(bytes, 'image/png');
    const second = await dedupB.register(bytes, 'image/png');

    expect(second.existed).toBe(false);
    // IDs are deterministic from content so they still match.
    expect(second.assetId).toBe(first.assetId);
  });

  /**
   * @description Asset IDs are deterministic from the content — the
   * same bytes produce the same ID regardless of when or where
   * `register` is called. Enables reproducible `.bsp` round-trips.
   */
  it('produces deterministic asset IDs for identical content', async () => {
    const dedupA = new AssetDeduplicator();
    const dedupB = new AssetDeduplicator();
    const bytes = new Uint8Array([10, 20, 30, 40]);

    const a = await dedupA.register(bytes, 'image/png');
    const b = await dedupB.register(bytes, 'image/png');

    expect(a.assetId).toBe(b.assetId);
    expect(a.hash).toBe(b.hash);
  });

  /**
   * @description MIME type influences the ID prefix so the asset ID
   * reads back meaningfully in logs and file viewers. Two blobs with
   * identical bytes but different declared MIME types are rare but
   * possible (arbitrary data assets) — they get different IDs so they
   * remain distinguishable.
   */
  it('distinguishes same bytes under different MIME types', async () => {
    const dedup = new AssetDeduplicator();
    const bytes = new Uint8Array([1, 2, 3]);

    const a = await dedup.register(bytes, 'image/png');
    const b = await dedup.register(bytes, 'font/ttf');

    expect(a.assetId).not.toBe(b.assetId);
  });
});
