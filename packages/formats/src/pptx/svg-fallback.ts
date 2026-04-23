import {
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetGradient,
  colorToCss,
  getGradientFillGradient,
  getSolidFillColor,
  resolveStyleColor,
} from '@broadset/model';

function buildSvgGradientDef(grad: BroadsetGradient, id: string): string {
  const stops = grad.stops
    .map((s) => `<stop offset="${String(s.position * 100)}%" stop-color="${colorToCss(s.color)}"/>`)
    .join('');

  if (grad.type === 'radial') {
    const cx = grad.center ? String(grad.center[0] * 100) : '50';
    const cy = grad.center ? String(grad.center[1] * 100) : '50';

    return `<radialGradient id="${id}" cx="${cx}%" cy="${cy}%">${stops}</radialGradient>`;
  }

  const angle = grad.angle ?? 0;
  const rad = (angle * Math.PI) / 180;
  const x2 = Math.round(Math.cos(rad) * 100);
  const y2 = Math.round(Math.sin(rad) * 100);

  return `<linearGradient id="${id}" x1="0%" y1="0%" x2="${String(x2)}%" y2="${String(y2)}%">${stops}</linearGradient>`;
}

export function needsSvgFallback(style: BroadsetElementStyle): boolean {
  if (style.fill.kind === 'gradient') {
    return true;
  }

  if (style.borderRadius) {
    const [a, b, c, d] = style.borderRadius;

    if (a !== b || b !== c || c !== d) {
      return true;
    }
  }

  if (style.boxShadow) {
    return true;
  }

  if (style.filter) {
    return true;
  }

  return false;
}

export function buildSvgForElement(el: BroadsetElement): string {
  const w = el.width;
  const h = el.height;
  const style = el.style;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(w)}" height="${String(h)}" viewBox="0 0 ${String(w)} ${String(h)}">`,
  ];

  const defs: string[] = [];
  let fill = 'none';

  const gradient = getGradientFillGradient(style.fill);

  if (gradient !== undefined) {
    const gradId = 'grad0';

    defs.push(buildSvgGradientDef(gradient, gradId));
    fill = `url(#${gradId})`;
  } else {
    const backgroundCss = resolveStyleColor(getSolidFillColor(style.fill), { resolveTheme: false });

    if (backgroundCss !== undefined) {
      fill = backgroundCss;
    }
  }

  if (defs.length > 0) {
    parts.push(`  <defs>${defs.join('')}</defs>`);
  }

  const rectAttrs: string[] = [`width="${String(w)}"`, `height="${String(h)}"`, `fill="${fill}"`];

  if (style.borderRadius) {
    const [tl] = style.borderRadius;

    rectAttrs.push(`rx="${String(tl)}"`);
  }

  parts.push(`  <rect ${rectAttrs.join(' ')}/>`);
  parts.push('</svg>');

  return parts.join('\n');
}
