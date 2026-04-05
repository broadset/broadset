import type { BroadsetDocument, PageElement } from '@broadset/model';
import { createDefaultScreenProps } from '@broadset/model';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/** SVG element tag names that map to native broadset element types. */
const NATIVE_SVG_ELEMENTS = new Set(['rect', 'path', 'text', 'image', 'ellipse', 'circle', 'line']);

/** Internal type for elements used during SVG export. */
type ExportElement = PageElement;

/** Safely get a screen property from an element. */
function getScreenProp(el: ExportElement, key: string): unknown {
  return el.screen?.[key];
}

/** Safely get a style property from an element. */
function getStyleProp(el: ExportElement, key: string): unknown {
  return el.style?.[key];
}

/** Get style opacity, defaulting to 1. */
function getOpacity(el: ExportElement): number {
  const v = getStyleProp(el, 'opacity');

  return typeof v === 'number' ? v : 1;
}

// ---------------------------------------------------------------------------
// SVG Export
// ---------------------------------------------------------------------------

/**
 * Exports a BroadsetDocument to SVG markup.
 * Produces a valid SVG string with elements mapped to SVG nodes.
 */
export function exportSvg(doc: BroadsetDocument): string {
  const { canvas } = doc;
  const elements = doc.pages[0]?.elements ?? [];

  const defs: string[] = [];
  const body: string[] = [];

  for (const el of elements) {
    const clipId = buildClipDef(el, defs);
    const clipAttr = clipId !== undefined ? ` clip-path="url(#${clipId})"` : '';

    switch (el.type) {
      case 'path':
        body.push(buildPathNode(el, clipAttr));
        break;
      case 'text':
        body.push(buildTextNode(el, clipAttr));
        break;
      case 'image':
        body.push(buildImageNode(el, clipAttr));
        break;
      case 'svg':
        body.push(buildInlineSvgNode(el, clipAttr));
        break;
      case 'rectangle':
        body.push(buildRectNode(el, clipAttr));
        break;
      case 'ellipse':
        body.push(buildEllipseNode(el, clipAttr));
        break;
      default:
        body.push(buildRectNode(el, clipAttr));
        break;
    }
  }

  const defsBlock = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';

  return [
    `<svg xmlns="${SVG_NS}" width="${String(canvas.width)}" height="${String(canvas.height)}">`,
    defsBlock,
    ...body,
    '</svg>',
  ].join('');
}

// ---------------------------------------------------------------------------
// SVG Export — Node builders
// ---------------------------------------------------------------------------

function buildClipDef(el: ExportElement, defs: string[]): string | undefined {
  const clipPath = getScreenProp(el, 'customClipPath');

  if (typeof clipPath !== 'string' || clipPath === '') return undefined;

  const clipId = `clip-${el.id}`;

  defs.push(`<clipPath id="${clipId}"><path d="${cssClipToSvgPath(clipPath)}" /></clipPath>`);

  return clipId;
}

function cssClipToSvgPath(clip: string): string {
  // For polygon() we can convert to an SVG path; for others, preserve as-is
  if (clip.startsWith('polygon(')) {
    const inner = clip.slice(8, -1); // remove "polygon(" and ")"
    const points = inner.split(',').map((p) => p.trim());

    return (
      points
        .map((pt, i) => {
          const cmd = i === 0 ? 'M' : 'L';

          return `${cmd}${pt.replace(/\s+/g, ',')}`;
        })
        .join(' ') + ' Z'
    );
  }

  // For circle(), ellipse(), inset(), path() — store the CSS value in d
  // as a marker; the real handling is via CSS clip-path on the container
  return clip;
}

function buildTransform(el: ExportElement): string {
  const parts: string[] = [];

  if (el.position.x !== 0 || el.position.y !== 0) {
    parts.push(`translate(${String(el.position.x)},${String(el.position.y)})`);
  }

  if (el.rotation !== 0) {
    parts.push(`rotate(${String(el.rotation)},${String(el.width / 2)},${String(el.height / 2)})`);
  }

  return parts.length > 0 ? ` transform="${parts.join(' ')}"` : '';
}

function buildPathNode(el: ExportElement, clipAttr: string): string {
  const attrs: string[] = [`id="${el.id}"`, `d="${el.content}"`];

  const stroke = getStyleProp(el, 'stroke');
  const fill = getStyleProp(el, 'fill');
  const strokeWidth = getStyleProp(el, 'strokeWidth');
  const opacity = getOpacity(el);

  if (typeof stroke === 'string') attrs.push(`stroke="${stroke}"`);
  if (typeof fill === 'string') attrs.push(`fill="${fill}"`);
  if (typeof strokeWidth === 'number') attrs.push(`stroke-width="${String(strokeWidth)}"`);
  if (opacity !== 1) attrs.push(`opacity="${String(opacity)}"`);

  const transform = buildTransform(el);

  return `<path ${attrs.join(' ')}${transform}${clipAttr} />`;
}

function buildTextNode(el: ExportElement, clipAttr: string): string {
  const attrs: string[] = [`id="${el.id}"`];
  const transform = buildTransform(el);

  const fontFamily = getStyleProp(el, 'fontFamily');
  const fontSize = getStyleProp(el, 'fontSize');
  const fontColor = getStyleProp(el, 'fontColor');
  const opacity = getOpacity(el);

  if (typeof fontFamily === 'string') attrs.push(`font-family="${fontFamily}"`);
  if (typeof fontSize === 'number') attrs.push(`font-size="${String(fontSize)}"`);
  if (typeof fontColor === 'string') attrs.push(`fill="${fontColor}"`);
  if (opacity !== 1) attrs.push(`opacity="${String(opacity)}"`);

  return `<text ${attrs.join(' ')}${transform}${clipAttr}>${escapeXml(el.content)}</text>`;
}

function buildImageNode(el: ExportElement, clipAttr: string): string {
  const attrs: string[] = [
    `id="${el.id}"`,
    `href="${escapeXml(el.content)}"`,
    `width="${String(el.width)}"`,
    `height="${String(el.height)}"`,
  ];
  const transform = buildTransform(el);
  const opacity = getOpacity(el);

  if (opacity !== 1) attrs.push(`opacity="${String(opacity)}"`);

  return `<image ${attrs.join(' ')}${transform}${clipAttr} />`;
}

function buildInlineSvgNode(el: ExportElement, clipAttr: string): string {
  // Embed inline SVG content directly — do NOT convert to data URI
  const transform = buildTransform(el);

  return `<g id="${el.id}"${transform}${clipAttr}>${el.content}</g>`;
}

function buildRectNode(el: ExportElement, clipAttr: string): string {
  const attrs: string[] = [`id="${el.id}"`, `width="${String(el.width)}"`, `height="${String(el.height)}"`];
  const transform = buildTransform(el);

  const bg = getStyleProp(el, 'backgroundColor');
  const borderColor = getStyleProp(el, 'borderColor');
  const borderWidth = getStyleProp(el, 'borderWidth');
  const borderRadius = getStyleProp(el, 'borderRadius');
  const opacity = getOpacity(el);

  if (typeof bg === 'string') attrs.push(`fill="${bg}"`);
  if (typeof borderColor === 'string') attrs.push(`stroke="${borderColor}"`);
  if (typeof borderWidth === 'number') attrs.push(`stroke-width="${String(borderWidth)}"`);

  if (typeof borderRadius === 'number' && borderRadius > 0) {
    attrs.push(`rx="${String(borderRadius)}"`);
  }

  if (opacity !== 1) attrs.push(`opacity="${String(opacity)}"`);

  return `<rect ${attrs.join(' ')}${transform}${clipAttr} />`;
}

function buildEllipseNode(el: ExportElement, clipAttr: string): string {
  const cx = el.position.x + el.width / 2;
  const cy = el.position.y + el.height / 2;
  const rx = el.width / 2;
  const ry = el.height / 2;

  const attrs: string[] = [
    `id="${el.id}"`,
    `cx="${String(cx)}"`,
    `cy="${String(cy)}"`,
    `rx="${String(rx)}"`,
    `ry="${String(ry)}"`,
  ];

  const bg = getStyleProp(el, 'backgroundColor');

  if (typeof bg === 'string') attrs.push(`fill="${bg}"`);

  if (el.rotation !== 0) {
    attrs.push(`transform="rotate(${String(el.rotation)},${String(cx)},${String(cy)})"`);
  }

  const clipStr = clipAttr;
  const opacity = getOpacity(el);

  if (opacity !== 1) attrs.push(`opacity="${String(opacity)}"`);

  return `<ellipse ${attrs.join(' ')}${clipStr} />`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// SVG Import
// ---------------------------------------------------------------------------

/** Result of importing SVG content. */
export interface SvgImportResult {
  readonly elements: readonly ImportedElement[];
  readonly width: number;
  readonly height: number;
  readonly warnings: readonly string[];
}

/** An imported element with position, type, and content. */
export interface ImportedElement {
  readonly type: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly content: string;
  readonly screen: ReturnType<typeof createDefaultScreenProps>;
  readonly style: { readonly stroke?: string; readonly fill?: string };
}

/**
 * Parses SVG markup into a list of elements with position, type, and content.
 * Returns warnings for unsupported or invalid elements.
 * Throws on completely invalid XML input.
 */
export function importSvg(svgString: string): SvgImportResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(svgString, 'image/svg+xml');

  // Check for parse errors
  const parseError = xmlDoc.querySelector('parsererror');

  if (parseError !== null) {
    throw new Error(`SVG parse error: ${parseError.textContent}`);
  }

  const svgRoot = xmlDoc.documentElement;

  // Determine dimensions: prefer width/height, fall back to viewBox
  let width = parseFloat(svgRoot.getAttribute('width') ?? '0');
  let height = parseFloat(svgRoot.getAttribute('height') ?? '0');

  if ((width === 0 || height === 0) && svgRoot.hasAttribute('viewBox')) {
    const viewBoxStr = svgRoot.getAttribute('viewBox');

    if (viewBoxStr !== null) {
      const viewBox = viewBoxStr.split(/[\s,]+/);

      if (viewBox.length >= 4) {
        width = parseFloat(viewBox[2] ?? '0');
        height = parseFloat(viewBox[3] ?? '0');
      }
    }
  }

  // Collect defs for clip-path resolution
  const clipPaths = new Map<string, string>();
  const defsEls = svgRoot.querySelectorAll('defs clipPath');

  for (const cp of defsEls) {
    const cpId = cp.getAttribute('id');

    if (cpId !== null) {
      clipPaths.set(cpId, cp.innerHTML);
    }
  }

  // Import elements
  const elements: ImportedElement[] = [];
  const warnings: string[] = [];

  for (const node of svgRoot.children) {
    if (node.tagName === 'defs') continue;

    importNode(node, clipPaths, elements, warnings);
  }

  return { elements, width, height, warnings };
}

function importNode(
  node: Element,
  clipPaths: Map<string, string>,
  elements: ImportedElement[],
  warnings: string[],
): void {
  const tagName = node.tagName.toLowerCase();

  // Resolve clip-path reference
  const clipRef = node.getAttribute('clip-path');
  let customClipPath = '';

  if (clipRef !== null) {
    const match = /url\(#([^)]+)\)/.exec(clipRef);
    const clipId = match?.[1];

    if (clipId !== undefined && clipPaths.has(clipId)) {
      customClipPath = clipPaths.get(clipId) ?? '';
    }
  }

  const screen = { ...createDefaultScreenProps(), customClipPath };

  // Parse transform for position and rotation
  const transform = node.getAttribute('transform') ?? '';
  const { x, y, rotation } = parseTransform(transform);

  switch (tagName) {
    case 'rect': {
      const w = parseFloat(node.getAttribute('width') ?? '0');
      const h = parseFloat(node.getAttribute('height') ?? '0');
      const rx = parseFloat(node.getAttribute('x') ?? '0');
      const ry = parseFloat(node.getAttribute('y') ?? '0');
      const rectStyle = buildImportStyle(node);

      elements.push({
        type: 'rectangle',
        position: { x: x + rx, y: y + ry },
        width: w,
        height: h,
        rotation,
        content: '',
        screen,
        style: rectStyle,
      });
      break;
    }

    case 'path': {
      const d = node.getAttribute('d') ?? '';
      const pathStyle = buildImportStyle(node);

      elements.push({
        type: 'path',
        position: { x, y },
        width: 0,
        height: 0,
        rotation,
        content: d,
        screen,
        style: pathStyle,
      });
      break;
    }

    case 'text': {
      const tx = parseFloat(node.getAttribute('x') ?? '0');
      const ty = parseFloat(node.getAttribute('y') ?? '0');

      elements.push({
        type: 'text',
        position: { x: x + tx, y: y + ty },
        width: 0,
        height: 0,
        rotation,
        content: node.textContent,
        screen,
        style: {},
      });
      break;
    }

    case 'image': {
      const href = node.getAttribute('href') ?? node.getAttributeNS(XHTML_NS, 'href') ?? '';
      const w = parseFloat(node.getAttribute('width') ?? '0');
      const h = parseFloat(node.getAttribute('height') ?? '0');

      elements.push({
        type: 'image',
        position: { x, y },
        width: w,
        height: h,
        rotation,
        content: href,
        screen,
        style: {},
      });
      break;
    }

    case 'circle':
    case 'ellipse':
    case 'line':
      // Native SVG elements — convert to rectangle for simplicity
      elements.push({
        type: 'rectangle',
        position: { x, y },
        width: parseFloat(node.getAttribute('width') ?? node.getAttribute('r') ?? '0') * 2,
        height: parseFloat(node.getAttribute('height') ?? node.getAttribute('r') ?? '0') * 2,
        rotation,
        content: '',
        screen,
        style: {},
      });
      break;

    case 'g': {
      // Groups with complex transforms are preserved as svg type
      const hasComplexTransform = transform.includes('matrix');

      if (hasComplexTransform) {
        elements.push({
          type: 'svg',
          position: { x, y },
          width: 0,
          height: 0,
          rotation,
          content: node.innerHTML,
          screen,
          style: {},
        });
      } else {
        // Simple groups — recurse into children
        for (const child of node.children) {
          importNode(child, clipPaths, elements, warnings);
        }
      }

      break;
    }

    case 'foreignobject': {
      // Preserve as svg type element with full markup
      elements.push({
        type: 'svg',
        position: { x, y },
        width: parseFloat(node.getAttribute('width') ?? '0'),
        height: parseFloat(node.getAttribute('height') ?? '0'),
        rotation,
        content: node.outerHTML,
        screen,
        style: {},
      });
      break;
    }

    default: {
      if (!NATIVE_SVG_ELEMENTS.has(tagName)) {
        warnings.push(`Skipped unsupported element: <${tagName}>`);
      }

      break;
    }
  }
}

/** Build an import‐safe style object, omitting properties when absent. */
function buildImportStyle(node: Element): ImportedElement['style'] {
  const stroke = node.getAttribute('stroke');
  const fill = node.getAttribute('fill');
  const style: { stroke?: string; fill?: string } = {};

  if (stroke !== null) style.stroke = stroke;
  if (fill !== null) style.fill = fill;

  return style;
}

function parseTransform(transform: string): { readonly x: number; readonly y: number; readonly rotation: number } {
  let x = 0;
  let y = 0;
  let rotation = 0;

  // Parse translate(x, y)
  const translateMatch = /translate\(\s*([\d.e+-]+)\s*[,\s]\s*([\d.e+-]+)\s*\)/.exec(transform);

  if (translateMatch !== null) {
    x = parseFloat(translateMatch[1] ?? '0');
    y = parseFloat(translateMatch[2] ?? '0');
  }

  // Parse rotate(angle)
  const rotateMatch = /rotate\(\s*([\d.e+-]+)/.exec(transform);

  if (rotateMatch !== null) {
    rotation = parseFloat(rotateMatch[1] ?? '0');
  }

  return { x, y, rotation };
}

// ---------------------------------------------------------------------------
// HTML Standalone Export — see html-standalone.ts
// ---------------------------------------------------------------------------

export { exportHtmlStandalone } from './html-standalone';
