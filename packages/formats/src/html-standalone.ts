import type { BroadsetDocument, PageElement } from '@broadset/model';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ExportElement = PageElement;

function getScreenProp(el: ExportElement, key: string): unknown {
  return el.screen?.[key];
}

function getStyleProp(el: ExportElement, key: string): unknown {
  return el.style?.[key];
}

function getOpacity(el: ExportElement): number {
  const v = getStyleProp(el, 'opacity');

  return typeof v === 'number' ? v : 1;
}

// ---------------------------------------------------------------------------
// HTML Standalone Export
// ---------------------------------------------------------------------------

/**
 * Generates a self-contained HTML document with embedded playback runtime,
 * serialized animation registry, and element markup.
 */
export function exportHtmlStandalone(doc: BroadsetDocument): string {
  const { canvas, animationRegistry } = doc;
  const elements = doc.pages[0]?.elements ?? [];

  const elementMarkup = elements.map((el) => renderHtmlElement(el, elements)).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Broadset Export</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #000; }
    #canvas {
      position: absolute;
      width: ${String(canvas.width)}px;
      height: ${String(canvas.height)}px;
      transform-origin: top left;
      background: #ffffff;
    }
  </style>
</head>
<body>
  <div id="canvas">
    ${elementMarkup}
  </div>
  <script>
    // -----------------------------------------------------------------------
    // Animation Registry
    // -----------------------------------------------------------------------
    const ANIMATION_REGISTRY = ${JSON.stringify(animationRegistry).replace(/</g, '\\u003c')};
    const BASE_WIDTH = ${String(canvas.width)};
    const BASE_HEIGHT = ${String(canvas.height)};

    // -----------------------------------------------------------------------
    // Viewport Scaling
    // -----------------------------------------------------------------------
    function scaleCanvas() {
      const canvas = document.getElementById('canvas');
      const scaleX = window.innerWidth / BASE_WIDTH;
      const scaleY = window.innerHeight / BASE_HEIGHT;
      const scale = Math.min(scaleX, scaleY);
      canvas.style.transform = 'scale(' + scale + ')';
    }
    window.addEventListener('resize', scaleCanvas);
    scaleCanvas();

    // -----------------------------------------------------------------------
    // OKLab Color Interpolation Pipeline
    // -----------------------------------------------------------------------
    function srgbToLinear(c) {
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    function linearToSrgb(c) {
      return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    }
    function rgbToOklab(r, g, b) {
      var lr = srgbToLinear(r / 255);
      var lg = srgbToLinear(g / 255);
      var lb = srgbToLinear(b / 255);
      var l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
      var m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
      var s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
      return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
      ];
    }
    function oklabToRgb(L, a, b) {
      var l = L + 0.3963377774 * a + 0.2158037573 * b;
      var m = L - 0.1055613458 * a - 0.0638541728 * b;
      var s = L - 0.0894841775 * a - 1.2914855480 * b;
      l = l * l * l; m = m * m * m; s = s * s * s;
      var r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
      var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
      var b2 = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
      return [
        Math.round(Math.max(0, Math.min(255, linearToSrgb(r) * 255))),
        Math.round(Math.max(0, Math.min(255, linearToSrgb(g) * 255))),
        Math.round(Math.max(0, Math.min(255, linearToSrgb(b2) * 255)))
      ];
    }

    // -----------------------------------------------------------------------
    // SVG Path Morphing
    // -----------------------------------------------------------------------
    var COMMAND_COORDS = {
      M: 2, m: 2, L: 2, l: 2, H: 1, h: 1, V: 1, v: 1,
      C: 6, c: 6, S: 4, s: 4, Q: 4, q: 4, T: 2, t: 2,
      A: 7, a: 7, Z: 0, z: 0
    };

    function reassemblePath(commands, coords) {
      var result = '';
      var ci = 0;
      for (var i = 0; i < commands.length; i++) {
        var cmd = commands[i];
        var count = COMMAND_COORDS[cmd] || 0;
        result += cmd;
        for (var j = 0; j < count; j++) {
          if (j > 0) result += ',';
          result += coords[ci++];
        }
      }
      return result;
    }

    // -----------------------------------------------------------------------
    // Easing Functions
    // -----------------------------------------------------------------------
    function cubicBezierY(x1, y1, x2, y2, t) {
      // Newton-Raphson solver for cubic bezier
      var x = t;
      for (var i = 0; i < 8; i++) {
        var cx = 3 * x1;
        var bx = 3 * (x2 - x1) - cx;
        var ax = 1 - cx - bx;
        var currentX = ((ax * x + bx) * x + cx) * x;
        var currentSlope = (3 * ax * x + 2 * bx) * x + cx;
        if (Math.abs(currentX - t) < 1e-7) break;
        if (Math.abs(currentSlope) < 1e-7) break;
        x = x - (currentX - t) / currentSlope;
      }
      var cy = 3 * y1;
      var by = 3 * (y2 - y1) - cy;
      var ay = 1 - cy - by;
      return ((ay * x + by) * x + cy) * x;
    }

    function easeStep(t) {
      return t >= 1 ? 1 : 0;
    }

    // -----------------------------------------------------------------------
    // Animation Loop
    // -----------------------------------------------------------------------
    if (ANIMATION_REGISTRY.length > 0) {
      var startTime = null;
      function tick(now) {
        if (!startTime) startTime = now;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// HTML Element Rendering
// ---------------------------------------------------------------------------

function renderHtmlElement(el: ExportElement, allElements: readonly ExportElement[]): string {
  const cssProps: string[] = [
    `position: absolute`,
    `left: ${String(el.position.x)}px`,
    `top: ${String(el.position.y)}px`,
    `width: ${String(el.width)}px`,
    `height: ${String(el.height)}px`,
  ];

  if (el.rotation !== 0) {
    cssProps.push(`transform: rotate(${String(el.rotation)}deg)`);
  }

  // 3D transforms from screen props
  const transforms3d: string[] = [];
  const rotateX = getScreenProp(el, 'rotateX');
  const rotateY = getScreenProp(el, 'rotateY');
  const translateZ = getScreenProp(el, 'translateZ');

  if (typeof rotateX === 'number' && rotateX !== 0) transforms3d.push(`rotateX(${String(rotateX)}deg)`);
  if (typeof rotateY === 'number' && rotateY !== 0) transforms3d.push(`rotateY(${String(rotateY)}deg)`);
  if (typeof translateZ === 'number' && translateZ !== 0) transforms3d.push(`translateZ(${String(translateZ)}px)`);

  if (transforms3d.length > 0) {
    const existingTransform = el.rotation !== 0 ? `rotate(${String(el.rotation)}deg) ` : '';

    cssProps.pop(); // Remove the previous transform if any
    cssProps.push(`transform: ${existingTransform}${transforms3d.join(' ')}`);
  }

  const opacity = getOpacity(el);
  const bg = getStyleProp(el, 'backgroundColor');
  const clipPath = getScreenProp(el, 'customClipPath');
  const boxShadow = getStyleProp(el, 'boxShadow');
  const filter = getStyleProp(el, 'filter');
  const backdropFilter = getStyleProp(el, 'backdropFilter');
  const clipChildren = getScreenProp(el, 'clipChildren');

  if (opacity !== 1) cssProps.push(`opacity: ${String(opacity)}`);
  if (typeof bg === 'string') cssProps.push(`background-color: ${bg}`);
  if (typeof clipPath === 'string' && clipPath !== '') cssProps.push(`clip-path: ${clipPath}`);
  if (typeof boxShadow === 'string') cssProps.push(`box-shadow: ${boxShadow}`);
  if (typeof filter === 'string') cssProps.push(`filter: ${filter}`);
  if (typeof backdropFilter === 'string') cssProps.push(`backdrop-filter: ${backdropFilter}`);
  if (clipChildren === true) cssProps.push(`overflow: hidden`);

  const styleAttr = cssProps.join('; ');

  // Children (for groups)
  const children = allElements.filter((c) => c.parentId === el.id);
  const childrenHtml = children.map((c) => renderHtmlElement(c, allElements)).join('\n');

  let innerContent = '';
  const stroke = getStyleProp(el, 'stroke');
  const fill = getStyleProp(el, 'fill');

  switch (el.type) {
    case 'text':
      innerContent = escapeHtml(el.content);
      break;
    case 'image':
      innerContent = `<img src="${escapeHtml(el.content)}" style="width:100%;height:100%;object-fit:cover" alt="" />`;
      break;
    case 'svg':
    case 'path':
      innerContent =
        el.type === 'path' ?
          `<svg width="100%" height="100%" viewBox="0 0 ${String(el.width)} ${String(el.height)}"><path d="${el.content}" ${typeof stroke === 'string' ? `stroke="${stroke}"` : ''} ${typeof fill === 'string' ? `fill="${fill}"` : 'fill="none"'} /></svg>`
        : `<svg width="100%" height="100%">${el.content}</svg>`;
      break;
    default:
      break;
  }

  return `<div data-element-id="${el.id}" style="${styleAttr}">${innerContent}${childrenHtml}</div>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
