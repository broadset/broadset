import {
  type BroadsetDocument,
  type BroadsetElementStyleInput,
  createDefaultElement,
  createEmptyBroadsetDocument,
} from '@broadset/model';

import type { SvgImportOptions } from './types';

export interface SvgImportResult {
  readonly elements: readonly ImportedElement[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly warnings: readonly string[];
}

export interface SvgDocumentImportResult {
  readonly document: BroadsetDocument;
  readonly warnings: readonly string[];
}

interface ImportedElement {
  readonly type: string;
  readonly content: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly style: Partial<BroadsetElementStyleInput>;
}

interface TransformState {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
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

function combineTransform(base: TransformState, next: TransformState): TransformState {
  return {
    x: base.x + next.x,
    y: base.y + next.y,
    rotation: base.rotation + next.rotation,
  };
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

function importUnsupportedElement(el: Element, transform: TransformState, warnings: string[]): ImportedElement {
  const tagName = el.tagName.toLowerCase();

  warnings.push(`Preserved unsupported SVG element as payload: <${tagName}>`);

  return {
    type: 'svg',
    content: el.outerHTML,
    position: { x: transform.x, y: transform.y },
    width: getNumAttr(el, 'width', 0),
    height: getNumAttr(el, 'height', 0),
    rotation: transform.rotation,
    style: {},
  };
}

function importElement(
  el: Element,
  defsMap: ReadonlyMap<string, string>,
  warnings: string[],
  inheritedTransform: TransformState,
): ImportedElement[] {
  const tagName = el.tagName.toLowerCase();
  const transformStr = getAttr(el, 'transform') ?? '';
  const transform = combineTransform(inheritedTransform, parseTransform(transformStr));
  const clipPath = resolveClipPath(el, defsMap);
  const fill = getAttr(el, 'fill');
  const stroke = getAttr(el, 'stroke');
  const baseStyle: Partial<BroadsetElementStyleInput> = {
    ...(clipPath ? { customClipPath: clipPath } : undefined),
    ...(fill ? { fill } : undefined),
    ...(stroke ? { stroke } : undefined),
  };

  switch (tagName) {
    case 'rect':
      return [
        {
          type: 'rectangle',
          content: '',
          position: { x: transform.x, y: transform.y },
          width: getNumAttr(el, 'width', 0),
          height: getNumAttr(el, 'height', 0),
          rotation: transform.rotation,
          style: baseStyle,
        },
      ];

    case 'path':
      return [
        {
          type: 'path',
          content: getAttr(el, 'd') ?? '',
          position: { x: transform.x, y: transform.y },
          width: 0,
          height: 0,
          rotation: transform.rotation,
          style: baseStyle,
        },
      ];

    case 'ellipse':
      return [
        {
          type: 'ellipse',
          content: '',
          position: { x: transform.x, y: transform.y },
          width: getNumAttr(el, 'rx', 0) * 2,
          height: getNumAttr(el, 'ry', 0) * 2,
          rotation: transform.rotation,
          style: baseStyle,
        },
      ];

    case 'circle': {
      const r = getNumAttr(el, 'r', 0);

      return [
        {
          type: 'ellipse',
          content: '',
          position: { x: transform.x, y: transform.y },
          width: r * 2,
          height: r * 2,
          rotation: transform.rotation,
          style: baseStyle,
        },
      ];
    }

    case 'text':
      return [
        {
          type: 'text',
          content: el.textContent,
          position: { x: transform.x, y: transform.y },
          width: 0,
          height: 0,
          rotation: transform.rotation,
          style: baseStyle,
        },
      ];

    case 'image':
      return [
        {
          type: 'image',
          content: getAttr(el, 'href') ?? getAttr(el, 'xlink:href') ?? '',
          position: { x: transform.x, y: transform.y },
          width: getNumAttr(el, 'width', 0),
          height: getNumAttr(el, 'height', 0),
          rotation: transform.rotation,
          style: baseStyle,
        },
      ];

    case 'g': {
      if (transformStr.includes('matrix')) {
        warnings.push(`Preserved transformed group as SVG payload (id: ${getAttr(el, 'id') ?? 'unknown'})`);

        return [
          {
            type: 'svg',
            content: el.outerHTML,
            position: { x: 0, y: 0 },
            width: 0,
            height: 0,
            rotation: 0,
            style: {},
          },
        ];
      }

      const importedChildren: ImportedElement[] = [];
      const children = el.children;

      for (let i = 0; i < children.length; i++) {
        const child = children[i];

        if (!child || child.tagName.toLowerCase() === 'defs') {
          continue;
        }

        importedChildren.push(...importElement(child, defsMap, warnings, transform));
      }

      return importedChildren;
    }

    case 'foreignobject':
      return [
        {
          type: 'svg',
          content: el.outerHTML,
          position: { x: transform.x, y: transform.y },
          width: getNumAttr(el, 'width', 0),
          height: getNumAttr(el, 'height', 0),
          rotation: transform.rotation,
          style: {},
        },
      ];

    default:
      return [importUnsupportedElement(el, transform, warnings)];
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
  const rootTransform: TransformState = { x: 0, y: 0, rotation: 0 };

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (!child || child.tagName.toLowerCase() === 'defs') {
      continue;
    }

    elements.push(...importElement(child, defsMap, warnings, rootTransform));
  }

  return { elements, canvasWidth, canvasHeight, warnings };
}

/**
 * High-level SVG import entry point. Wraps the primitive element
 * extractor `importSvg` and produces a full `BroadsetDocument` plus a
 * warnings list that the demo surfaces through
 * `FormatImportWarningsModal`. Phase 7.1 threads existing behaviour
 * through this shape so `import-document.ts` can consume the svg
 * module via its public API. Phase 7.4 replaces the body with the
 * metadata-fast-path and arbitrary-source logic.
 */
export function importSvgDocument(
  input: string,
  fileName = 'Imported SVG',
  _options?: SvgImportOptions,
): SvgDocumentImportResult {
  // Phase 7.1 keeps the existing behaviour; options are consumed in
  // Phase 7.4 when the fast-path importer lands.
  const result = importSvg(input);
  const emptyDoc = createEmptyBroadsetDocument();
  const warnings = [...result.warnings];

  const document: BroadsetDocument = {
    ...emptyDoc,
    name: fileName.replace(/\.svg$/i, ''),
    canvas: { ...emptyDoc.canvas, width: result.canvasWidth, height: result.canvasHeight },
    elements: result.elements.map((element, index) =>
      createDefaultElement(element.type === 'path' ? 'path' : 'svg', {
        id: `imported-${String(index)}`,
        name: `Element ${String(index + 1)}`,
        position: { x: element.position.x, y: element.position.y },
        width: element.width,
        height: element.height,
        rotation: element.rotation,
        content: element.content,
        style: element.style,
      }),
    ),
  };

  if (document.elements.length === 0) {
    warnings.push(
      'SVG import produced no elements. Unsupported content may have been skipped; verify the source file and mapping coverage.',
    );
  }

  return { document, warnings };
}
