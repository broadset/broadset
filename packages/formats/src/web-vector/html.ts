import type { BroadsetDocument, BroadsetElement } from '@broadset/model';

import { escapeXml } from './shared';

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

const PATH_MORPHING_RUNTIME = `
var COMMAND_COORDS = {M:2,m:2,L:2,l:2,H:1,h:1,V:1,v:1,C:6,c:6,S:4,s:4,Q:4,q:4,T:2,t:2,A:7,a:7,Z:0,z:0};
function reassemblePath(segments) {
	return segments.map(function(s) { return s.cmd + s.coords.join(','); }).join(' ');
}`;

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
