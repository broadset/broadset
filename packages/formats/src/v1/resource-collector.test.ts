import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { computeSha256DigestV1 } from './blob-reference';
import { createResourceCollectorV1 } from './resource-collector';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);

describe('createResourceCollectorV1', () => {
  it('deduplicates default image assets and blob bytes by content digest', async () => {
    const collector = createResourceCollectorV1();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const digest = await computeSha256DigestV1(bytes);

    const firstId = await collector.addImageAsset({ bytes, mediaType: 'image/png', pixelSize: [20, 10] });
    const secondId = await collector.addImageAsset({ bytes, mediaType: 'image/png', name: 'Duplicate' });
    const collection = collector.collect();

    expect(firstId).toBe(id(`asset-${digest.slice('sha256:'.length)}`));
    expect(secondId).toBe(firstId);
    expect(collection.resources.assets).toHaveLength(1);
    expect(collection.blobs).toHaveLength(1);
    expect(collection.blobs.get(digest)).toEqual(bytes);
    expect(projectFormatV1.assetSchema.safeParse(collection.resources.assets[0]).success).toBe(true);
  });

  it('honors explicit ids while sharing identical blob bytes', async () => {
    const collector = createResourceCollectorV1();
    const bytes = new Uint8Array([5, 6, 7]);

    await collector.addImageAsset({ bytes, mediaType: 'image/png', id: id('first-image') });
    await collector.addImageAsset({ bytes, mediaType: 'image/png', id: id('second-image') });

    const collection = collector.collect();

    expect(collection.resources.assets.map(({ id: assetId }) => assetId)).toEqual([
      id('first-image'),
      id('second-image'),
    ]);
    expect(collection.blobs).toHaveLength(1);
  });

  it('registers deterministic font assets and font families', async () => {
    const collector = createResourceCollectorV1();
    const bytes = new Uint8Array([8, 9, 10]);
    const digest = await computeSha256DigestV1(bytes);
    const fontAssetId = await collector.addFontAsset({ bytes, mediaType: 'font/woff2', name: 'Imported Sans' });
    const duplicateFontAssetId = await collector.addFontAsset({ bytes, mediaType: 'font/woff2', name: 'Duplicate' });
    const face: projectFormatV1.FontFaceResource = {
      id: id('regular-face'),
      source: { kind: 'asset', assetId: fontAssetId },
      weight: 400,
      style: 'normal',
      stretch: 1,
    };

    const firstFamilyId = collector.addFontFamily({ familyName: 'Imported Sans', faces: [face] });
    const secondFamilyId = collector.addFontFamily({ familyName: 'Fallback Sans', faces: [] });
    const collection = collector.collect();

    expect(fontAssetId).toBe(id(`font-${digest.slice('sha256:'.length)}`));
    expect(duplicateFontAssetId).toBe(fontAssetId);
    expect(firstFamilyId).toBe(id('family-1'));
    expect(secondFamilyId).toBe(id('family-2'));
    expect(collection.resources.fonts).toEqual([
      { id: firstFamilyId, familyName: 'Imported Sans', fallbackFontIds: [], faces: [face] },
      { id: secondFamilyId, familyName: 'Fallback Sans', fallbackFontIds: [], faces: [] },
    ]);
    expect(collection.resources).toMatchObject({ swatches: [], variables: [], styles: [], outputProfiles: [] });
    expect(collection.resources.assets.every((asset) => projectFormatV1.assetSchema.safeParse(asset).success)).toBe(
      true,
    );
    expect(collection.resources.assets).toHaveLength(1);
    expect(collection.blobs).toHaveLength(1);
  });

  it('registers content-addressed vector assets with intrinsic bounds', async () => {
    const collector = createResourceCollectorV1();
    const bytes = new TextEncoder().encode('<svg/>');
    const digest = await computeSha256DigestV1(bytes);

    const assetId = await collector.addVectorAsset({
      bytes,
      mediaType: 'image/svg+xml',
      name: 'source.svg',
      intrinsicBounds: { x: 0, y: 0, width: 20, height: 10 },
    });
    const collection = collector.collect();

    expect(assetId).toBe(id(`vector-${digest.slice('sha256:'.length)}`));
    expect(collection.resources.assets).toContainEqual(
      expect.objectContaining({
        id: assetId,
        kind: 'vector',
        metadata: { intrinsicBounds: { x: 0, y: 0, width: 20, height: 10 } },
      }),
    );
    expect(Array.from(collection.blobs.get(digest) ?? [])).toEqual(Array.from(bytes));
  });

  it('normalizes malformed media types to schema-valid asset defaults', async () => {
    const collector = createResourceCollectorV1();

    await collector.addImageAsset({ bytes: new Uint8Array([1]), mediaType: '' });
    await collector.addFontAsset({ bytes: new Uint8Array([2]), mediaType: 'invalid' });

    expect(collector.collect().resources.assets.map(({ blob }) => blob.mediaType)).toEqual([
      'application/octet-stream',
      'application/octet-stream',
    ]);
    expect(
      collector.collect().resources.assets.every((asset) => projectFormatV1.assetSchema.safeParse(asset).success),
    ).toBe(true);
  });

  it('returns snapshots that are unaffected by later registrations', async () => {
    const collector = createResourceCollectorV1();

    await collector.addImageAsset({ bytes: new Uint8Array([1]), mediaType: 'image/png' });

    const first = collector.collect();

    await collector.addImageAsset({ bytes: new Uint8Array([2]), mediaType: 'image/png' });

    expect(first.resources.assets).toHaveLength(1);
    expect(first.blobs).toHaveLength(1);
    expect(collector.collect().resources.assets).toHaveLength(2);
  });

  it('stores the image bytes hashed before caller mutation', async () => {
    const collector = createResourceCollectorV1();
    const bytes = new Uint8Array([1, 2, 3]);
    const expectedBytes = bytes.slice();
    const registration = collector.addImageAsset({ bytes, mediaType: 'image/png' });

    bytes.fill(9);

    const assetId = await registration;
    const collection = collector.collect();
    const asset = collection.resources.assets.find(({ id: candidateId }) => candidateId === assetId);

    expect(asset).toBeDefined();
    expect(asset === undefined ? undefined : collection.blobs.get(asset.blob.digest)).toEqual(expectedBytes);
  });

  it('stores the font bytes hashed before caller mutation', async () => {
    const collector = createResourceCollectorV1();
    const bytes = new Uint8Array([4, 5, 6]);
    const expectedBytes = bytes.slice();
    const registration = collector.addFontAsset({ bytes, mediaType: 'font/woff2' });

    bytes.fill(9);

    const assetId = await registration;
    const collection = collector.collect();
    const asset = collection.resources.assets.find(({ id: candidateId }) => candidateId === assetId);

    expect(asset).toBeDefined();
    expect(asset === undefined ? undefined : collection.blobs.get(asset.blob.digest)).toEqual(expectedBytes);
  });
});
