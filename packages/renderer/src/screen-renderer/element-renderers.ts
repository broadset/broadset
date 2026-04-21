import type { BroadsetElement, BroadsetElementStyle } from '@broadset/model';
import { sanitizeTextContent } from '@broadset/model';
import { FillRule, pathBoolean, PathBooleanOperation, pathFromPathData, pathToPathData } from 'path-bool';
import qrcode from 'qrcode-generator';

import type { ElementRendererFactory } from './base-render';

// ---------------------------------------------------------------------------
// Text / alignment helpers
// ---------------------------------------------------------------------------

function mapTextAlignment(value: BroadsetElementStyle['textAlignment']): string {
  switch (value) {
    case 'center':
      return 'center';
    case 'right':
      return 'flex-end';
    case 'justify':
      return 'space-between';
    case 'left':
    case undefined:
      return 'flex-start';
  }
}

function mapVerticalAlignment(value: BroadsetElementStyle['verticalAlignment']): string {
  switch (value) {
    case 'middle':
      return 'center';
    case 'bottom':
      return 'flex-end';
    case 'top':
    case undefined:
      return 'flex-start';
  }
}

function formatTickerText(content: string): string {
  try {
    const parsed = JSON.parse(content) as unknown;

    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed.join('   •   ');
    }
  } catch {
    // Fall back to the original string.
  }

  return content;
}

// ---------------------------------------------------------------------------
// Shared simple-renderer factory
// ---------------------------------------------------------------------------

function createSimpleRenderer(update: (host: HTMLElement, element: BroadsetElement) => void): ElementRendererFactory {
  return ({ element, host }) => {
    update(host, element);

    return {
      update(nextElement) {
        update(host, nextElement);
      },
      destroy() {
        host.replaceChildren();
        host.textContent = '';
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Text rendering helpers
// ---------------------------------------------------------------------------

const BR_TAG_RE = /<br\s*\/?>/giu;

function toPlainText(content: string): string {
  const sanitized = sanitizeTextContent(content);
  const container = document.createElement('div');

  // Preserve line-break intent from rich text while decoding entities via DOM parsing.
  container.innerHTML = sanitized.replace(BR_TAG_RE, '\n');

  return container.textContent;
}

function renderPerCharacterSpans(host: HTMLElement, content: string): void {
  const plainText = toPlainText(content);

  host.textContent = '';

  for (let i = 0; i < plainText.length; i += 1) {
    const span = document.createElement('span');

    span.setAttribute('data-char-index', String(i));
    // Preserve visible spacing for single-space spans in per-character text rendering.
    span.style.whiteSpace = 'pre';
    span.textContent = plainText.charAt(i);
    host.appendChild(span);
  }
}

// ---------------------------------------------------------------------------
// Boolean-path and trim-path utilities
// ---------------------------------------------------------------------------

const BOOLEAN_OP_MAP: Readonly<Record<string, PathBooleanOperation>> = {
  union: PathBooleanOperation.Union,
  subtract: PathBooleanOperation.Difference,
  intersect: PathBooleanOperation.Intersection,
  exclude: PathBooleanOperation.Exclusion,
};

/**
 * Compute a combined SVG path string by applying a boolean operation to child paths.
 * Returns `null` if fewer than 2 children have usable path data.
 */
export function computeBooleanPath(children: readonly BroadsetElement[], operation: string): string | null {
  const op = BOOLEAN_OP_MAP[operation];

  if (op === undefined) {
    return null;
  }

  const pathChildren = children.filter((child) => child.type === 'path');
  const pathDataEntries = pathChildren.map((child) => child.content.trim()).filter((d) => d.length > 0);

  if (pathDataEntries.length < 2) {
    return null;
  }

  const firstEntry = pathDataEntries[0];

  if (firstEntry === undefined) {
    return null;
  }

  try {
    let resultPath = pathFromPathData(firstEntry);

    for (let i = 1; i < pathDataEntries.length; i += 1) {
      const entry = pathDataEntries[i];

      if (entry === undefined) {
        continue;
      }

      const nextPath = pathFromPathData(entry);
      const combined = pathBoolean(resultPath, FillRule.NonZero, nextPath, FillRule.NonZero, op);
      const firstCombined = combined[0];

      resultPath = firstCombined ?? [];
    }

    return pathToPathData(resultPath);
  } catch {
    return null;
  }
}

/**
 * Compute `stroke-dasharray` and `stroke-dashoffset` SVG attributes from trim path
 * fractions. Returns `null` when trim values are at their defaults (full stroke visible).
 */
export function computeTrimPathAttributes(
  totalLength: number,
  trimStart: number,
  trimEnd: number,
  trimOffset: number,
): { readonly dasharray: string; readonly dashoffset: string } | null {
  if (totalLength <= 0 || (trimStart === 0 && trimEnd === 1 && trimOffset === 0)) {
    return null;
  }

  const visibleFraction = Math.max(0, trimEnd - trimStart);
  const visibleLength = visibleFraction * totalLength;

  if (visibleLength <= 0) {
    return { dasharray: `0 ${String(totalLength)}`, dashoffset: '0' };
  }

  const gapLength = totalLength - visibleLength;
  const offsetLength = (trimStart + trimOffset) * totalLength;

  return {
    dasharray: `${String(visibleLength)} ${String(gapLength)}`,
    dashoffset: String(-offsetLength),
  };
}

// ---------------------------------------------------------------------------
// QR-code utility
// ---------------------------------------------------------------------------

export function createQrCodeMarkup(payload: string): string | null {
  if (payload.trim() === '') {
    return null;
  }

  const qr = qrcode(0, 'M');

  qr.addData(payload);
  qr.make();

  return qr.createSvgTag({
    scalable: true,
    margin: 0,
  });
}

// ---------------------------------------------------------------------------
// Individual element-type renderers
// ---------------------------------------------------------------------------

const createTextRenderer = createSimpleRenderer((host, element) => {
  renderPerCharacterSpans(host, element.content);
  // Flex-wrap + matching alignContent lets the per-character spans flow onto
  // multiple lines when they exceed the element width while keeping horizontal
  // (justifyContent) and vertical (alignItems single-line / alignContent
  // multi-line) alignment under the element style's control.
  host.style.display = 'flex';
  host.style.flexWrap = 'wrap';
  host.style.alignItems = mapVerticalAlignment(element.style.verticalAlignment);
  host.style.alignContent = mapVerticalAlignment(element.style.verticalAlignment);
  host.style.justifyContent = mapTextAlignment(element.style.textAlignment);
  host.style.wordBreak = 'break-word';
});

function createGroupRenderer(): ElementRendererFactory {
  return ({ document: doc, element, host }) => {
    function render(el: BroadsetElement): void {
      if (el.booleanOperation === null) {
        host.textContent = '';

        return;
      }

      const children = doc.elements.filter((child) => child.parentId === el.id);
      const combinedPath = computeBooleanPath(children, el.booleanOperation);

      if (combinedPath === null) {
        host.textContent = '';

        return;
      }

      const firstChild = children[0];
      const svgNs = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNs, 'svg');
      const path = document.createElementNS(svgNs, 'path');

      svg.setAttribute('viewBox', `0 0 ${String(Math.max(el.width, 1))} ${String(Math.max(el.height, 1))}`);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('overflow', 'visible');
      path.setAttribute('d', combinedPath);
      path.setAttribute('vector-effect', 'non-scaling-stroke');

      if (firstChild !== undefined) {
        const childStyle = firstChild.style;

        path.setAttribute('stroke', childStyle.stroke ?? 'none');
        path.setAttribute('stroke-width', String(childStyle.strokeWidth ?? 2));
        path.setAttribute('fill', childStyle.fill ?? 'none');

        if (childStyle.strokeOpacity !== undefined) {
          path.setAttribute('stroke-opacity', String(childStyle.strokeOpacity));
        }

        if (childStyle.fillOpacity !== undefined) {
          path.setAttribute('fill-opacity', String(childStyle.fillOpacity));
        }

        if (childStyle.strokeLinecap !== undefined) {
          path.setAttribute('stroke-linecap', childStyle.strokeLinecap);
        }

        if (childStyle.strokeLinejoin !== undefined) {
          path.setAttribute('stroke-linejoin', childStyle.strokeLinejoin);
        }

        if (childStyle.fillRule !== undefined) {
          path.setAttribute('fill-rule', childStyle.fillRule);
        }
      }

      svg.appendChild(path);
      host.replaceChildren(svg);
    }

    render(element);

    return {
      update(nextElement) {
        render(nextElement);
      },
      destroy() {
        host.replaceChildren();
        host.textContent = '';
      },
    };
  };
}

const createShapeRenderer = createSimpleRenderer((host, element) => {
  if (element.type === 'group') {
    host.textContent = '';

    return;
  }

  host.textContent = '';
});

function renderMediaPlaceholder(host: HTMLElement, element: BroadsetElement, kind: 'image' | 'video'): void {
  const placeholder = document.createElement('div');
  const label = kind === 'image' ? 'Image' : 'Video';

  placeholder.textContent =
    element.content.trim() === '' ? `${label} unavailable` : `${label} unavailable: ${element.name}`;
  placeholder.setAttribute('aria-label', `${element.name} placeholder`);
  placeholder.style.width = '100%';
  placeholder.style.height = '100%';
  placeholder.style.display = 'flex';
  placeholder.style.alignItems = 'center';
  placeholder.style.justifyContent = 'center';
  placeholder.style.textAlign = 'center';
  placeholder.style.padding = '8px';
  placeholder.style.boxSizing = 'border-box';
  placeholder.style.backgroundColor = 'rgba(15, 23, 42, 0.42)';
  placeholder.style.border = '1px dashed rgba(148, 163, 184, 0.6)';
  placeholder.style.color = '#e2e8f0';
  placeholder.style.fontSize = '12px';
  placeholder.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
  host.replaceChildren(placeholder);
}

const createImageRenderer = createSimpleRenderer((host, element) => {
  if (element.content.trim() === '') {
    renderMediaPlaceholder(host, element, 'image');

    return;
  }

  // Two-phase load:
  //   1. Try with `crossOrigin="anonymous"` so the browser issues a CORS
  //      request. When the server responds with CORS headers (most major
  //      image CDNs do), the `<img>` is non-tainted AND the same URL is
  //      reusable by video/raster exporters from the HTTP cache.
  //   2. If that fails (CORS rejection or network error), fall back to a
  //      plain `<img>` so the image still displays in the editor —
  //      exports of that image will show a placeholder instead.
  const applyStyle = (node: HTMLImageElement): void => {
    node.alt = element.name;
    node.style.width = '100%';
    node.style.height = '100%';
    node.style.display = 'block';
    node.style.objectFit = element.style.objectFit ?? 'cover';
  };

  const corsImage = document.createElement('img');

  corsImage.crossOrigin = 'anonymous';
  applyStyle(corsImage);

  corsImage.addEventListener('error', () => {
    const fallbackImage = document.createElement('img');

    applyStyle(fallbackImage);
    fallbackImage.src = element.content;
    fallbackImage.addEventListener('error', () => {
      renderMediaPlaceholder(host, element, 'image');
    });
    host.replaceChildren(fallbackImage);
  });

  corsImage.src = element.content;
  host.replaceChildren(corsImage);
});

const createSvgRenderer = createSimpleRenderer((host, element) => {
  host.innerHTML = element.content;

  const firstChild = host.firstElementChild;

  if (!(firstChild instanceof SVGElement)) {
    return;
  }

  firstChild.setAttribute('width', '100%');
  firstChild.setAttribute('height', '100%');
  firstChild.setAttribute('preserveAspectRatio', 'xMidYMid meet');
});

const createPathRenderer = createSimpleRenderer((host, element) => {
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNamespace, 'svg');
  const path = document.createElementNS(svgNamespace, 'path');

  svg.setAttribute('viewBox', `0 0 ${String(Math.max(element.width, 1))} ${String(Math.max(element.height, 1))}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  path.setAttribute('d', element.content);
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  path.setAttribute('stroke', element.style.stroke ?? '#f8fafc');
  path.setAttribute('stroke-width', String(element.style.strokeWidth ?? 2));
  path.setAttribute('fill', element.style.fill ?? 'none');

  if (element.style.strokeOpacity !== undefined) {
    path.setAttribute('stroke-opacity', String(element.style.strokeOpacity));
  }

  if (element.style.fillOpacity !== undefined) {
    path.setAttribute('fill-opacity', String(element.style.fillOpacity));
  }

  if (element.style.strokeLinecap !== undefined) {
    path.setAttribute('stroke-linecap', element.style.strokeLinecap);
  }

  if (element.style.strokeLinejoin !== undefined) {
    path.setAttribute('stroke-linejoin', element.style.strokeLinejoin);
  }

  if (element.style.fillRule !== undefined) {
    path.setAttribute('fill-rule', element.style.fillRule);
  }

  if (element.style.strokeDasharray !== undefined) {
    path.setAttribute('stroke-dasharray', element.style.strokeDasharray);
  }

  const trimStart = element.style.trimStart ?? 0;
  const trimEnd = element.style.trimEnd ?? 1;
  const trimOffset = element.style.trimOffset ?? 0;

  if (trimStart !== 0 || trimEnd !== 1 || trimOffset !== 0) {
    const totalLength = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 0;
    const trimAttrs = computeTrimPathAttributes(totalLength, trimStart, trimEnd, trimOffset);

    if (trimAttrs !== null) {
      path.setAttribute('stroke-dasharray', trimAttrs.dasharray);
      path.setAttribute('stroke-dashoffset', trimAttrs.dashoffset);
    }
  }

  svg.appendChild(path);
  host.replaceChildren(svg);
});

const createQrCodeRenderer = createSimpleRenderer((host, element) => {
  const svgMarkup = createQrCodeMarkup(element.content);

  host.innerHTML = svgMarkup ?? '';

  const firstChild = host.firstElementChild;

  if (!(firstChild instanceof SVGElement)) {
    return;
  }

  firstChild.setAttribute('width', '100%');
  firstChild.setAttribute('height', '100%');
  firstChild.setAttribute('preserveAspectRatio', 'xMidYMid meet');
});

const createVideoRenderer = createSimpleRenderer((host, element) => {
  if (element.content.trim() === '') {
    renderMediaPlaceholder(host, element, 'video');

    return;
  }

  const video = document.createElement('video');
  const typeConfig = element.typeConfig;

  video.src = element.content;
  video.muted = typeConfig !== null && 'muted' in typeConfig ? Boolean(typeConfig.muted) : true;
  video.loop = typeConfig !== null && 'loop' in typeConfig ? Boolean(typeConfig.loop) : true;
  video.autoplay = typeConfig !== null && 'autoplay' in typeConfig ? Boolean(typeConfig.autoplay) : false;
  video.playsInline = true;
  video.controls = false;
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.display = 'block';
  video.style.objectFit = element.style.objectFit ?? 'cover';

  host.replaceChildren(video);
});

const createClockRenderer = createSimpleRenderer((host, element) => {
  host.textContent = element.content === '' ? '00:00:00' : element.content;
  host.style.display = 'flex';
  host.style.alignItems = 'center';
  host.style.justifyContent = mapTextAlignment(element.style.textAlignment);
});

const createTickerRenderer = createSimpleRenderer((host, element) => {
  host.textContent = formatTickerText(element.content);
  host.style.display = 'flex';
  host.style.alignItems = 'center';
  host.style.justifyContent = 'flex-start';
  host.style.paddingLeft = '16px';
  host.style.paddingRight = '16px';
  host.style.textOverflow = 'ellipsis';
  host.style.overflow = 'hidden';
});

// ---------------------------------------------------------------------------
// Registry and fallback
// ---------------------------------------------------------------------------

export const BUILT_IN_RENDERERS: Readonly<Record<string, ElementRendererFactory>> = {
  text: createTextRenderer,
  image: createImageRenderer,
  svg: createSvgRenderer,
  path: createPathRenderer,
  rectangle: createShapeRenderer,
  ellipse: createShapeRenderer,
  qrcode: createQrCodeRenderer,
  group: createGroupRenderer(),
  video: createVideoRenderer,
  clock: createClockRenderer,
  ticker: createTickerRenderer,
};

export function createFallbackRenderer(type: string): ElementRendererFactory {
  return createSimpleRenderer((host, element) => {
    host.textContent = `Unsupported element type: ${element.type === '' ? type : element.type}`;
    host.style.display = 'flex';
    host.style.alignItems = 'center';
    host.style.justifyContent = 'center';
    host.style.padding = '8px';
    host.style.fontFamily = 'ui-monospace, SFMono-Regular, monospace';
    host.style.fontSize = '12px';
    host.style.border = '1px dashed rgba(148, 163, 184, 0.6)';
    host.style.backgroundColor = 'rgba(15, 23, 42, 0.42)';
  });
}
