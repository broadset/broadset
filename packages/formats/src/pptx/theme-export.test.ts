import { createDefaultElement, createEmptyBroadsetDocument, rgbColor, solidFill } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPptxBytes } from './export';
import { readOoxmlPackage, readTextPart } from './ooxml/zip';

/**
 * @description Project-token-driven theme + master + layout. Closes
 * the gap that the generated theme used to be a hard-coded Office
 * stub (Calibri Light / Calibri, generic blue accent). Now the
 * exporter walks element fills + canvas backgrounds + dominant font
 * family and emits a brand-coloured `<a:clrScheme>` plus
 * `<a:fontScheme>`. Explicit `themeColors` / `themeFonts` overrides
 * always win.
 */

function readThemeXml(bytes: Uint8Array): string {
  const pkg = readOoxmlPackage(bytes);
  const xml = readTextPart(pkg, 'ppt/theme/theme1.xml');

  if (xml === null) throw new Error('ppt/theme/theme1.xml missing');

  return xml;
}

describe('PPTX theme generation', () => {
  it('derives accents from the most frequent element fill colours', () => {
    const baseDoc = createEmptyBroadsetDocument();
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('rectangle', {
          id: 'r1',
          style: { ...baseDoc.elements[0]?.style, fill: solidFill(rgbColor('#FF6F00')) },
        }),
        createDefaultElement('rectangle', {
          id: 'r2',
          style: { ...baseDoc.elements[0]?.style, fill: solidFill(rgbColor('#FF6F00')) },
        }),
        createDefaultElement('rectangle', {
          id: 'r3',
          style: { ...baseDoc.elements[0]?.style, fill: solidFill(rgbColor('#0F62FE')) },
        }),
      ],
    };
    const themeXml = readThemeXml(exportPptxBytes(doc));

    expect(themeXml).toContain('<a:accent1><a:srgbClr val="FF6F00"/>');
    expect(themeXml).toContain('<a:accent2><a:srgbClr val="0F62FE"/>');
    // No third distinct accent → fall through to the Office default.
    expect(themeXml).toContain('<a:accent3><a:srgbClr val="A5A5A5"/>');
  });

  it('uses the canvas background as the lt1 / bg1 slot', () => {
    const baseDoc = createEmptyBroadsetDocument();
    const doc = { ...baseDoc, canvas: { ...baseDoc.canvas, backgroundColor: '#1A1A1A' } };
    const themeXml = readThemeXml(exportPptxBytes(doc));

    expect(themeXml).toContain('<a:lt1><a:srgbClr val="1A1A1A"/>');
  });

  it('derives major / minor fonts from the dominant element fontFamily', () => {
    const baseDoc = createEmptyBroadsetDocument();
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('text', {
          id: 't1',
          content: 'a',
          style: { ...baseDoc.elements[0]?.style, fontFamily: 'Inter' },
        }),
        createDefaultElement('text', {
          id: 't2',
          content: 'b',
          style: { ...baseDoc.elements[0]?.style, fontFamily: 'Inter' },
        }),
        createDefaultElement('text', {
          id: 't3',
          content: 'c',
          style: { ...baseDoc.elements[0]?.style, fontFamily: 'Source Sans 3' },
        }),
      ],
    };
    const themeXml = readThemeXml(exportPptxBytes(doc));

    expect(themeXml).toContain('<a:majorFont><a:latin typeface="Inter"/>');
    expect(themeXml).toContain('<a:minorFont><a:latin typeface="Inter"/>');
  });

  it('honours explicit themeColors / themeFonts overrides', () => {
    const baseDoc = createEmptyBroadsetDocument();
    const doc = {
      ...baseDoc,
      elements: [
        createDefaultElement('rectangle', {
          id: 'r1',
          style: { ...baseDoc.elements[0]?.style, fill: solidFill(rgbColor('#FF6F00')) },
        }),
      ],
    };
    const themeXml = readThemeXml(
      exportPptxBytes(doc, {
        themeColors: { accent1: '#123456', dk1: '101010', hlink: '#CAFEBE' },
        themeFonts: { major: 'Display Brand', minor: 'Body Brand' },
      }),
    );

    expect(themeXml).toContain('<a:accent1><a:srgbClr val="123456"/>');
    expect(themeXml).toContain('<a:dk1><a:srgbClr val="101010"/>');
    expect(themeXml).toContain('<a:hlink><a:srgbClr val="CAFEBE"/>');
    expect(themeXml).toContain('<a:majorFont><a:latin typeface="Display Brand"/>');
    expect(themeXml).toContain('<a:minorFont><a:latin typeface="Body Brand"/>');
  });

  it('falls back to Office defaults for an empty document', () => {
    const themeXml = readThemeXml(exportPptxBytes(createEmptyBroadsetDocument()));

    expect(themeXml).toContain('<a:accent1><a:srgbClr val="4472C4"/>');
    expect(themeXml).toContain('<a:majorFont><a:latin typeface="Calibri Light"/>');
    expect(themeXml).toContain('<a:minorFont><a:latin typeface="Calibri"/>');
  });
});
