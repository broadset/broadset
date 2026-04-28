import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDefaultElement, createEmptyBroadsetDocument, fontAsset } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPptxBytes, exportPptxWithReport, exportPptxWithReportAsync } from './export';
import { importPptxWithReport } from './import';
import { readOoxmlPackage, readTextPart } from './ooxml/zip';

/**
 * @description Closes the spec gap "Font embedding under `ppt/fonts/`"
 * end-to-end. Round-trips a Broadset document with a referenced font
 * asset (Codicon, MIT) and asserts the exporter:
 *
 * - Emits `<p:embeddedFontLst>` inside `presentation.xml`.
 * - Writes a `ppt/fonts/font{N}.fntdata` part.
 * - Registers the relationship from `presentation.xml`.
 * - Adds a Default content type for the `fntdata` extension.
 * - Skips fonts that have no usage in any text element.
 * - Surfaces a `font-embed-skipped` warning when the asset has a
 *   non-embedded source.
 */

const testFileDir = dirname(fileURLToPath(import.meta.url));
const codiconBytes = new Uint8Array(
  readFileSync(join(testFileDir, '..', '_shared', 'fonts', '__fixtures__', 'codicon.ttf')),
);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }

  return btoa(binary);
}

function buildEmbeddedFontAsset(): ReturnType<typeof fontAsset> {
  return fontAsset({
    id: 'asset-font-codicon',
    name: 'Codicon',
    mimeType: 'font/ttf',
    source: { type: 'embedded', dataUri: `data:font/ttf;base64,${bytesToBase64(codiconBytes)}` },
    format: 'ttf',
    postScriptName: 'codicon',
    familyName: 'codicon',
  });
}

describe('PPTX font embedding round-trip', () => {
  it('emits <p:embeddedFontLst> + ppt/fonts/ part for a font used in a text element', () => {
    const baseDoc = createEmptyBroadsetDocument();
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('text', {
          id: 'text-1',
          name: 'Caption',
          position: { x: 20, y: 20 },
          width: 60,
          height: 20,
          content: '',
          style: { ...baseDoc.elements[0]?.style, fontFamily: 'codicon' },
        }),
      ],
    };
    const bytes = exportPptxBytes(doc, { fontAssets: [buildEmbeddedFontAsset()] });
    const pkg = readOoxmlPackage(bytes);
    const presentation = readTextPart(pkg, 'ppt/presentation.xml');

    expect(presentation).not.toBeNull();
    expect(presentation).toContain('<p:embeddedFontLst>');
    expect(presentation).toContain('<p:font typeface="codicon"/>');
    expect(presentation).toContain('<p:regular r:id="rId');

    const fontPart = pkg.get('ppt/fonts/font1.fntdata');

    expect(fontPart, 'ppt/fonts/font1.fntdata must exist').toBeDefined();
    expect(fontPart?.byteLength ?? 0).toBeGreaterThan(0);
    expect(fontPart?.byteLength ?? Number.MAX_SAFE_INTEGER).toBeLessThan(codiconBytes.byteLength);

    const contentTypes = readTextPart(pkg, '[Content_Types].xml');

    expect(contentTypes).toContain('Extension="fntdata"');

    const presRels = readTextPart(pkg, 'ppt/_rels/presentation.xml.rels');

    expect(presRels).toContain('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font"');
    expect(presRels).toContain('Target="fonts/font1.fntdata"');
  });

  it('skips fonts that no text element uses', () => {
    const doc = createEmptyBroadsetDocument();
    const bytes = exportPptxBytes(doc, { fontAssets: [buildEmbeddedFontAsset()] });
    const pkg = readOoxmlPackage(bytes);

    expect(pkg.has('ppt/fonts/font1.fntdata')).toBe(false);

    const presentation = readTextPart(pkg, 'ppt/presentation.xml');

    expect(presentation).not.toContain('<p:embeddedFontLst>');
  });

  it('embeds per-run font families in a mixed-font TextBody', () => {
    const baseDoc = createEmptyBroadsetDocument();
    const textBody = {
      paragraphs: [
        {
          runs: [
            { text: 'Hello ', props: { style: { fontFamily: 'codicon' } } },
            { text: 'world', props: { style: { fontFamily: 'second-family' } } },
          ],
        },
      ],
    };
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('text', {
          id: 'text-1',
          name: 'Mixed',
          // Element-level font family acts as a fallback for runs that
          // don't override it; this run array overrides every run so the
          // element family shouldn't accumulate codepoints.
          style: { ...baseDoc.elements[0]?.style, fontFamily: 'fallback-family' },
          content: textBody,
        }),
      ],
    };
    // Two embedded assets — one for each run's family. The fallback
    // family has no usage because every run overrides it.
    const codiconAsset = buildEmbeddedFontAsset();
    const secondAsset = fontAsset({
      id: 'asset-font-second',
      name: 'Second',
      mimeType: 'font/ttf',
      // Same bytes; we're testing the matching logic, not subsetter
      // fidelity of two distinct fonts.
      source: codiconAsset.source,
      format: 'ttf',
      postScriptName: 'second',
      familyName: 'second-family',
    });
    const fallbackAsset = fontAsset({
      id: 'asset-font-fallback',
      name: 'Fallback',
      mimeType: 'font/ttf',
      source: codiconAsset.source,
      format: 'ttf',
      postScriptName: 'fallback',
      familyName: 'fallback-family',
    });
    const bytes = exportPptxBytes(doc, { fontAssets: [codiconAsset, secondAsset, fallbackAsset] });
    const pkg = readOoxmlPackage(bytes);

    expect(pkg.has('ppt/fonts/font1.fntdata')).toBe(true);
    expect(pkg.has('ppt/fonts/font2.fntdata')).toBe(true);
    expect(pkg.has('ppt/fonts/font3.fntdata')).toBe(false);

    const presentation = readTextPart(pkg, 'ppt/presentation.xml');

    expect(presentation).toContain('<p:font typeface="codicon"/>');
    expect(presentation).toContain('<p:font typeface="second-family"/>');
    expect(presentation).not.toContain('<p:font typeface="fallback-family"/>');
  });

  it('round-trips an embedded font back into a FontAsset on import', () => {
    const baseDoc = createEmptyBroadsetDocument();
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('text', {
          id: 'text-1',
          name: 'Caption',
          content: '',
          style: { ...baseDoc.elements[0]?.style, fontFamily: 'codicon' },
        }),
      ],
    };
    const bytes = exportPptxBytes(doc, { fontAssets: [buildEmbeddedFontAsset()] });
    const report = importPptxWithReport(bytes);

    expect(report.fontAssets.length).toBe(1);

    const recovered = report.fontAssets[0];

    expect(recovered?.familyName).toBe('codicon');
    expect(recovered?.kind).toBe('font');
    expect(recovered?.source.type).toBe('embedded');
    expect(recovered?.format === 'ttf' || recovered?.format === 'otf').toBe(true);

    if (recovered?.source.type === 'embedded') {
      expect(recovered.source.dataUri.startsWith('data:font/')).toBe(true);
    }
  });

  it('routes a url-source font through the async resolver', async () => {
    const baseDoc = createEmptyBroadsetDocument();
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('text', {
          id: 'text-1',
          name: 'Caption',
          // Codicon's glyphs live in the private-use range; pick a
          // codepoint the font actually covers so subsetting produces
          // a non-empty subset.
          content: '',
          style: { ...baseDoc.elements[0]?.style, fontFamily: 'codicon' },
        }),
      ],
    };
    const remoteFont = fontAsset({
      id: 'asset-font-remote',
      name: 'Codicon Remote',
      mimeType: 'font/ttf',
      source: { type: 'url', url: 'https://example.com/codicon.ttf' },
      format: 'ttf',
      postScriptName: 'codicon',
      familyName: 'codicon',
    });

    let calls = 0;
    const report = await exportPptxWithReportAsync(doc, {
      fontAssets: [remoteFont],
      resolveFontBytes: (asset) => {
        calls += 1;
        expect(asset.familyName).toBe('codicon');

        return Promise.resolve(codiconBytes);
      },
    });
    const pkg = readOoxmlPackage(report.bytes);

    expect(calls).toBe(1);
    expect(pkg.has('ppt/fonts/font1.fntdata')).toBe(true);

    const skipped = report.warnings.find((w) => w.code === 'font-embed-skipped');

    expect(skipped, JSON.stringify(skipped)).toBeUndefined();
  });

  it('surfaces a font-embed-skipped warning when the async resolver throws', async () => {
    const baseDoc = createEmptyBroadsetDocument();
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('text', {
          id: 'text-1',
          name: 'Caption',
          content: 'hi',
          style: { ...baseDoc.elements[0]?.style, fontFamily: 'codicon' },
        }),
      ],
    };
    const remoteFont = fontAsset({
      id: 'asset-font-remote',
      name: 'Codicon Remote',
      mimeType: 'font/ttf',
      source: { type: 'url', url: 'https://example.com/codicon.ttf' },
      format: 'ttf',
      postScriptName: 'codicon',
      familyName: 'codicon',
    });
    const report = await exportPptxWithReportAsync(doc, {
      fontAssets: [remoteFont],
      resolveFontBytes: () => {
        throw new Error('network down');
      },
    });

    expect(report.warnings.some((w) => w.code === 'font-embed-skipped' && w.detail?.includes('network down') === true)).toBe(true);

    const pkg = readOoxmlPackage(report.bytes);

    expect(pkg.has('ppt/fonts/font1.fntdata')).toBe(false);
  });

  it('surfaces a font-embed-skipped warning when fetched bytes exceed the cap', async () => {
    const baseDoc = createEmptyBroadsetDocument();
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('text', {
          id: 'text-1',
          name: 'Caption',
          content: 'hi',
          style: { ...baseDoc.elements[0]?.style, fontFamily: 'codicon' },
        }),
      ],
    };
    const remoteFont = fontAsset({
      id: 'asset-font-remote',
      name: 'Codicon Remote',
      mimeType: 'font/ttf',
      source: { type: 'url', url: 'https://example.com/codicon.ttf' },
      format: 'ttf',
      postScriptName: 'codicon',
      familyName: 'codicon',
    });
    const report = await exportPptxWithReportAsync(doc, {
      fontAssets: [remoteFont],
      fontMaxBytes: 1024,
      resolveFontBytes: () => Promise.resolve(codiconBytes),
    });

    expect(report.warnings.some((w) => w.code === 'font-embed-skipped' && w.message.includes('exceeded'))).toBe(true);

    const pkg = readOoxmlPackage(report.bytes);

    expect(pkg.has('ppt/fonts/font1.fntdata')).toBe(false);
  });

  it('surfaces a font-embed-skipped warning for a non-embedded source', () => {
    const baseDoc = createEmptyBroadsetDocument();
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('text', {
          id: 'text-1',
          name: 'Caption',
          content: 'hi',
          style: { ...baseDoc.elements[0]?.style, fontFamily: 'codicon' },
        }),
      ],
    };
    const remoteFont = fontAsset({
      id: 'asset-font-remote',
      name: 'Codicon Remote',
      mimeType: 'font/ttf',
      source: { type: 'url', url: 'https://example.com/codicon.ttf' },
      format: 'ttf',
      postScriptName: 'codicon',
      familyName: 'codicon',
    });
    const report = exportPptxWithReport(doc, { fontAssets: [remoteFont] });

    expect(report.warnings.some((w) => w.code === 'font-embed-skipped')).toBe(true);

    const pkg = readOoxmlPackage(report.bytes);

    expect(pkg.has('ppt/fonts/font1.fntdata')).toBe(false);
  });

  /**
   * @description Phase 4.7 / closes pptx-known-gaps A4. A family with
   * regular + bold + italic + boldItalic FontAssets must collapse into
   * one `<p:embeddedFont typeface="…"/>` block carrying four child
   * relationship tags pointing at four distinct font parts. Each
   * variant gets its own subset, so a bold-only codepoint never lands
   * under the regular relationship.
   *
   * Test text uses Codicon's PUA glyphs so the subsetter actually
   * includes a glyph per variant — this proves the routing without
   * relying on subsetter fallback behaviour.
   */
  it('emits four variant relationships under one <p:embeddedFont> when all four FontAssets are supplied', () => {
    const baseDoc = createEmptyBroadsetDocument();
    const baseStyle = baseDoc.elements[0]?.style;
    const codiconGlyph = String.fromCodePoint(0xea60);
    const textBody = {
      paragraphs: [
        {
          runs: [
            { text: codiconGlyph, props: { style: {} } },
            { text: codiconGlyph, props: { style: { fontWeight: 700 } } },
            { text: codiconGlyph, props: { style: { fontStyle: 'italic' } } },
            { text: codiconGlyph, props: { style: { fontWeight: 700, fontStyle: 'italic' } } },
          ],
        },
      ],
    };
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('text', {
          id: 'text-1',
          name: 'Mixed',
          style: { ...baseStyle, fontFamily: 'codicon' },
          content: textBody,
        }),
      ],
    };
    const sharedSource = buildEmbeddedFontAsset().source;
    const regular = fontAsset({
      id: 'asset-font-codicon-regular',
      name: 'Codicon',
      mimeType: 'font/ttf',
      source: sharedSource,
      format: 'ttf',
      postScriptName: 'codicon',
      familyName: 'codicon',
      weight: 400,
      italic: false,
    });
    const bold = fontAsset({ ...regular, id: 'asset-font-codicon-bold', postScriptName: 'codicon-bold', weight: 700 });
    const italic = fontAsset({ ...regular, id: 'asset-font-codicon-italic', postScriptName: 'codicon-italic', italic: true });
    const boldItalic = fontAsset({
      ...regular,
      id: 'asset-font-codicon-bolditalic',
      postScriptName: 'codicon-bolditalic',
      weight: 700,
      italic: true,
    });
    const report = exportPptxWithReport(doc, { fontAssets: [regular, bold, italic, boldItalic] });
    const pkg = readOoxmlPackage(report.bytes);

    // No fallback warnings — every variant has an exact-match asset.
    expect(report.warnings.filter((w) => w.code === 'font-embed-skipped')).toEqual([]);

    expect(pkg.has('ppt/fonts/font1.fntdata')).toBe(true);
    expect(pkg.has('ppt/fonts/font2.fntdata')).toBe(true);
    expect(pkg.has('ppt/fonts/font3.fntdata')).toBe(true);
    expect(pkg.has('ppt/fonts/font4.fntdata')).toBe(true);

    const presentation = readTextPart(pkg, 'ppt/presentation.xml');

    expect(presentation).not.toBeNull();

    // Single <p:embeddedFont> for the family.
    const embeddedCount = presentation === null ? 0 : (presentation.match(/<p:embeddedFont>/g) ?? []).length;

    expect(embeddedCount).toBe(1);
    expect(presentation).toContain('<p:font typeface="codicon"/>');
    expect(presentation).toMatch(/<p:regular r:id="rId\d+"\/>/);
    expect(presentation).toMatch(/<p:bold r:id="rId\d+"\/>/);
    expect(presentation).toMatch(/<p:italic r:id="rId\d+"\/>/);
    expect(presentation).toMatch(/<p:boldItalic r:id="rId\d+"\/>/);
  });

  /**
   * @description Phase 4.7 — bold-run codepoints route to the bold
   * subset, NOT the regular subset. The simplest cross-check uses two
   * non-overlapping codepoint groups (one per run) and asserts that
   * the regular and bold font parts have distinct byte sizes — the
   * subsetter can't yield identical bytes from disjoint codepoint
   * inputs.
   */
  it('routes bold-run codepoints to the bold font part, not the regular part', () => {
    const baseDoc = createEmptyBroadsetDocument();
    const baseStyle = baseDoc.elements[0]?.style;
    // Codicon's glyphs live in the private-use area; pick distinct PUA
    // codepoints so each run's subset is non-empty. The bold run owns
    // an extra glyph so its subset bytes differ from the regular part.
    const regularGlyph = String.fromCodePoint(0xea60);
    const boldGlyphs = `${String.fromCodePoint(0xea60)}${String.fromCodePoint(0xea61)}`;
    const textBody = {
      paragraphs: [
        {
          runs: [
            { text: regularGlyph, props: { style: {} } },
            { text: boldGlyphs, props: { style: { fontWeight: 700 } } },
          ],
        },
      ],
    };
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('text', {
          id: 'text-1',
          name: 'Mixed weight',
          style: { ...baseStyle, fontFamily: 'codicon' },
          content: textBody,
        }),
      ],
    };
    const regular = fontAsset({
      id: 'asset-font-codicon-regular',
      name: 'Codicon',
      mimeType: 'font/ttf',
      source: buildEmbeddedFontAsset().source,
      format: 'ttf',
      postScriptName: 'codicon',
      familyName: 'codicon',
      weight: 400,
    });
    const bold = fontAsset({ ...regular, id: 'asset-font-codicon-bold', postScriptName: 'codicon-bold', weight: 700 });
    const report = exportPptxWithReport(doc, { fontAssets: [regular, bold] });
    const pkg = readOoxmlPackage(report.bytes);
    const regularBytes = pkg.get('ppt/fonts/font1.fntdata');
    const boldBytes = pkg.get('ppt/fonts/font2.fntdata');

    expect(regularBytes).toBeDefined();
    expect(boldBytes).toBeDefined();
    expect(regularBytes?.byteLength).toBeGreaterThan(0);
    expect(boldBytes?.byteLength).toBeGreaterThan(0);
    // Disjoint codepoint sets through the same subsetter cannot produce
    // identical byte streams — if they were equal, the bold codepoints
    // got folded into the regular subset.
    expect(regularBytes?.byteLength).not.toBe(boldBytes?.byteLength);

    const presentation = readTextPart(pkg, 'ppt/presentation.xml');

    expect(presentation).toMatch(/<p:regular r:id="rId\d+"\/>/);
    expect(presentation).toMatch(/<p:bold r:id="rId\d+"\/>/);
  });

  /**
   * @description Phase 4.7 — regression. A family with only a regular
   * FontAsset (no italic / bold / boldItalic variants supplied)
   * collapses to today's behaviour: a single `<p:regular>` relation
   * with every codepoint under it. Critical so the simple single-asset
   * case keeps working when callers don't yet split their font
   * assets per weight.
   */
  it('emits exactly the regular relationship when only one FontAsset is supplied', () => {
    const baseDoc = createEmptyBroadsetDocument();
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('text', {
          id: 'text-1',
          name: 'Caption',
          content: String.fromCodePoint(0xea60),
          style: { ...baseDoc.elements[0]?.style, fontFamily: 'codicon' },
        }),
      ],
    };
    const report = exportPptxWithReport(doc, { fontAssets: [buildEmbeddedFontAsset()] });
    const pkg = readOoxmlPackage(report.bytes);
    const presentation = readTextPart(pkg, 'ppt/presentation.xml');

    expect(presentation).toContain('<p:embeddedFontLst>');
    expect(presentation).toContain('<p:font typeface="codicon"/>');
    expect(presentation).toMatch(/<p:regular r:id="rId\d+"\/>/);
    expect(presentation).not.toContain('<p:bold ');
    expect(presentation).not.toContain('<p:italic ');
    expect(presentation).not.toContain('<p:boldItalic ');
  });

  /**
   * @description Phase 4.7 — italic text without an italic FontAsset
   * surfaces a `font-embed-skipped` warning whose `detail` records the
   * fallback, AND folds the italic codepoints into the regular
   * relationship rather than dropping them. Mirrors the
   * known-gaps A4 closure contract: missing-variant ≠ missing-glyph.
   */
  it('falls back to regular with a warning when an italic variant is missing', () => {
    const baseDoc = createEmptyBroadsetDocument();
    const baseStyle = baseDoc.elements[0]?.style;
    const codiconGlyph = String.fromCodePoint(0xea60);
    const textBody = {
      paragraphs: [
        {
          runs: [
            { text: codiconGlyph, props: { style: {} } },
            { text: codiconGlyph, props: { style: { fontStyle: 'italic' } } },
          ],
        },
      ],
    };
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('text', {
          id: 'text-1',
          name: 'Italic without variant',
          style: { ...baseStyle, fontFamily: 'codicon' },
          content: textBody,
        }),
      ],
    };
    const report = exportPptxWithReport(doc, { fontAssets: [buildEmbeddedFontAsset()] });

    const fallback = report.warnings.find(
      (w) => w.code === 'font-embed-skipped' && w.detail === 'variant-fallback:italic->regular',
    );

    expect(fallback, JSON.stringify(report.warnings)).toBeDefined();

    const pkg = readOoxmlPackage(report.bytes);

    expect(pkg.has('ppt/fonts/font1.fntdata')).toBe(true);
    expect(pkg.has('ppt/fonts/font2.fntdata')).toBe(false);

    const presentation = readTextPart(pkg, 'ppt/presentation.xml');

    expect(presentation).toMatch(/<p:regular r:id="rId\d+"\/>/);
    expect(presentation).not.toContain('<p:italic ');
  });
});

