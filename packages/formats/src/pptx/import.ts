import type { BroadsetDocument, BroadsetElement, Canvas } from '@broadset/model';
import PizZip from 'pizzip';

import { MM_TO_EMU } from './constants';
import { extractAll, importShapeElement, parseSlideRelationships } from './import-utils';

export function importPptx(data: Uint8Array): BroadsetDocument {
  const zip = new PizZip(data);

  const presXml = zip.file('ppt/presentation.xml')?.asText() ?? '';
  const sldSzMatch = presXml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"\/>/);
  const cxEmu = sldSzMatch ? parseInt(sldSzMatch[1] ?? '0', 10) : 0;
  const cyEmu = sldSzMatch ? parseInt(sldSzMatch[2] ?? '0', 10) : 0;

  const canvas: Canvas = {
    width: cxEmu / MM_TO_EMU,
    height: cyEmu / MM_TO_EMU,
    unit: 'mm',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
  };

  const slideRelsXml = zip.file('ppt/slides/_rels/slide1.xml.rels')?.asText() ?? '';
  const relMap = parseSlideRelationships(slideRelsXml);

  const svgMediaMap = new Map<string, string>();

  for (const [relId, target] of relMap) {
    if (target.endsWith('.svg')) {
      const mediaPath = target.startsWith('..') ? `ppt/${target.slice(3)}` : target;
      const svgContent = zip.file(mediaPath)?.asText();

      if (svgContent) {
        svgMediaMap.set(relId, svgContent);
      }
    }
  }

  const slideXml = zip.file('ppt/slides/slide1.xml')?.asText() ?? '';

  const elements: BroadsetElement[] = [];

  const spShapes = extractAll(slideXml, /<p:sp>[\s\S]*?<\/p:sp>/);

  for (const shapeXml of spShapes) {
    const el = importShapeElement(shapeXml, canvas, svgMediaMap);

    if (el) {
      elements.push(el);
    }
  }

  const picShapes = extractAll(slideXml, /<p:pic>[\s\S]*?<\/p:pic>/);

  for (const picXml of picShapes) {
    const el = importShapeElement(picXml, canvas, svgMediaMap);

    if (el) {
      elements.push(el);
    }
  }

  return {
    id: 'imported-doc',
    name: 'Imported PPTX',
    documentMode: 'screen',
    canvas,
    elements,
    pages: [{ id: 'page-1', name: 'Page 1', elements: [], locale: null, extensions: {} }],
    animations: [],
    dataSchema: { fields: [] },
  } as BroadsetDocument;
}
