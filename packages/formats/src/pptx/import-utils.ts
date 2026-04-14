import type { BroadsetElement, BuiltInElementType, Canvas } from '@broadset/model';
import { BUILT_IN_ELEMENT_TYPES } from '@broadset/model';

import { emuToValue } from './units';

export function extractAll(xml: string, pattern: RegExp): readonly string[] {
  const results: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);

  while ((m = re.exec(xml)) !== null) {
    if (m[0]) {
      results.push(m[0]);
    }
  }

  return results;
}

function extractTextContent(shapeXml: string): string {
  const texts: string[] = [];
  const re = /<a:t>([\s\S]*?)<\/a:t>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(shapeXml)) !== null) {
    if (m[1] !== undefined) {
      texts.push(m[1]);
    }
  }

  return texts.join('');
}

function extractTransform(shapeXml: string): {
  readonly x: number;
  readonly y: number;
  readonly cx: number;
  readonly cy: number;
} {
  const offMatch = shapeXml.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"\/>/);
  const extMatch = shapeXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/);

  return {
    x: offMatch ? parseInt(offMatch[1] ?? '0', 10) : 0,
    y: offMatch ? parseInt(offMatch[2] ?? '0', 10) : 0,
    cx: extMatch ? parseInt(extMatch[1] ?? '0', 10) : 0,
    cy: extMatch ? parseInt(extMatch[2] ?? '0', 10) : 0,
  };
}

function isSinglePathSvg(svgContent: string): boolean {
  const paths = (svgContent.match(/<path\b/g) ?? []).length;
  const rects = (svgContent.match(/<rect\b/g) ?? []).length;
  const circles = (svgContent.match(/<circle\b/g) ?? []).length;
  const ellipses = (svgContent.match(/<ellipse\b/g) ?? []).length;
  const foreignObjs = (svgContent.match(/<foreignObject\b/g) ?? []).length;

  const totalShapes = paths + rects + circles + ellipses;

  return paths === 1 && totalShapes === 1 && foreignObjs === 0;
}

function extractPathD(svgContent: string): string | undefined {
  const match = svgContent.match(/<path[^>]*\bd=['"]([^'"]+)['"]/);

  return match ? (match[1] ?? undefined) : undefined;
}

export function parseSlideRelationships(relsXml: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const re = /<Relationship\s+Id="([^"]+)"\s+Type="[^"]*"\s+Target="([^"]+)"\/>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(relsXml)) !== null) {
    const id = m[1];
    const target = m[2];

    if (id && target) {
      map.set(id, target);
    }
  }

  return map;
}

function extractFillColor(xml: string): string | undefined {
  const match = xml.match(/<a:srgbClr\s+val="([^"]+)"\/>/);

  return match ? `#${match[1] ?? '000000'}` : undefined;
}

let importIdCounter = 0;

function isValidElementType(type: string): type is BuiltInElementType {
  return (BUILT_IN_ELEMENT_TYPES as readonly string[]).includes(type);
}

function createImportedElement(
  type: string,
  content: string,
  position: { readonly x: number; readonly y: number },
  width: number,
  height: number,
  backgroundColor?: string,
): BroadsetElement {
  const validType = isValidElementType(type) ? type : 'rectangle';

  importIdCounter++;

  return {
    id: `import-${String(importIdCounter)}`,
    type: validType,
    name: validType,
    locked: false,
    position,
    width,
    height,
    rotation: 0,
    content,
    style: {
      opacity: 1,
      ...(backgroundColor ? { backgroundColor } : undefined),
    },
    parentId: null,
    groupId: null,
    assetId: null,
    dataField: null,
    visibleWhen: null,
    repeater: null,
    typeConfig: null,
    componentRef: null,
    autoSize: 'fixed',
    textPathElementId: null,
    booleanOperation: null,
    extensions: {},
  } as BroadsetElement;
}

export function importShapeElement(
  shapeXml: string,
  canvas: Canvas,
  svgMediaMap: ReadonlyMap<string, string>,
): BroadsetElement | undefined {
  const xfrm = extractTransform(shapeXml);

  const position = {
    x: emuToValue(canvas, xfrm.x),
    y: emuToValue(canvas, xfrm.y),
  };
  const width = emuToValue(canvas, xfrm.cx);
  const height = emuToValue(canvas, xfrm.cy);

  const textContent = extractTextContent(shapeXml);

  if (textContent) {
    return createImportedElement('text', textContent, position, width, height);
  }

  const blipMatch = shapeXml.match(/<a:blip\s+r:embed="([^"]+)"\/>/);

  if (blipMatch) {
    const relId = blipMatch[1] ?? '';
    const svgContent = svgMediaMap.get(relId);

    if (svgContent) {
      if (isSinglePathSvg(svgContent)) {
        const d = extractPathD(svgContent);

        if (d) {
          return createImportedElement('path', d, position, width, height);
        }
      }

      return createImportedElement('svg', svgContent, position, width, height);
    }

    return createImportedElement('image', `pptx-media:${relId}`, position, width, height);
  }

  const hasFill = shapeXml.includes('<a:solidFill') || shapeXml.includes('<a:noFill');
  const geomMatch = shapeXml.match(/prst="([^"]+)"/);
  const geometry = geomMatch ? (geomMatch[1] ?? 'rect') : 'rect';

  if (geometry === 'ellipse') {
    return createImportedElement('ellipse', '', position, width, height, extractFillColor(shapeXml));
  }

  if (hasFill || geometry === 'rect') {
    return createImportedElement('rectangle', '', position, width, height, extractFillColor(shapeXml));
  }

  return createImportedElement('rectangle', '', position, width, height);
}
