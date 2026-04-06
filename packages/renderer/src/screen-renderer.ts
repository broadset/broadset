import type { BroadsetDocument, BroadsetElement, BroadsetElementStyle } from '@broadset/model';
import { sanitizeTextContent } from '@broadset/model';
import qrcode from 'qrcode-generator';

import { applyBackgroundStyle } from './background';
import type { RendererCapabilityOverride } from './capabilities';
import { buildSceneTree, type SceneTreeNode } from './scene-tree';

export const DATA_ATTRIBUTES = {
  elementId: 'data-element-id',
  elementContent: 'data-element-content',
  opacityTarget: 'data-opacity-target',
  visibility: 'data-visibility',
} as const;

export interface ElementRendererFactoryParams {
  readonly document: BroadsetDocument;
  readonly element: BroadsetElement;
  readonly host: HTMLElement;
}

export interface ElementRendererInstance {
  update(element: BroadsetElement): void;
  destroy(): void;
}

export type ElementRendererFactory = (params: ElementRendererFactoryParams) => ElementRendererInstance;

export interface RendererPlugin extends RendererCapabilityOverride {
  readonly rendererFactory?: ElementRendererFactory;
}

export interface ScreenRendererOptions {
  readonly host: HTMLElement;
  readonly document?: BroadsetDocument;
  readonly plugins?: readonly RendererPlugin[];
}

export interface ScreenRendererController {
  readonly host: HTMLElement;
  updateDocument(document: BroadsetDocument): void;
  destroy(): void;
}

interface RendererRecord {
  readonly host: HTMLDivElement;
  readonly opacityHost: HTMLDivElement;
  readonly contentHost: HTMLDivElement;
  readonly renderer: ElementRendererInstance;
  readonly type: string;
}

function toPixelValue(value: number): string {
  return `${String(value)}px`;
}

function toDegreeValue(value: number): string {
  return `${String(value)}deg`;
}

class DOMScreenRenderer implements ScreenRendererController {
  readonly host: HTMLElement;

  private readonly canvasScaleShell: HTMLDivElement;
  private readonly canvasRoot: HTMLDivElement;
  private readonly pluginsByType: ReadonlyMap<string, RendererPlugin>;
  private readonly rendererRecords = new Map<string, RendererRecord>();
  private readonly resizeObserver: ResizeObserver | null;
  private currentDocument: BroadsetDocument | null = null;
  private isDestroyed = false;

  constructor(options: ScreenRendererOptions) {
    this.host = options.host;
    this.pluginsByType = new Map((options.plugins ?? []).map((plugin) => [plugin.type, plugin]));

    this.host.replaceChildren();
    this.host.style.position = 'relative';
    this.host.style.display = 'grid';
    this.host.style.placeItems = 'center';
    this.host.style.overflow = 'hidden';
    this.host.style.minWidth = '0';
    this.host.style.minHeight = '0';

    this.canvasScaleShell = document.createElement('div');
    this.canvasScaleShell.style.position = 'relative';
    this.canvasScaleShell.style.flex = 'none';

    this.canvasRoot = document.createElement('div');
    this.canvasRoot.style.position = 'relative';
    this.canvasRoot.style.transformOrigin = 'top left';
    this.canvasRoot.style.overflow = 'hidden';
    this.canvasRoot.style.borderRadius = '16px';
    this.canvasRoot.style.boxShadow = '0 24px 72px rgba(15, 23, 42, 0.45)';
    this.canvasRoot.style.outline = '1px solid rgba(148, 163, 184, 0.2)';

    this.canvasScaleShell.appendChild(this.canvasRoot);
    this.host.appendChild(this.canvasScaleShell);

    this.resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : (
        new ResizeObserver(() => {
          this.updateScale();
        })
      );
    this.resizeObserver?.observe(this.host);

    if (options.document !== undefined) {
      this.updateDocument(options.document);
    }
  }

  updateDocument(documentData: BroadsetDocument): void {
    if (this.isDestroyed) {
      return;
    }

    this.currentDocument = documentData;
    this.applyCanvasFrame(documentData);
    this.renderDocument(documentData);
    this.updateScale();
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.resizeObserver?.disconnect();

    for (const record of this.rendererRecords.values()) {
      record.renderer.destroy();
    }

    this.rendererRecords.clear();
    this.currentDocument = null;
    this.host.replaceChildren();
  }

  private applyCanvasFrame(documentData: BroadsetDocument): void {
    this.canvasRoot.style.width = toPixelValue(documentData.canvas.width);
    this.canvasRoot.style.height = toPixelValue(documentData.canvas.height);
    this.canvasRoot.style.background = '';
    this.canvasRoot.style.backgroundColor =
      documentData.canvas.backgroundMode === 'solid' ?
        (documentData.canvas.backgroundColor ?? '#0f172a')
      : 'transparent';
  }

  private renderDocument(documentData: BroadsetDocument): void {
    const fragment = document.createDocumentFragment();
    const activeIds = new Set<string>();

    for (const node of buildSceneTree(documentData.elements)) {
      this.renderNode({ activeIds, documentData, node, parent: fragment });
    }

    this.canvasRoot.replaceChildren(fragment);

    for (const [elementId, record] of this.rendererRecords.entries()) {
      if (activeIds.has(elementId)) {
        continue;
      }

      record.renderer.destroy();
      record.host.remove();
      this.rendererRecords.delete(elementId);
    }
  }

  private renderNode(args: {
    readonly activeIds: Set<string>;
    readonly documentData: BroadsetDocument;
    readonly node: SceneTreeNode;
    readonly parent: DocumentFragment | HTMLDivElement;
  }): void {
    const { activeIds, documentData, node, parent } = args;
    const record = this.getOrCreateRecord(documentData, node.element);

    activeIds.add(node.element.id);
    this.applyElementLayout(record, node.element);
    record.renderer.update(node.element);
    parent.appendChild(record.host);

    for (const child of node.children) {
      this.renderNode({
        activeIds,
        documentData,
        node: child,
        parent: record.contentHost,
      });
    }
  }

  private getOrCreateRecord(documentData: BroadsetDocument, element: BroadsetElement): RendererRecord {
    const existingRecord = this.rendererRecords.get(element.id);

    if (existingRecord !== undefined && existingRecord.type === element.type) {
      return existingRecord;
    }

    if (existingRecord !== undefined) {
      existingRecord.renderer.destroy();
      this.rendererRecords.delete(element.id);
    }

    const host = document.createElement('div');
    const opacityHost = document.createElement('div');
    const contentHost = document.createElement('div');

    host.setAttribute(DATA_ATTRIBUTES.elementId, element.id);
    host.setAttribute(DATA_ATTRIBUTES.visibility, 'onscreen');
    opacityHost.setAttribute(DATA_ATTRIBUTES.opacityTarget, '');
    contentHost.setAttribute(DATA_ATTRIBUTES.elementContent, '');

    host.appendChild(opacityHost);
    opacityHost.appendChild(contentHost);

    const rendererFactory = this.resolveRendererFactory(element.type);
    const renderer = rendererFactory({ document: documentData, element, host: contentHost });
    const record: RendererRecord = {
      host,
      opacityHost,
      contentHost,
      renderer,
      type: element.type,
    };

    this.rendererRecords.set(element.id, record);

    return record;
  }

  private resolveRendererFactory(type: string): ElementRendererFactory {
    const plugin = this.pluginsByType.get(type);

    if (plugin?.rendererFactory !== undefined) {
      return plugin.rendererFactory;
    }

    return BUILT_IN_RENDERERS[type] ?? createFallbackRenderer(type);
  }

  private applyElementLayout(record: RendererRecord, element: BroadsetElement): void {
    const { contentHost, host, opacityHost } = record;
    const { style } = element;
    const transforms = buildTransformList(element, style);

    host.style.position = 'absolute';
    host.style.left = toPixelValue(element.position.x);
    host.style.top = toPixelValue(element.position.y);
    host.style.width = toPixelValue(element.width);
    host.style.height = toPixelValue(element.height);
    host.style.transform = transforms;
    host.style.transformOrigin = 'center center';
    host.style.pointerEvents = 'none';

    opacityHost.style.width = '100%';
    opacityHost.style.height = '100%';
    opacityHost.style.opacity = String(style.opacity);

    contentHost.style.position = 'relative';
    contentHost.style.display = 'block';
    contentHost.style.width = '100%';
    contentHost.style.height = '100%';
    contentHost.style.boxSizing = 'border-box';
    contentHost.style.overflow = style.clipChildren === true ? 'hidden' : 'visible';
    contentHost.style.padding = formatPadding(style);
    contentHost.style.borderRadius = formatBorderRadius(element, style);
    contentHost.style.borderWidth = style.borderWidth === undefined ? '' : toPixelValue(style.borderWidth);
    contentHost.style.borderStyle = style.borderWidth === undefined ? '' : (style.borderStyle ?? 'solid');
    contentHost.style.borderColor = style.borderColor ?? '';
    contentHost.style.boxShadow = style.boxShadow ?? '';
    contentHost.style.filter = style.filter ?? '';
    contentHost.style.backdropFilter = style.backdropFilter ?? '';
    contentHost.style.mixBlendMode = style.mixBlendMode ?? '';
    contentHost.style.isolation = style.isolation ?? '';
    contentHost.style.color = style.fontColor ?? '';
    contentHost.style.fontFamily = style.fontFamily ?? '';
    contentHost.style.fontSize = style.fontSize === undefined ? '' : toPixelValue(style.fontSize);
    contentHost.style.fontWeight = style.fontWeight === undefined ? '' : String(style.fontWeight);
    contentHost.style.fontStyle = style.fontStyle ?? '';
    contentHost.style.letterSpacing = style.letterSpacing === undefined ? '' : toPixelValue(style.letterSpacing);
    contentHost.style.lineHeight = style.lineHeight === undefined ? '' : String(style.lineHeight);
    contentHost.style.textAlign = style.textAlignment ?? '';
    contentHost.style.textDecoration = style.textDecoration ?? '';
    contentHost.style.textTransform = style.textTransform ?? '';
    contentHost.style.whiteSpace = element.type === 'ticker' ? 'nowrap' : 'normal';

    applyBackgroundStyle(contentHost, style);
  }

  private updateScale(): void {
    if (this.currentDocument === null) {
      return;
    }

    const availableWidth = this.host.clientWidth;
    const availableHeight = this.host.clientHeight;

    if (availableWidth <= 0 || availableHeight <= 0) {
      return;
    }

    const scale = Math.min(
      availableWidth / this.currentDocument.canvas.width,
      availableHeight / this.currentDocument.canvas.height,
    );
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

    this.canvasScaleShell.style.width = toPixelValue(this.currentDocument.canvas.width * safeScale);
    this.canvasScaleShell.style.height = toPixelValue(this.currentDocument.canvas.height * safeScale);
    this.canvasRoot.style.transform = `scale(${String(safeScale)})`;
  }
}

function buildTransformList(element: BroadsetElement, style: BroadsetElementStyle): string {
  const transforms: string[] = [];

  if (element.rotation !== 0) {
    transforms.push(`rotate(${toDegreeValue(element.rotation)})`);
  }

  if (style.rotateX !== undefined) {
    transforms.push(`rotateX(${toDegreeValue(style.rotateX)})`);
  }

  if (style.rotateY !== undefined) {
    transforms.push(`rotateY(${toDegreeValue(style.rotateY)})`);
  }

  if (style.rotateZ !== undefined) {
    transforms.push(`rotateZ(${toDegreeValue(style.rotateZ)})`);
  }

  if (style.translateZ !== undefined) {
    transforms.push(`translateZ(${toPixelValue(style.translateZ)})`);
  }

  return transforms.join(' ');
}

function formatPadding(style: BroadsetElementStyle): string {
  if (style.padding === undefined) {
    return '0px';
  }

  return style.padding.map((value) => toPixelValue(value)).join(' ');
}

function formatBorderRadius(element: BroadsetElement, style: BroadsetElementStyle): string {
  if (element.type === 'ellipse') {
    return '50%';
  }

  if (style.borderRadius === undefined) {
    return '';
  }

  return style.borderRadius.map((value) => toPixelValue(value)).join(' ');
}

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

const createTextRenderer = createSimpleRenderer((host, element) => {
  host.innerHTML = sanitizeTextContent(element.content);
  host.style.display = 'flex';
  host.style.alignItems = mapVerticalAlignment(element.style.verticalAlignment);
  host.style.justifyContent = mapTextAlignment(element.style.textAlignment);
  host.style.wordBreak = 'break-word';
});

const createShapeRenderer = createSimpleRenderer((host, element) => {
  if (element.type === 'group') {
    host.textContent = '';

    return;
  }

  host.textContent = '';
});

const createImageRenderer = createSimpleRenderer((host, element) => {
  const image = document.createElement('img');

  image.src = element.content;
  image.alt = element.name;
  image.style.width = '100%';
  image.style.height = '100%';
  image.style.display = 'block';
  image.style.objectFit = element.style.objectFit ?? 'cover';

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

const BUILT_IN_RENDERERS: Readonly<Record<string, ElementRendererFactory>> = {
  text: createTextRenderer,
  image: createImageRenderer,
  svg: createSvgRenderer,
  path: createPathRenderer,
  rectangle: createShapeRenderer,
  ellipse: createShapeRenderer,
  qrcode: createQrCodeRenderer,
  group: createShapeRenderer,
  video: createVideoRenderer,
  clock: createClockRenderer,
  ticker: createTickerRenderer,
};

function createFallbackRenderer(type: string): ElementRendererFactory {
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

export function createScreenRenderer(options: ScreenRendererOptions): ScreenRendererController {
  return new DOMScreenRenderer(options);
}

export class BroadsetScreenRendererElement extends HTMLElement {
  private controller: ScreenRendererController | null = null;
  private currentDocument: BroadsetDocument | null = null;

  connectedCallback(): void {
    if (this.controller === null) {
      this.controller = createScreenRenderer({
        host: this,
        ...(this.currentDocument === null ? {} : { document: this.currentDocument }),
      });

      return;
    }

    if (this.currentDocument !== null) {
      this.controller.updateDocument(this.currentDocument);
    }
  }

  disconnectedCallback(): void {
    this.controller?.destroy();
    this.controller = null;
  }

  get documentData(): BroadsetDocument | null {
    return this.currentDocument;
  }

  set documentData(value: BroadsetDocument | null) {
    this.currentDocument = value;

    if (value === null) {
      this.controller?.destroy();
      this.controller = null;
      this.replaceChildren();

      return;
    }

    if (this.isConnected) {
      if (this.controller === null) {
        this.controller = createScreenRenderer({ host: this, document: value });

        return;
      }

      this.controller.updateDocument(value);
    }
  }
}

export function defineBroadsetScreenRenderer(tagName = 'broadset-screen-renderer'): void {
  if (customElements.get(tagName) !== undefined) {
    return;
  }

  customElements.define(tagName, BroadsetScreenRendererElement);
}
