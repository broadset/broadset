import type { projectFormatV1 } from '@broadset/model';

import { applyStyleV1, pluginRendererKeyV1, type ResolvedElementDomOptionsV1 } from './element-dom';
import { formatCssNumber } from './paint-css';
import { spatialValueToCssPixelsV1 } from './physical-units';
import { createQrCodeSvgV1 } from './qr-svg';
import { paragraphToStyle, runToStyleV1 } from './text-css';
import { BOOLEAN_OPERAND_BUDGET_V1, createBooleanSvgV1, createLayeredVectorSvgV1 } from './vector-svg';

const FULL_SIZE = '100%';
const TICKER_DOM_ITEM_BUDGET = 64;
const CONTENT_CLEANUPS = new WeakMap<HTMLElement, () => void>();

interface ElementContentOptionsV1 extends ResolvedElementDomOptionsV1 {
  readonly content: HTMLElement;
}

function pixels(value: number, options: ResolvedElementDomOptionsV1): string {
  return `${formatCssNumber(spatialValueToCssPixelsV1(value, options.units))}px`;
}

function fallback(document: Document, message: string): HTMLElement {
  const node = document.createElement('div');

  node.className = 'broadset-render-fallback';
  node.setAttribute('role', 'img');
  node.textContent = message;

  return node;
}

function imageFallback(document: Document, message: string, fit: string): HTMLElement {
  const node = fallback(document, message);

  applyStyleV1(node, { height: FULL_SIZE, objectFit: fit, width: FULL_SIZE });

  return node;
}

function resolveAsset(options: ResolvedElementDomOptionsV1, assetId: projectFormatV1.Id): ResolvedRenderAsset {
  try {
    const result = options.context.resolveAsset(assetId);

    return result.status === 'ready' && result.url.length > 0 ?
        { status: 'ready', url: result.url }
      : { status: 'missing', diagnostic: result.status === 'missing' ? result.diagnostic : 'Asset unavailable' };
  } catch {
    return { status: 'missing', diagnostic: 'Asset unavailable' };
  }
}

type ResolvedRenderAsset =
  | { readonly status: 'ready'; readonly url: string }
  | { readonly status: 'missing'; readonly diagnostic: string };

function appendImage(options: ElementContentOptionsV1, assetId: projectFormatV1.Id, fit: string, alt: string): void {
  const domDocument = options.context.document ?? globalThis.document;
  const asset = resolveAsset(options, assetId);

  if (asset.status === 'missing') {
    options.content.append(imageFallback(domDocument, asset.diagnostic, fit));

    return;
  }

  const image = domDocument.createElement('img');

  image.src = asset.url;
  image.alt = alt;
  applyStyleV1(image, { width: FULL_SIZE, height: FULL_SIZE, objectFit: fit });
  image.addEventListener(
    'error',
    () => {
      image.replaceWith(imageFallback(domDocument, 'Image could not be displayed', fit));
    },
    { once: true },
  );
  options.content.append(image);
}

function appendText(options: ElementContentOptionsV1, element: projectFormatV1.TextElement): void {
  const domDocument = options.context.document ?? globalThis.document;
  const padding = element.layout.padding ?? [0, 0, 0, 0];

  applyStyleV1(options.content, {
    boxSizing: 'border-box',
    height: FULL_SIZE,
    width: FULL_SIZE,
    columnCount: String(element.layout.columns),
    columnGap: pixels(element.layout.columnGap, options),
    padding: padding.map((value) => pixels(value, options)).join(' '),
    overflow: element.layout.overflow === 'visible' ? 'visible' : 'hidden',
  });

  for (const paragraph of element.text.paragraphs) {
    const paragraphNode = domDocument.createElement('div');

    applyStyleV1(paragraphNode, paragraphToStyle(paragraph.properties, options.units));

    for (const run of paragraph.runs) {
      const span = domDocument.createElement('span');

      applyStyleV1(
        span,
        runToStyleV1({
          run: run.properties,
          fonts: options.context.fonts,
          swatches: options.context.swatches,
          units: options.units,
        }),
      );
      span.textContent = run.text;
      paragraphNode.append(span);
    }

    options.content.append(paragraphNode);
  }
}

function appendVector(options: ElementContentOptionsV1, element: projectFormatV1.VectorElement): void {
  const domDocument = options.context.document ?? globalThis.document;

  if (element.geometryData.kind === 'boolean') {
    if (element.geometryData.operandIds.length > BOOLEAN_OPERAND_BUDGET_V1) {
      options.content.append(fallback(domDocument, 'Boolean operand budget exceeded'));

      return;
    }

    if (options.vectorOperandDiagnostic !== undefined) {
      options.content.append(fallback(domDocument, options.vectorOperandDiagnostic));

      return;
    }

    const operands: projectFormatV1.VectorElement[] = [];

    for (const operandId of element.geometryData.operandIds) {
      const operand = options.vectorOperands?.get(operandId);

      if (operand === undefined) {
        options.content.append(fallback(domDocument, 'Boolean operand missing'));

        return;
      }

      operands.push(operand);
    }

    const svg = createBooleanSvgV1({
      document: domDocument,
      element,
      operands,
      operandMap: options.vectorOperands,
      backgroundImage: options.content.style.backgroundImage,
      backgroundBlendMode: options.content.style.backgroundBlendMode,
      context: options.context,
      units: options.units,
    });

    options.content.style.removeProperty('background-image');
    options.content.style.removeProperty('background-blend-mode');
    options.content.append(svg ?? fallback(domDocument, 'Boolean operands unavailable'));

    return;
  }

  const svg = createLayeredVectorSvgV1({
    document: domDocument,
    element,
    context: options.context,
    units: options.units,
    width: options.node.localGeometry.bounds.width,
    height: options.node.localGeometry.bounds.height,
    backgroundImage: options.content.style.backgroundImage,
    backgroundBlendMode: options.content.style.backgroundBlendMode,
  });

  options.content.style.removeProperty('background-image');
  options.content.style.removeProperty('background-blend-mode');
  options.content.append(svg ?? fallback(domDocument, 'Vector geometry unavailable'));
}

function appendMedia(
  options: ElementContentOptionsV1,
  element: projectFormatV1.VideoElement | projectFormatV1.AudioElement,
): void {
  const domDocument = options.context.document ?? globalThis.document;
  const payload = element.kind === 'video' ? element.video : element.audio;
  const asset = resolveAsset(options, payload.assetId);

  if (asset.status === 'missing') {
    options.content.append(fallback(domDocument, asset.diagnostic));

    return;
  }

  const media = domDocument.createElement(element.kind);

  media.src = asset.url;
  media.autoplay = payload.autoplay;
  media.loop = payload.loop;
  media.addEventListener(
    'error',
    () => {
      media.replaceWith(fallback(domDocument, 'Media could not be displayed'));
    },
    { once: true },
  );

  if (element.kind === 'video') {
    media.muted = element.video.muted;
    media.style.setProperty('object-fit', element.video.fit);
    media.style.setProperty('width', FULL_SIZE);
    media.style.setProperty('height', FULL_SIZE);
  } else {
    media.volume = element.audio.volume;
  }

  options.content.append(media);
}

function tickerFlexDirection(horizontal: boolean, positive: boolean): string {
  if (horizontal) return positive ? 'row-reverse' : 'row';

  return positive ? 'column-reverse' : 'column';
}

function setTickerItem(span: HTMLElement, item: projectFormatV1.TickerItem): void {
  span.dataset['tickerItemId'] = item.id;
  span.textContent = item.text;
}

function ensureTickerCoverage(options: {
  readonly content: HTMLElement;
  readonly track: HTMLElement;
  readonly items: readonly projectFormatV1.TickerItem[];
  readonly repeat: boolean;
  readonly horizontal: boolean;
  readonly itemExtent: (item: Element) => number;
  readonly document: Document;
  readonly motion: { nextItemIndex: number };
}): boolean {
  if (!options.repeat) return true;

  const contentRect = options.content.getBoundingClientRect();
  const viewport = options.horizontal ? contentRect.width : contentRect.height;

  if (viewport <= 0) return true;

  let children = Array.from(options.track.children);
  let coverage = children.reduce((total, item) => total + options.itemExtent(item), 0);
  let trailingExtent = children.length === 0 ? 0 : options.itemExtent(children[children.length - 1] ?? options.track);

  while (coverage < viewport + trailingExtent && children.length < TICKER_DOM_ITEM_BUDGET) {
    const item = options.items[options.motion.nextItemIndex % options.items.length];

    if (item === undefined) return false;

    const span = options.document.createElement('span');

    setTickerItem(span, item);
    options.motion.nextItemIndex += 1;
    options.track.append(span);
    trailingExtent = options.itemExtent(span);
    coverage += trailingExtent;
    children = Array.from(options.track.children);
  }

  return coverage >= viewport + trailingExtent;
}

function recycleTickerItems(options: {
  readonly track: HTMLElement;
  readonly items: readonly projectFormatV1.TickerItem[];
  readonly repeat: boolean;
  readonly itemExtent: (item: Element) => number;
  readonly motion: { offset: number; nextItemIndex: number };
}): void {
  if (options.repeat && options.track.children.length === options.items.length) {
    const cycleDistance = Array.from(options.track.children).reduce(
      (total, item) => total + options.itemExtent(item),
      0,
    );

    if (cycleDistance > 0) options.motion.offset %= cycleDistance;
  }

  for (let rotations = 0; rotations < TICKER_DOM_ITEM_BUDGET; rotations += 1) {
    const first = options.track.querySelector<HTMLElement>(':scope > span');

    if (first === null) break;

    const extent = options.itemExtent(first);

    if (options.motion.offset < extent) break;
    options.motion.offset -= extent;

    const item =
      options.items[options.motion.nextItemIndex] ??
      (options.repeat ? options.items[options.motion.nextItemIndex % options.items.length] : undefined);

    if (item === undefined) {
      first.remove();
    } else {
      setTickerItem(first, item);
      options.motion.nextItemIndex += 1;
      options.track.append(first);
    }
  }
}

function appendTicker(options: ElementContentOptionsV1, element: projectFormatV1.TickerElement): void {
  const domDocument = options.context.document ?? globalThis.document;
  const track = domDocument.createElement('div');
  const horizontal = element.ticker.direction === 'left' || element.ticker.direction === 'right';
  const positive = element.ticker.direction === 'right' || element.ticker.direction === 'down';
  const gap = spatialValueToCssPixelsV1(element.ticker.gap, options.units);

  options.content.style.setProperty('overflow', 'hidden');
  options.content.style.setProperty('width', FULL_SIZE);
  options.content.style.setProperty('height', FULL_SIZE);

  applyStyleV1(track, {
    display: 'flex',
    flexDirection: tickerFlexDirection(horizontal, positive),
    gap: pixels(element.ticker.gap, options),
    whiteSpace: 'nowrap',
    width: 'max-content',
    willChange: 'transform',
    marginLeft: horizontal && positive ? 'auto' : undefined,
    marginTop: !horizontal && positive ? 'auto' : undefined,
  });
  track.dataset['tickerDirection'] = element.ticker.direction;
  track.dataset['tickerSpeed'] = String(element.ticker.speed);

  element.ticker.items.slice(0, TICKER_DOM_ITEM_BUDGET).forEach((item) => {
    const span = domDocument.createElement('span');

    setTickerItem(span, item);
    track.append(span);
  });
  options.content.append(track);

  const subscribe = options.context.clock?.subscribe;

  if (subscribe === undefined || element.ticker.speed <= 0 || track.children.length === 0) return;

  const motion = { offset: 0, nextItemIndex: track.children.length };
  let previousTime: number | undefined;
  let coverageFailed = false;
  const readTime = (): number | undefined => {
    try {
      const value = options.context.clock?.now().getTime();

      return value !== undefined && Number.isFinite(value) ? value : undefined;
    } catch {
      return undefined;
    }
  };
  const itemExtent = (item: Element): number => {
    const rect = item.getBoundingClientRect();
    const measured = horizontal ? rect.width : rect.height;

    return Math.max(1, Number.isFinite(measured) ? measured : 0) + Math.max(0, gap);
  };
  const update = (): void => {
    if (coverageFailed) return;

    const currentTime = readTime();

    if (currentTime === undefined) return;

    const hasCoverage = ensureTickerCoverage({
      content: options.content,
      track,
      items: element.ticker.items,
      repeat: element.ticker.repeat,
      horizontal,
      itemExtent,
      document: domDocument,
      motion,
    });

    if (!hasCoverage) {
      track.replaceWith(fallback(domDocument, 'Ticker viewport exceeds output budget'));
      coverageFailed = true;

      return;
    }

    if (previousTime === undefined) {
      previousTime = currentTime;

      return;
    }

    motion.offset += (Math.max(0, currentTime - previousTime) / 1_000) * element.ticker.speed;
    previousTime = currentTime;
    recycleTickerItems({
      track,
      items: element.ticker.items,
      repeat: element.ticker.repeat,
      itemExtent,
      motion,
    });

    const signedOffset = positive ? motion.offset : -motion.offset;
    const translation = `${horizontal ? 'translateX' : 'translateY'}(${formatCssNumber(signedOffset)}px)`;

    track.style.setProperty('transform', translation);
  };

  previousTime = readTime();

  try {
    CONTENT_CLEANUPS.set(options.content, subscribe(update));
  } catch {
    // The already-mounted ticker remains inert when subscription setup fails.
  }
}

function clockText(options: ElementContentOptionsV1, element: projectFormatV1.ClockElement): string | undefined {
  try {
    const now = options.context.clock?.now();

    if (now === undefined || !Number.isFinite(now.getTime())) return undefined;

    const parts = new Intl.DateTimeFormat(element.clock.locale, {
      timeZone: element.clock.timeZone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((candidate) => candidate.type === type)?.value ?? '00';
    const milliseconds = String(now.getUTCMilliseconds()).padStart(3, '0');
    const replacements: Readonly<Record<string, string>> = {
      HH: part('hour'),
      mm: part('minute'),
      ss: part('second'),
      S: milliseconds.slice(0, 1),
      SS: milliseconds.slice(0, 2),
      SSS: milliseconds,
    };

    return element.clock.format.replace(/HH|mm|ss|SSS|SS|S/gu, (token) => replacements[token] ?? token);
  } catch {
    return undefined;
  }
}

function clearContentCleanup(content: HTMLElement): void {
  const cleanup = CONTENT_CLEANUPS.get(content);

  CONTENT_CLEANUPS.delete(content);

  if (cleanup !== undefined)
    try {
      cleanup();
    } catch {
      // Runtime cleanup failures are isolated at the renderer boundary.
    }
}

function appendClock(options: ElementContentOptionsV1, element: projectFormatV1.ClockElement): void {
  const domDocument = options.context.document ?? globalThis.document;
  const update = (): void => {
    const text = clockText(options, element);

    options.content.replaceChildren();
    if (text === undefined) options.content.append(fallback(domDocument, 'Realtime clock unavailable'));
    else options.content.textContent = text;
  };

  update();

  const subscribe = options.context.clock?.subscribe;

  if (subscribe === undefined) return;

  try {
    const cleanup = subscribe(update);

    CONTENT_CLEANUPS.set(options.content, cleanup);
  } catch {
    // The already-mounted clock value remains inert when subscription setup fails.
  }
}

/** Dispose runtime subscriptions owned by content targets within an element subtree. */
export function disposeElementContentV1(host: HTMLElement): void {
  if (host.matches('[data-element-content]')) clearContentCleanup(host);
  host.querySelectorAll<HTMLElement>('[data-element-content]').forEach(clearContentCleanup);
}

/** Dispose the runtime subscription associated with one content target before replacing its payload. */
export function disposeContentTargetV1(content: HTMLElement): void {
  clearContentCleanup(content);
}

function appendPlugin(options: ElementContentOptionsV1, element: projectFormatV1.PluginElement): void {
  const domDocument = options.context.document ?? globalThis.document;
  const renderer = options.context.pluginRenderers?.get(pluginRendererKeyV1(element.plugin));

  if (renderer !== undefined) {
    try {
      const rendered: unknown = renderer.render({ element, document: domDocument });
      const elementConstructor = domDocument.defaultView?.HTMLElement;

      if (
        elementConstructor !== undefined &&
        rendered instanceof elementConstructor &&
        rendered.ownerDocument === domDocument &&
        !rendered.isConnected
      ) {
        options.content.append(rendered);

        return;
      }
    } catch {
      // The explicit inert fallback below is the renderer boundary for failed trusted adapters.
    }
  }

  if (element.plugin.previewAssetId !== undefined) {
    appendImage(options, element.plugin.previewAssetId, 'contain', element.accessibility?.label ?? 'Plugin preview');

    return;
  }

  options.content.append(fallback(domDocument, `Unsupported plugin: ${element.plugin.pluginId}`));
}

export function createContentTargetV1(
  host: HTMLElement,
  element: projectFormatV1.Element,
  domDocument: Document,
): HTMLElement {
  if (element.kind === 'group' || element.kind === 'component-instance') {
    host.toggleAttribute('data-element-content', true);

    return host;
  }

  host.removeAttribute('data-element-content');

  const existing = host.querySelector<HTMLElement>(':scope > [data-element-content]');

  if (existing !== null) return existing;

  const content = domDocument.createElement('div');

  content.toggleAttribute('data-element-content', true);
  applyStyleV1(content, { height: FULL_SIZE, width: FULL_SIZE });
  host.prepend(content);

  return content;
}

/** Append safe semantic content for every closed v1 element kind. */
export function appendElementContentV1(options: ElementContentOptionsV1): void {
  const { element } = options.node;
  const domDocument = options.context.document ?? globalThis.document;

  switch (element.kind) {
    case 'text':
      appendText(options, element);

      return;
    case 'image':
      appendImage(options, element.image.assetId, element.image.fit, element.accessibility?.label ?? '');

      return;
    case 'vector':
      appendVector(options, element);

      return;
    case 'group':
    case 'component-instance':
      return;
    case 'video':
    case 'audio':
      appendMedia(options, element);

      return;
    case 'clock':
      appendClock(options, element);

      return;
    case 'ticker':
      appendTicker(options, element);

      return;
    case 'qrcode':
      {
        const qr = createQrCodeSvgV1({
          document: domDocument,
          value: element.qrcode.value,
          errorCorrection: element.qrcode.errorCorrection,
          quietZoneCssPixels: spatialValueToCssPixelsV1(element.qrcode.quietZone, options.units),
        });

        options.content.append(qr ?? fallback(domDocument, 'QR content exceeds the supported symbol size'));
      }

      return;
    case 'foreign':
      appendImage(
        options,
        element.foreign.previewAssetId,
        'contain',
        element.accessibility?.label ?? 'Foreign preview',
      );

      return;
    case 'plugin':
      appendPlugin(options, element);

      return;
  }
}
