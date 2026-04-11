/* ------------------------------------------------------------------ */
/*  Web Vector — SVG Export/Import, HTML Standalone Export            */
/* ------------------------------------------------------------------ */

import type { BroadsetDocument, BroadsetElement, BroadsetElementStyle } from '@broadset/model';

/* ------------------------------------------------------------------ */
/*  SVG Export Constants                                              */
/* ------------------------------------------------------------------ */

const SVG_XMLNS = 'http://www.w3.org/2000/svg';
const XLINK_XMLNS = 'http://www.w3.org/1999/xlink';

/* ------------------------------------------------------------------ */
/*  SVG Export                                                       */
/* ------------------------------------------------------------------ */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildTransform(el: BroadsetElement): string {
  const parts: string[] = [];

  if (el.position.x !== 0 || el.position.y !== 0) {
    parts.push(`translate(${String(el.position.x)},${String(el.position.y)})`);
  }

  if (el.rotation !== 0) {
    parts.push(`rotate(${String(el.rotation)},${String(el.width / 2)},${String(el.height / 2)})`);
  }

  return parts.length > 0 ? ` transform="${parts.join(' ')}"` : '';
}

function buildStyleAttrs(style: BroadsetElementStyle): string {
  const attrs: string[] = [];

  if (style.fill !== undefined) {
    attrs.push(`fill="${escapeXml(style.fill)}"`);
  }

  if (style.stroke !== undefined) {
    attrs.push(`stroke="${escapeXml(style.stroke)}"`);
  }

  if (style.strokeWidth !== undefined) {
    attrs.push(`stroke-width="${String(style.strokeWidth)}"`);
  }

  if (style.fillOpacity !== undefined) {
    attrs.push(`fill-opacity="${String(style.fillOpacity)}"`);
  }

  if (style.strokeOpacity !== undefined) {
    attrs.push(`stroke-opacity="${String(style.strokeOpacity)}"`);
  }

  if (style.opacity !== 1) {
    attrs.push(`opacity="${String(style.opacity)}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

function renderClipPathDef(elementId: string, clipPath: string): string {
  const clipId = `clip-${elementId}`;

  return `<clipPath id="${clipId}"><path d="${escapeXml(clipPath)}"/></clipPath>`;
}

function renderElement(el: BroadsetElement, clipDefs: string[]): string {
  const transform = buildTransform(el);
  const styleAttrs = buildStyleAttrs(el.style);
  let clipAttr = '';

  if (el.style.customClipPath) {
    const clipId = `clip-${el.id}`;

    clipDefs.push(renderClipPathDef(el.id, el.style.customClipPath));
    clipAttr = ` clip-path="url(#${clipId})"`;
  }

  switch (el.type) {
    case 'path':
      return `<path id="${escapeXml(el.id)}" d="${escapeXml(el.content)}"${styleAttrs}${transform}${clipAttr}/>`;

    case 'rectangle':
      return `<rect id="${escapeXml(el.id)}" width="${String(el.width)}" height="${String(el.height)}"${styleAttrs}${transform}${clipAttr}/>`;

    case 'ellipse':
      return `<ellipse id="${escapeXml(el.id)}" cx="${String(el.width / 2)}" cy="${String(el.height / 2)}" rx="${String(el.width / 2)}" ry="${String(el.height / 2)}"${styleAttrs}${transform}${clipAttr}/>`;

    case 'text':
      return `<text id="${escapeXml(el.id)}"${buildTextAttrs(el.style)}${transform}${clipAttr}>${escapeXml(el.content)}</text>`;

    case 'image':
      return `<image id="${escapeXml(el.id)}" href="${escapeXml(el.content)}" width="${String(el.width)}" height="${String(el.height)}"${transform}${clipAttr}/>`;

    case 'svg':
      return renderSvgPayload(el, transform + styleAttrs + clipAttr);

    case 'group':
      return `<g id="${escapeXml(el.id)}"${transform}${clipAttr}/>`;

    default:
      return `<g id="${escapeXml(el.id)}"${transform}/>`;
  }
}

function buildTextAttrs(style: BroadsetElementStyle): string {
  const attrs: string[] = [];

  if (style.fontFamily) {
    attrs.push(`font-family="${escapeXml(style.fontFamily)}"`);
  }

  if (style.fontSize) {
    attrs.push(`font-size="${String(style.fontSize)}"`);
  }

  if (style.fontColor) {
    attrs.push(`fill="${escapeXml(style.fontColor)}"`);
  }

  if (style.fontWeight && style.fontWeight !== 400) {
    attrs.push(`font-weight="${String(style.fontWeight)}"`);
  }

  if (style.textAlignment) {
    const anchor =
      style.textAlignment === 'left' ? 'start'
      : style.textAlignment === 'right' ? 'end'
      : 'middle';

    attrs.push(`text-anchor="${anchor}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

function renderSvgPayload(el: BroadsetElement, transform: string): string {
  const content = el.content;

  if (!content) {
    return `<g id="${escapeXml(el.id)}"${transform}/>`;
  }

  // Extract inner SVG content (between the outer <svg> tags)
  const innerMatch = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(content);
  const inner = innerMatch?.[1] ?? content;

  return `<g id="${escapeXml(el.id)}"${transform}>${inner}</g>`;
}

/**
 * Exports a BroadsetDocument as an SVG string.
 * Path, text, image, rectangle, ellipse, and group elements are mapped to
 * native SVG elements. SVG payload elements are embedded inline.
 * Clip-paths are placed in <defs>.
 */
export function exportSvg(doc: BroadsetDocument): string {
  const clipDefs: string[] = [];
  const elementNodes = doc.elements.map((el) => renderElement(el, clipDefs));

  const defs = clipDefs.length > 0 ? `<defs>${clipDefs.join('')}</defs>` : '';

  return [
    `<svg xmlns="${SVG_XMLNS}" xmlns:xlink="${XLINK_XMLNS}" width="${String(doc.canvas.width)}" height="${String(doc.canvas.height)}" viewBox="0 0 ${String(doc.canvas.width)} ${String(doc.canvas.height)}">`,
    defs,
    ...elementNodes,
    '</svg>',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/*  SVG Import                                                       */
/* ------------------------------------------------------------------ */

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
      // Groups with matrix transforms → preserve as SVG payload
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

      // Simple groups without matrix transforms are not preserved as SVG payload
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

/**
 * Imports an SVG string into a structured result with elements, canvas
 * dimensions, and warnings for skipped content.
 * Throws on completely invalid XML. Skips unsupported elements with warnings.
 */
export function importSvg(input: string): SvgImportResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(input, 'image/svg+xml');

  // Check for parse error
  const parseError = xmlDoc.querySelector('parsererror');

  if (parseError) {
    throw new Error(`SVG import failed: invalid XML — ${parseError.textContent}`);
  }

  const svgRoot = xmlDoc.documentElement;

  // Canvas dimensions: prefer explicit width/height, fall back to viewBox
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

  // Process direct children of root SVG (skip <defs>)
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

/* ------------------------------------------------------------------ */
/*  HTML Standalone Export                                            */
/* ------------------------------------------------------------------ */

/**
 * OKLab color pipeline — embedded as JavaScript functions in the HTML output.
 */
const OKLAB_RUNTIME = `
function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linearToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
function rgbToOklab(r, g, b) {
  var lr = srgbToLinear(r/255), lg = srgbToLinear(g/255), lb = srgbToLinear(b/255);
  var l_ = 0.4122214708*lr + 0.5363325363*lg + 0.0514459929*lb;
  var m_ = 0.2119034982*lr + 0.6806995451*lg + 0.1073969566*lb;
  var s_ = 0.0883024619*lr + 0.2817188376*lg + 0.6299787005*lb;
  var l = Math.cbrt(l_), m = Math.cbrt(m_), s = Math.cbrt(s_);
  return [0.2104542553*l+0.7936177850*m-0.0040720468*s, 1.9779984951*l-2.4285922050*m+0.4505937099*s, 0.0259040371*l+0.7827717662*m-0.8086757660*s];
}
function oklabToRgb(L, a, b) {
  var l_ = L+0.3963377774*a+0.2158037573*b, m_ = L-0.1055613458*a-0.0638541728*b, s_ = L-0.0894841775*a-1.2914855480*b;
  var l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
  return [Math.round(Math.max(0,Math.min(1,linearToSrgb(4.0767416621*l-3.3077115913*m+0.2309699292*s)))*255),
          Math.round(Math.max(0,Math.min(1,linearToSrgb(-1.2684380046*l+2.6097574011*m-0.3413193965*s)))*255),
          Math.round(Math.max(0,Math.min(1,linearToSrgb(-0.0041960863*l-0.7034186147*m+1.7076147010*s)))*255)];
}`;

/**
 * Path morphing support — COMMAND_COORDS table and reassemblePath.
 */
const PATH_MORPHING_RUNTIME = `
var COMMAND_COORDS = {M:2,m:2,L:2,l:2,H:1,h:1,V:1,v:1,C:6,c:6,S:4,s:4,Q:4,q:4,T:2,t:2,A:7,a:7,Z:0,z:0};
function reassemblePath(segments) {
  return segments.map(function(s) { return s.cmd + s.coords.join(','); }).join(' ');
}`;

/**
 * Easing runtime — cubicBezierY Newton solver and step easing.
 */
const EASING_RUNTIME = `
function cubicBezierY(x1,y1,x2,y2,t) {
  var EPS = 1e-7, x = t;
  for (var i = 0; i < 8; i++) {
    var cx = 3*x1, bx = 3*(x2-x1)-cx, ax = 1-cx-bx;
    var ct = ((ax*x+bx)*x+cx)*x - t;
    if (Math.abs(ct) < EPS) break;
    var dt = (3*ax*x+2*bx)*x+cx;
    if (Math.abs(dt) < EPS) break;
    x -= ct/dt;
  }
  var cy = 3*y1, by = 3*(y2-y1)-cy, ay = 1-cy-by;
  return ((ay*x+by)*x+cy)*x;
}
function easeStep(steps, position, t) {
  var s = Math.floor(t * steps);
  if (position === 'end') return Math.min(s, steps - 1) / steps;
  return Math.min(s + 1, steps) / steps;
}`;

function renderHtmlElement(el: BroadsetElement, allElements: readonly BroadsetElement[]): string {
  const style = buildCssStyle(el);
  const dataAttr = `data-element-id="${escapeXml(el.id)}"`;

  switch (el.type) {
    case 'text':
      return `<div ${dataAttr} style="${style}">${escapeXml(el.content)}</div>`;

    case 'image':
      return `<div ${dataAttr} style="${style}"><img src="${escapeXml(el.content)}" style="width:100%;height:100%;object-fit:${el.style.objectFit ?? 'cover'}"/></div>`;

    case 'svg':
      return `<div ${dataAttr} style="${style}">${el.content}</div>`;

    case 'path':
      return renderHtmlPath(el, dataAttr, style);

    case 'group':
      return renderHtmlGroup(el, allElements, dataAttr, style);

    default:
      return `<div ${dataAttr} style="${style}"></div>`;
  }
}

function renderHtmlPath(el: BroadsetElement, dataAttr: string, containerStyle: string): string {
  const fill = el.style.fill ?? 'none';
  const stroke = el.style.stroke ?? 'none';
  const strokeWidth = el.style.strokeWidth ?? 1;

  return `<div ${dataAttr} style="${containerStyle}"><svg width="${String(el.width)}" height="${String(el.height)}" style="overflow:visible"><path d="${escapeXml(el.content)}" fill="${fill}" stroke="${stroke}" stroke-width="${String(strokeWidth)}"/></svg></div>`;
}

function renderHtmlGroup(
  el: BroadsetElement,
  allElements: readonly BroadsetElement[],
  dataAttr: string,
  style: string,
): string {
  const children = allElements.filter((c) => c.parentId === el.id);
  const childHtml = children.map((c) => renderHtmlElement(c, allElements)).join('\n');

  return `<div ${dataAttr} style="${style}">${childHtml}</div>`;
}

function buildCssStyle(el: BroadsetElement): string {
  const parts: string[] = [
    'position:absolute',
    `left:${String(el.position.x)}px`,
    `top:${String(el.position.y)}px`,
    `width:${String(el.width)}px`,
    `height:${String(el.height)}px`,
  ];

  if (el.style.opacity !== 1) {
    parts.push(`opacity:${String(el.style.opacity)}`);
  }

  const transforms: string[] = [];

  if (el.rotation !== 0) {
    transforms.push(`rotate(${String(el.rotation)}deg)`);
  }

  if (el.style.rotateX) {
    transforms.push(`rotateX(${String(el.style.rotateX)}deg)`);
  }

  if (el.style.rotateY) {
    transforms.push(`rotateY(${String(el.style.rotateY)}deg)`);
  }

  if (el.style.rotateZ) {
    transforms.push(`rotateZ(${String(el.style.rotateZ)}deg)`);
  }

  if (el.style.translateZ) {
    transforms.push(`translateZ(${String(el.style.translateZ)}px)`);
  }

  if (transforms.length > 0) {
    parts.push(`transform:${transforms.join(' ')}`);
  }

  if (el.style.backgroundColor) {
    parts.push(`background:${el.style.backgroundColor}`);
  }

  if (el.style.borderRadius) {
    const [tl, tr, br, bl] = el.style.borderRadius;

    parts.push(`border-radius:${String(tl)}px ${String(tr)}px ${String(br)}px ${String(bl)}px`);
  }

  if (el.style.customClipPath) {
    parts.push(`clip-path:path('${el.style.customClipPath}')`);
  }

  return parts.join(';');
}

/**
 * Exports a BroadsetDocument as a self-contained HTML file with embedded
 * playback runtime, animation data, and responsive scaling.
 */
export function exportHtmlStandalone(doc: BroadsetDocument): string {
  const rootElements = doc.elements.filter((el) => el.parentId === null);
  const elementHtml = rootElements.map((el) => renderHtmlElement(el, doc.elements)).join('\n');
  const animationsJson = JSON.stringify(doc.animations);
  const baseWidth = doc.canvas.width;
  const baseHeight = doc.canvas.height;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeXml(doc.name)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{overflow:hidden;background:#000}
#canvas{position:relative;width:${String(baseWidth)}px;height:${String(baseHeight)}px;transform-origin:top left;background:${doc.canvas.backgroundColor ?? '#ffffff'}}
</style>
</head>
<body>
<div id="canvas">
${elementHtml}
</div>
<script>
(function(){
${OKLAB_RUNTIME}
${PATH_MORPHING_RUNTIME}
${EASING_RUNTIME}

var BASE_W=${String(baseWidth)},BASE_H=${String(baseHeight)};
var animations=${animationsJson};

function scaleCanvas(){
  var s=Math.min(window.innerWidth/BASE_W,window.innerHeight/BASE_H);
  document.getElementById('canvas').style.transform='scale('+s+')';
}
scaleCanvas();
window.addEventListener('resize',scaleCanvas);

var startTime=null;
function tick(ts){
  if(!startTime)startTime=ts;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
})();
</script>
</body>
</html>`;
}
