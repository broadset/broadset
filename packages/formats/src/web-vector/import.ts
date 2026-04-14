import type { BroadsetElementStyle } from '@broadset/model';

export interface SvgImportResult {
  readonly elements: readonly ImportedElement[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly warnings: readonly string[];
}

interface ImportedElement {
  readonly type: string;
  readonly content: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly style: Partial<BroadsetElementStyle>;
}

function parseTransform(transformStr: string): { readonly x: number; readonly y: number; readonly rotation: number } {
  let x = 0;
  let y = 0;
  let rotation = 0;

  const translateMatch = /translate\(\s*([\d.e+-]+)\s*[,\s]\s*([\d.e+-]+)\s*\)/i.exec(transformStr);

  if (translateMatch) {
    x = parseFloat(translateMatch[1] ?? '0');
    y = parseFloat(translateMatch[2] ?? '0');
  }

  const rotateMatch = /rotate\(\s*([\d.e+-]+)/i.exec(transformStr);

  if (rotateMatch) {
    rotation = parseFloat(rotateMatch[1] ?? '0');
  }

  return { x, y, rotation };
}

function getAttr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

function getNumAttr(el: Element, name: string, defaultVal: number): number {
  const val = el.getAttribute(name);

  return val !== null ? parseFloat(val) : defaultVal;
}

function resolveClipPath(el: Element, defsMap: ReadonlyMap<string, string>): string | undefined {
  const clipRef = getAttr(el, 'clip-path');

  if (!clipRef) {
    return undefined;
  }

  const idMatch = /url\(#([^)]+)\)/.exec(clipRef);
  const clipId = idMatch?.[1];

  if (clipId && defsMap.has(clipId)) {
    return defsMap.get(clipId);
  }

  return clipRef;
}

function buildDefsMap(doc: Document): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const defs = doc.querySelectorAll('defs > clipPath');

  defs.forEach((clipPath) => {
    const id = clipPath.getAttribute('id');

    if (id) {
      map.set(id, clipPath.innerHTML);
    }
  });

  return map;
}

function importElement(el: Element, defsMap: ReadonlyMap<string, string>, warnings: string[]): ImportedElement | null {
  const tagName = el.tagName.toLowerCase();
  const transformStr = getAttr(el, 'transform') ?? '';
  const { x, y, rotation } = parseTransform(transformStr);
  const clipPath = resolveClipPath(el, defsMap);
  const fill = getAttr(el, 'fill');
  const stroke = getAttr(el, 'stroke');
  const baseStyle: Partial<BroadsetElementStyle> = {
    ...(clipPath ? { customClipPath: clipPath } : undefined),
    ...(fill ? { fill } : undefined),
    ...(stroke ? { stroke } : undefined),
  };

  switch (tagName) {
    case 'rect':
      return {
        type: 'rectangle',
        content: '',
        position: { x, y },
        width: getNumAttr(el, 'width', 0),
        height: getNumAttr(el, 'height', 0),
        rotation,
        style: baseStyle,
      };

    case 'path':
      return {
        type: 'path',
        content: getAttr(el, 'd') ?? '',
        position: { x, y },
        width: 0,
        height: 0,
        rotation,
        style: baseStyle,
      };

    case 'ellipse':
      return {
        type: 'ellipse',
        content: '',
        position: { x, y },
        width: getNumAttr(el, 'rx', 0) * 2,
        height: getNumAttr(el, 'ry', 0) * 2,
        rotation,
        style: baseStyle,
      };

    case 'circle': {
      const r = getNumAttr(el, 'r', 0);

      return {
        type: 'ellipse',
        content: '',
        position: { x, y },
        width: r * 2,
        height: r * 2,
        rotation,
        style: baseStyle,
      };
    }

    case 'text':
      return {
        type: 'text',
        content: el.textContent,
        position: { x, y },
        width: 0,
        height: 0,
        rotation,
        style: baseStyle,
      };

    case 'image':
      return {
        type: 'image',
        content: getAttr(el, 'href') ?? getAttr(el, 'xlink:href') ?? '',
        position: { x, y },
        width: getNumAttr(el, 'width', 0),
        height: getNumAttr(el, 'height', 0),
        rotation,
        style: baseStyle,
      };

    case 'g': {
      if (transformStr.includes('matrix')) {
        return {
          type: 'svg',
          content: el.outerHTML,
          position: { x: 0, y: 0 },
          width: 0,
          height: 0,
          rotation: 0,
          style: {},
        };
      }

      warnings.push(`Skipped simple group element (id: ${getAttr(el, 'id') ?? 'unknown'})`);

      return null;
    }

    case 'foreignobject':
      return {
        type: 'svg',
        content: el.outerHTML,
        position: { x, y },
        width: getNumAttr(el, 'width', 0),
        height: getNumAttr(el, 'height', 0),
        rotation,
        style: {},
      };

    default:
      warnings.push(`Skipped unsupported SVG element: <${tagName}>`);

      return null;
  }
}

export function importSvg(input: string): SvgImportResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(input, 'image/svg+xml');

  const parseError = xmlDoc.querySelector('parsererror');

  if (parseError) {
    throw new Error(`SVG import failed: invalid XML — ${parseError.textContent}`);
  }

  const svgRoot = xmlDoc.documentElement;

  let canvasWidth = 800;
  let canvasHeight = 600;

  const widthAttr = svgRoot.getAttribute('width');
  const heightAttr = svgRoot.getAttribute('height');

  if (widthAttr && heightAttr) {
    canvasWidth = parseFloat(widthAttr);
    canvasHeight = parseFloat(heightAttr);
  } else {
    const viewBox = svgRoot.getAttribute('viewBox');

    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/);

      canvasWidth = parseFloat(parts[2] ?? '800');
      canvasHeight = parseFloat(parts[3] ?? '600');
    }
  }

  const defsMap = buildDefsMap(xmlDoc);
  const warnings: string[] = [];
  const elements: ImportedElement[] = [];
  const children = svgRoot.children;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (!child || child.tagName.toLowerCase() === 'defs') {
      continue;
    }

    const imported = importElement(child, defsMap, warnings);

    if (imported) {
      elements.push(imported);
    }
  }

  return { elements, canvasWidth, canvasHeight, warnings };
}
