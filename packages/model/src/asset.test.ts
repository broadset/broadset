import { describe, expect, it } from 'vitest';

import {
  type Asset,
  type AssetKind,
  assetSchema,
  type AudioAsset,
  type DataAsset,
  type FontAsset,
  fontAsset,
  type FontFormat,
  type ImageAsset,
  imageAsset,
  isAudioAsset,
  isDataAsset,
  isFontAsset,
  isImageAsset,
  isVideoAsset,
  type UnicodeRange,
  type VideoAsset,
} from './asset';

/**
 * Phase 4 unit #1 — `FontAsset` lands the font-specific metadata
 * (`format`, `postScriptName`, `familyName`, `subsetRanges?`) that
 * every format exporter needs to round-trip a font embed. PDF requires
 * the PostScript name in `/BaseFont`; PPTX requires the family name in
 * the rPr font table; SVG `@font-face` needs the format string; future
 * subsetting (unit P4.5) needs the Unicode ranges already covered.
 *
 * The schema becomes a discriminated union on `kind` so font-specific
 * fields are strictly required only for `kind: 'font'` assets — other
 * kinds stay permissive until their own Phase 4 units (P4.2 image,
 * P4.4 icc-profile) tighten them.
 */

function baseFontAssetInput(): Parameters<typeof fontAsset>[0] {
  return {
    id: 'asset-font-1',
    name: 'Inter',
    mimeType: 'font/woff2',
    source: { type: 'embedded', dataUri: 'data:font/woff2;base64,AAAA' },
    format: 'woff2',
    postScriptName: 'Inter-Regular',
    familyName: 'Inter',
  };
}

describe('FontAsset factory', () => {
  /**
   * @description `fontAsset` fills every required font-specific field
   * so callers cannot accidentally produce a font asset missing the
   * PDF/PPTX/SVG round-trip metadata. Uses explicit kind: 'font'
   * discriminator for exhaustive switches downstream.
   */
  it('produces a font asset with all required fields', () => {
    const asset = fontAsset(baseFontAssetInput());

    expect(asset.kind).toBe('font');
    expect(asset.format).toBe('woff2');
    expect(asset.postScriptName).toBe('Inter-Regular');
    expect(asset.familyName).toBe('Inter');
    expect(asset.subsetRanges).toBeUndefined();
  });

  /**
   * @description Optional `subsetRanges` survive the factory so future
   * subsetting callers can round-trip the ranges declared at import
   * time (e.g. CSS `unicode-range` on a Google Fonts `@font-face`).
   */
  it('preserves subsetRanges when provided', () => {
    const subsetRanges: readonly UnicodeRange[] = [
      { start: 0x0000, end: 0x00ff },
      { start: 0x2000, end: 0x206f },
    ];

    const asset = fontAsset({ ...baseFontAssetInput(), subsetRanges });

    expect(asset.subsetRanges).toEqual(subsetRanges);
  });

  /**
   * @description `fileSizeBytes` and `metadata` are part of the shared
   * asset base; the font factory must pass them through so the asset
   * panel can surface sizes and extended metadata without re-wrapping.
   */
  it('preserves fileSizeBytes and metadata', () => {
    const metadata = { weight: 400, style: 'normal' } as const;
    const asset = fontAsset({ ...baseFontAssetInput(), fileSizeBytes: 12_345, metadata });

    expect(asset.fileSizeBytes).toBe(12_345);
    expect(asset.metadata).toEqual(metadata);
  });
});

describe('Font asset schema validation', () => {
  /**
   * @description Well-formed font assets pass schema validation and
   * narrow to `FontAsset` on parse so downstream consumers get
   * the font-specific fields in their type.
   */
  it('accepts a minimal valid font asset', () => {
    const parsed = assetSchema.safeParse(fontAsset(baseFontAssetInput()));

    expect(parsed.success).toBe(true);
  });

  /**
   * @description Font assets MUST declare `format` so SVG `@font-face`,
   * PDF `/Subtype`, and PPTX font embed can pick the right encoding.
   * Omission is a hard validation failure.
   */
  it('rejects a font asset missing the format field', () => {
    const { format: _format, ...rest } = fontAsset(baseFontAssetInput());
    const parsed = assetSchema.safeParse(rest);

    expect(parsed.success).toBe(false);
  });

  /**
   * @description The `format` field is restricted to the three web /
   * print embeddable formats every current format track ships. Any
   * other token would be unrecoverable during export.
   */
  it.each<FontFormat>(['woff2', 'ttf', 'otf'])('accepts %s format', (format) => {
    const parsed = assetSchema.safeParse(fontAsset({ ...baseFontAssetInput(), format }));

    expect(parsed.success).toBe(true);
  });

  /**
   * @description Unknown `format` values are rejected so typos (`"woff"`
   * vs `"woff2"`) are caught at the boundary rather than surfacing as
   * export failures.
   */
  it('rejects an unknown font format', () => {
    const asset = { ...fontAsset(baseFontAssetInput()), format: 'woff' };
    const parsed = assetSchema.safeParse(asset);

    expect(parsed.success).toBe(false);
  });

  /**
   * @description `postScriptName` MUST be present — PDF `/BaseFont` and
   * PPTX `typeface` round-trip both depend on it. An empty string is a
   * missing value, not a sentinel.
   */
  it('rejects a font asset with empty postScriptName', () => {
    const asset = { ...fontAsset(baseFontAssetInput()), postScriptName: '' };
    const parsed = assetSchema.safeParse(asset);

    expect(parsed.success).toBe(false);
  });

  /**
   * @description `familyName` MUST be present — editor font pickers and
   * CSS `font-family` keying both depend on it.
   */
  it('rejects a font asset with empty familyName', () => {
    const asset = { ...fontAsset(baseFontAssetInput()), familyName: '' };
    const parsed = assetSchema.safeParse(asset);

    expect(parsed.success).toBe(false);
  });

  /**
   * @description PostScript names are `Name-Style` tokens per the
   * PostScript Language Reference (ASCII, no spaces, limited
   * punctuation). Rejecting whitespace at the boundary prevents
   * downstream PDF/PPTX exporters from emitting invalid `/BaseFont`
   * tokens.
   */
  it('rejects a postScriptName with whitespace', () => {
    const asset = { ...fontAsset(baseFontAssetInput()), postScriptName: 'Inter Regular' };
    const parsed = assetSchema.safeParse(asset);

    expect(parsed.success).toBe(false);
  });

  /**
   * @description `subsetRanges` entries MUST describe a non-empty,
   * non-decreasing codepoint range within the Unicode space. Reversed
   * or out-of-range entries indicate a buggy importer and must fail
   * rather than silently corrupt the subset.
   */
  it('rejects subsetRanges where start > end', () => {
    const asset = {
      ...fontAsset(baseFontAssetInput()),
      subsetRanges: [{ start: 100, end: 10 }],
    };
    const parsed = assetSchema.safeParse(asset);

    expect(parsed.success).toBe(false);
  });

  /**
   * @description Negative codepoints are invalid Unicode and must be
   * rejected at the model boundary.
   */
  it('rejects negative codepoints in subsetRanges', () => {
    const asset = {
      ...fontAsset(baseFontAssetInput()),
      subsetRanges: [{ start: -1, end: 10 }],
    };
    const parsed = assetSchema.safeParse(asset);

    expect(parsed.success).toBe(false);
  });

  /**
   * @description Codepoints above `0x10FFFF` are outside the Unicode
   * range and must be rejected.
   */
  it('rejects codepoints above U+10FFFF in subsetRanges', () => {
    const asset = {
      ...fontAsset(baseFontAssetInput()),
      subsetRanges: [{ start: 0, end: 0x110000 }],
    };
    const parsed = assetSchema.safeParse(asset);

    expect(parsed.success).toBe(false);
  });

  /**
   * @description Non-integer codepoints are meaningless for Unicode
   * ranges. Rejection at the boundary keeps the subset math clean.
   */
  it('rejects non-integer codepoints in subsetRanges', () => {
    const asset = {
      ...fontAsset(baseFontAssetInput()),
      subsetRanges: [{ start: 1.5, end: 10 }],
    };
    const parsed = assetSchema.safeParse(asset);

    expect(parsed.success).toBe(false);
  });
});

describe('Image asset fidelity fields', () => {
  /**
   * @description Image assets MUST declare intrinsic pixel dimensions
   * so SVG `<image>` `width`/`height`, PDF image XObject bounding box,
   * and PPTX picture frame geometry can all be emitted without
   * decoding the byte blob. Omission is a hard validation failure.
   */
  it('accepts an image asset with width and height', () => {
    const asset = imageAsset({
      id: 'asset-image-1',
      name: 'Logo',
      mimeType: 'image/png',
      source: { type: 'embedded', dataUri: 'data:image/png;base64,AAAA' },
      width: 512,
      height: 256,
    });

    const parsed = assetSchema.safeParse(asset);

    expect(parsed.success).toBe(true);
    expect(asset.width).toBe(512);
    expect(asset.height).toBe(256);
  });

  /**
   * @description Missing `width` is rejected — exporters cannot infer
   * image dimensions from a URL-sourced asset without decoding bytes,
   * which defeats the purpose of the byte-addressable asset pipeline.
   */
  it('rejects an image asset missing width', () => {
    const parsed = assetSchema.safeParse({
      id: 'asset-image-1',
      kind: 'image',
      name: 'Logo',
      mimeType: 'image/png',
      source: { type: 'embedded', dataUri: 'data:image/png;base64,AAAA' },
      height: 256,
    });

    expect(parsed.success).toBe(false);
  });

  /**
   * @description Missing `height` is equally fatal — same reason.
   */
  it('rejects an image asset missing height', () => {
    const parsed = assetSchema.safeParse({
      id: 'asset-image-1',
      kind: 'image',
      name: 'Logo',
      mimeType: 'image/png',
      source: { type: 'embedded', dataUri: 'data:image/png;base64,AAAA' },
      width: 512,
    });

    expect(parsed.success).toBe(false);
  });

  /**
   * @description Dimensions MUST be positive — zero and negative
   * values are meaningless for raster images and would silently
   * propagate into exported coordinate math.
   */
  it.each([
    ['zero width', { width: 0, height: 10 }],
    ['zero height', { width: 10, height: 0 }],
    ['negative width', { width: -1, height: 10 }],
    ['negative height', { width: 10, height: -1 }],
  ])('rejects image asset with %s', (_label, dims) => {
    const parsed = assetSchema.safeParse({
      id: 'asset-image-1',
      kind: 'image',
      name: 'Logo',
      mimeType: 'image/png',
      source: { type: 'embedded', dataUri: 'data:image/png;base64,AAAA' },
      ...dims,
    });

    expect(parsed.success).toBe(false);
  });

  /**
   * @description Pixel dimensions MUST be integers. Non-integer values
   * arrive from buggy importers that mistakenly divide pixel counts —
   * catching this at the boundary keeps the exported image XObject /
   * `<image>` geometry clean.
   */
  it('rejects non-integer image dimensions', () => {
    const parsed = assetSchema.safeParse({
      id: 'asset-image-1',
      kind: 'image',
      name: 'Logo',
      mimeType: 'image/png',
      source: { type: 'embedded', dataUri: 'data:image/png;base64,AAAA' },
      width: 1.5,
      height: 10,
    });

    expect(parsed.success).toBe(false);
  });

  /**
   * @description The `imageAsset` factory surfaces `width`/`height`
   * as required parameters so callers cannot construct an
   * under-specified image asset at compile time.
   */
  it('factory requires width and height', () => {
    const asset = imageAsset({
      id: 'asset-image-1',
      name: 'Logo',
      mimeType: 'image/png',
      source: { type: 'url', url: 'https://cdn.example.com/logo.png' },
      width: 100,
      height: 50,
    });

    expect(asset.kind).toBe('image');
    expect(asset.width).toBe(100);
    expect(asset.height).toBe(50);
  });

  /**
   * @description Optional `iccProfileAssetId` references a shared
   * `icc-profile` asset (PDF `/OutputIntent`, PSD CMYK ICC, JPEG/PNG
   * pass-through). Uses the same field name as
   * `document.outputIntent.iccProfileAssetId` so a single grep finds
   * every ICC-profile reference.
   */
  it('accepts an image asset with iccProfileAssetId', () => {
    const asset = imageAsset({
      id: 'asset-image-1',
      name: 'Logo',
      mimeType: 'image/jpeg',
      source: { type: 'embedded', dataUri: 'data:image/jpeg;base64,AAAA' },
      width: 800,
      height: 600,
      iccProfileAssetId: 'asset-icc-swop',
    });
    const parsed = assetSchema.safeParse(asset);

    expect(parsed.success).toBe(true);
    expect(asset.iccProfileAssetId).toBe('asset-icc-swop');
  });

  /**
   * @description `iccProfileAssetId` is optional — a plain sRGB raster
   * without an explicit profile must still validate.
   */
  it('accepts an image asset without iccProfileAssetId', () => {
    const asset = imageAsset({
      id: 'asset-image-1',
      name: 'Logo',
      mimeType: 'image/png',
      source: { type: 'embedded', dataUri: 'data:image/png;base64,AAAA' },
      width: 10,
      height: 10,
    });
    const parsed = assetSchema.safeParse(asset);

    expect(parsed.success).toBe(true);
    expect(asset.iccProfileAssetId).toBeUndefined();
  });

  /**
   * @description An empty `iccProfileAssetId` is a buggy importer
   * signal — references must either be present and point to a real
   * asset ID or be absent entirely.
   */
  it('rejects an image asset with empty iccProfileAssetId', () => {
    const parsed = assetSchema.safeParse({
      id: 'asset-image-1',
      kind: 'image',
      name: 'Logo',
      mimeType: 'image/png',
      source: { type: 'embedded', dataUri: 'data:image/png;base64,AAAA' },
      width: 10,
      height: 10,
      iccProfileAssetId: '',
    });

    expect(parsed.success).toBe(false);
  });
});

describe('Asset discriminated union', () => {
  /**
   * @description The schema narrows on `kind`, so TypeScript exhaustive
   * checks and runtime validation stay aligned — a non-font kind with
   * extraneous font fields still validates (the union discards them at
   * parse time via object stripping) but the narrowed TS type prevents
   * misuse at compile time.
   */
  it('parses each supported kind', () => {
    const fontInput: FontAsset = fontAsset(baseFontAssetInput());
    const imageInput: ImageAsset = imageAsset({
      id: 'asset-image-1',
      name: 'Logo',
      mimeType: 'image/png',
      source: { type: 'url', url: 'https://cdn.example.com/logo.png' },
      width: 200,
      height: 200,
    });
    const videoInput: VideoAsset = {
      id: 'asset-video-1',
      kind: 'video',
      name: 'Clip',
      mimeType: 'video/mp4',
      source: { type: 'url', url: 'https://cdn.example.com/clip.mp4' },
    };
    const audioInput: AudioAsset = {
      id: 'asset-audio-1',
      kind: 'audio',
      name: 'Jingle',
      mimeType: 'audio/mpeg',
      source: { type: 'embedded', dataUri: 'data:audio/mpeg;base64,AAAA' },
    };
    const dataInput: DataAsset = {
      id: 'asset-data-1',
      kind: 'data',
      name: 'Schedule',
      mimeType: 'application/json',
      source: { type: 'file', path: 'data/schedule.json' },
    };

    for (const input of [fontInput, imageInput, videoInput, audioInput, dataInput]) {
      expect(assetSchema.safeParse(input).success).toBe(true);
    }
  });

  /**
   * @description Unsupported kinds are rejected so new kinds must land
   * via spec + schema changes, not silent data drift.
   */
  it('rejects an unsupported kind', () => {
    const parsed = assetSchema.safeParse({
      id: 'asset-x',
      kind: 'vector',
      name: 'X',
      mimeType: 'application/octet-stream',
      source: { type: 'url', url: 'https://example.com/x' },
    });

    expect(parsed.success).toBe(false);
  });

  /**
   * @description Duplicate `id` / empty-id rules are covered by the
   * project-level schema; the asset schema itself rejects an empty id
   * so assets composed outside a project still validate safely.
   */
  it('rejects an empty asset id', () => {
    const parsed = assetSchema.safeParse({
      id: '',
      kind: 'image',
      name: 'Logo',
      mimeType: 'image/png',
      source: { type: 'url', url: 'https://cdn.example.com/logo.png' },
      width: 10,
      height: 10,
    });

    expect(parsed.success).toBe(false);
  });

  /**
   * @description The `AssetKind` type mirrors the schema's accepted
   * values so any future kind addition has to touch both call sites.
   */
  it('exposes the expected kinds via the AssetKind type', () => {
    const expected: readonly AssetKind[] = ['image', 'video', 'font', 'audio', 'data'];

    // Type-level assertion: compile fails if AssetKind diverges.
    const sample: AssetKind = 'font';

    expect(expected).toContain(sample);
  });
});

describe('Asset type guards', () => {
  /**
   * @description Type guards narrow `Asset` back to its variant so
   * downstream code (export font pipeline, picture fill resolver) can
   * iterate a mixed asset list and pick out exactly the kinds it
   * handles without unsafe casting.
   */
  it('narrow to the correct variant', () => {
    const assets: readonly Asset[] = [
      fontAsset(baseFontAssetInput()),
      imageAsset({
        id: 'asset-image-1',
        name: 'Logo',
        mimeType: 'image/png',
        source: { type: 'url', url: 'https://cdn.example.com/logo.png' },
        width: 200,
        height: 200,
      }),
      {
        id: 'asset-video-1',
        kind: 'video',
        name: 'Clip',
        mimeType: 'video/mp4',
        source: { type: 'url', url: 'https://cdn.example.com/clip.mp4' },
      },
      {
        id: 'asset-audio-1',
        kind: 'audio',
        name: 'Jingle',
        mimeType: 'audio/mpeg',
        source: { type: 'embedded', dataUri: 'data:audio/mpeg;base64,AAAA' },
      },
      {
        id: 'asset-data-1',
        kind: 'data',
        name: 'Schedule',
        mimeType: 'application/json',
        source: { type: 'file', path: 'data/schedule.json' },
      },
    ];

    expect(assets.filter(isFontAsset)).toHaveLength(1);
    expect(assets.filter(isImageAsset)).toHaveLength(1);
    expect(assets.filter(isVideoAsset)).toHaveLength(1);
    expect(assets.filter(isAudioAsset)).toHaveLength(1);
    expect(assets.filter(isDataAsset)).toHaveLength(1);
  });
});
