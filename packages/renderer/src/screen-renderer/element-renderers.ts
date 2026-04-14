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

      resultPath = firstCombined !== undefined ? firstCombined : [];
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
  host.style.display = 'flex';
  host.style.alignItems = mapVerticalAlignment(element.style.verticalAlignment);
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
        path.setAttribute('stroke', firstChild.style.stroke ?? 'none');
        path.setAttribute('stroke-width', String(firstChild.style.strokeWidth ?? 2));
        path.setAttribute('fill', firstChild.style.fill ?? 'none');
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

function renderImageFallback(host: HTMLElement, element: BroadsetElement): void {
  const placeholder = document.createElement('div');

  placeholder.textContent = element.content.trim() === '' ? 'Image unavailable' : `Image unavailable: ${element.name}`;
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
    renderImageFallback(host, element);

    return;
  }

  const image = document.createElement('img');

  image.src = element.content;
  image.alt = element.name;
  image.style.width = '100%';
  image.style.height = '100%';
  image.style.display = 'block';
  image.style.objectFit = element.style.objectFit ?? 'cover';
  image.addEventListener('error', () => {
    renderImageFallback(host, element);
  });

  host.replaceChildren(image);
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
