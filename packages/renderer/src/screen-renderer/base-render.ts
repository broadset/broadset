import type { BroadsetDocument, BroadsetElement, BroadsetElementStyle } from '@broadset/model';

import { applyBackgroundStyle } from '../background';
import type { RendererCapabilityOverride } from '../capabilities';
import { buildSceneTree, type SceneTreeNode } from '../scene-tree';
import { BUILT_IN_RENDERERS, createFallbackRenderer } from './element-renderers';
import { buildElementTransform } from './transforms';

export const DEFAULT_PERSPECTIVE_PX = 1000;

/**
 * Runtime render settings sourced from CanvasSettings at the call site. Kept
 * separate from the document so that viewport/chrome concerns (perspective,
 * future: zoom, pan) don't leak into the persisted `.bsp` payload.
 */
export interface RenderSettings {
  readonly perspective?: number;
}

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
  readonly settings?: RenderSettings;
}

export interface ScreenRendererController {
  readonly host: HTMLElement;
  updateDocument(document: BroadsetDocument): void;
  updateSettings(settings: RenderSettings): void;
  /**
   * Returns the DOM node editor chrome (selection widgets, guides overlays,
   * snap indicators) should portal into. The overlay lives inside the same
   * transform context as element hosts, so chrome inherits scale, pan, and
   * perspective automatically and stays pixel-aligned with elements.
   */
  getOverlayRoot(): HTMLElement;
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

const CHECKER_SIZE_PX = 16;
const CHECKER_LIGHT = '#d5d7dc';
const CHECKER_DARK = '#b8bcc4';

class DOMScreenRenderer implements ScreenRendererController {
  readonly host: HTMLElement;

  private readonly canvasScaleShell: HTMLDivElement;
  private readonly canvasTransformLayer: HTMLDivElement;
  private readonly canvasRoot: HTMLDivElement;
  private readonly elementLayer: HTMLDivElement;
  private readonly overlayRoot: HTMLDivElement;
  private readonly pluginsByType: ReadonlyMap<string, RendererPlugin>;
  private readonly rendererRecords = new Map<string, RendererRecord>();
  private readonly resizeObserver: ResizeObserver | null;
  private currentDocument: BroadsetDocument | null = null;
  private previousElementsById = new Map<string, BroadsetElement>();
  private isDestroyed = false;

  constructor(options: ScreenRendererOptions) {
    this.host = options.host;
    this.pluginsByType = new Map((options.plugins ?? []).map((plugin) => [plugin.type, plugin]));

    this.host.replaceChildren();
    this.host.style.position = 'relative';
    this.host.style.display = 'grid';
    this.host.style.placeItems = 'center';
    // Host deliberately does NOT clip: chrome in overlayRoot (selection
    // handles, rotation arm) may render past the canvas bounds. Outer hosts
    // (e.g. the demo's screen-preview container) are responsible for final
    // clipping if the canvas overflows the visible viewport.
    this.host.style.overflow = 'visible';
    this.host.style.minWidth = '0';
    this.host.style.minHeight = '0';

    this.canvasScaleShell = document.createElement('div');
    this.canvasScaleShell.style.position = 'relative';
    this.canvasScaleShell.style.flex = 'none';

    // The scale/perspective/preserve-3d transform lives on this single layer
    // so canvasRoot (clipped elements) and overlayRoot (un-clipped chrome)
    // share the same 3D context without each having to reapply the transform.
    // Its size matches the document canvas in canvas units; rendered size
    // reflects the effective screen scale after all ancestor transforms.
    this.canvasTransformLayer = document.createElement('div');
    this.canvasTransformLayer.style.position = 'relative';
    this.canvasTransformLayer.style.transformOrigin = 'top left';
    this.canvasTransformLayer.setAttribute('data-broadset-canvas-transform', 'true');

    // canvasRoot must NOT set any property that CSS promotes into
    // `transform-style: flat` on its used value, since the perspective chain
    // above relies on preserve-3d cascading down to element hosts. That rules
    // out `overflow: hidden`, `clip-path`, `opacity < 1`, `filter`, `mask`,
    // `mix-blend-mode`, `isolation: isolate`, and `contain: paint`.
    //
    // As a consequence, elements that extend past the canvas bounds are NOT
    // clipped at the renderer level. Outer hosts (demo screen-preview
    // container, export rasterizer) are responsible for any final cropping.
    // This is the same tradeoff Figma/Photoshop editors make: the editor
    // canvas is a visual guide, not a hard clipping boundary.
    //
    // Marked with data-broadset-canvas-root so export rasterization can
    // target the semantic canvas content node (no editor chrome).
    this.canvasRoot = document.createElement('div');
    this.canvasRoot.style.position = 'absolute';
    this.canvasRoot.style.inset = '0';
    this.canvasRoot.style.transformStyle = 'preserve-3d';
    this.canvasRoot.style.borderRadius = '0px';
    this.canvasRoot.style.boxShadow = 'none';
    this.canvasRoot.style.outline = 'none';
    this.canvasRoot.setAttribute('data-broadset-canvas-root', 'true');

    // Element hosts live in elementLayer so document content can be swapped
    // wholesale via replaceChildren without disturbing editor chrome.
    this.elementLayer = document.createElement('div');
    this.elementLayer.style.position = 'absolute';
    this.elementLayer.style.inset = '0';
    this.elementLayer.style.transformStyle = 'preserve-3d';
    this.elementLayer.setAttribute('data-broadset-element-layer', 'true');

    // Editor chrome (selection widgets, guides, snap indicators) portals into
    // overlayRoot. It's a sibling of canvasRoot sharing the same transform
    // layer, so chrome inherits perspective and scale identically to elements
    // while being free to render past the canvas bounds (e.g. rotation
    // handles sitting above the canvas edge).
    this.overlayRoot = document.createElement('div');
    this.overlayRoot.style.position = 'absolute';
    this.overlayRoot.style.inset = '0';
    this.overlayRoot.style.pointerEvents = 'none';
    this.overlayRoot.style.transformStyle = 'preserve-3d';
    this.overlayRoot.setAttribute('data-broadset-overlay-root', 'true');

    this.canvasRoot.appendChild(this.elementLayer);
    this.canvasTransformLayer.appendChild(this.canvasRoot);
    this.canvasTransformLayer.appendChild(this.overlayRoot);
    this.canvasScaleShell.appendChild(this.canvasTransformLayer);
    this.host.appendChild(this.canvasScaleShell);

    this.applyPerspective(options.settings?.perspective ?? DEFAULT_PERSPECTIVE_PX);

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
    this.previousElementsById = new Map(documentData.elements.map((element) => [element.id, element]));
    this.updateScale();
  }

  updateSettings(settings: RenderSettings): void {
    if (this.isDestroyed) {
      return;
    }

    if (settings.perspective !== undefined) {
      this.applyPerspective(settings.perspective);
    }
  }

  getOverlayRoot(): HTMLElement {
    return this.overlayRoot;
  }

  private applyPerspective(perspective: number): void {
    const safePerspective = Number.isFinite(perspective) && perspective > 0 ? perspective : DEFAULT_PERSPECTIVE_PX;

    this.canvasTransformLayer.style.perspective = `${String(safePerspective)}px`;
    this.canvasTransformLayer.style.perspectiveOrigin = 'center center';
    this.canvasTransformLayer.style.transformStyle = 'preserve-3d';
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
    this.previousElementsById.clear();
    this.currentDocument = null;
    this.host.replaceChildren();
  }

  private applyCanvasFrame(documentData: BroadsetDocument): void {
    // canvasTransformLayer owns the canvas-space sizing; canvasRoot and
    // overlayRoot fill it via inset:0.
    this.canvasTransformLayer.style.width = toPixelValue(documentData.canvas.width);
    this.canvasTransformLayer.style.height = toPixelValue(documentData.canvas.height);

    // Canvas background lives on canvasScaleShell, which sits OUTSIDE the 3D
    // rendering context established by canvasTransformLayer's perspective +
    // preserve-3d. If the background were on canvasRoot (inside the 3D
    // context) it would be depth-sorted with the elements, and any element
    // rotating into negative z would render BEHIND the background plane —
    // visually "half-clipped at z=0". Putting the background outside the 3D
    // context keeps it as a plain 2D backdrop that no 3D rotation can hide
    // an element behind.
    this.canvasScaleShell.style.background = '';
    this.canvasRoot.style.background = '';
    this.canvasRoot.style.backgroundColor = '';
    this.canvasRoot.style.backgroundImage = '';

    if (documentData.canvas.backgroundMode === 'solid') {
      this.canvasScaleShell.style.backgroundColor = documentData.canvas.backgroundColor ?? '#0f172a';
      this.canvasScaleShell.style.backgroundImage = '';

      return;
    }

    this.canvasScaleShell.style.backgroundColor = CHECKER_LIGHT;
    this.canvasScaleShell.style.backgroundImage =
      `linear-gradient(45deg, ${CHECKER_DARK} 25%, transparent 25%), ` +
      `linear-gradient(-45deg, ${CHECKER_DARK} 25%, transparent 25%), ` +
      `linear-gradient(45deg, transparent 75%, ${CHECKER_DARK} 75%), ` +
      `linear-gradient(-45deg, transparent 75%, ${CHECKER_DARK} 75%)`;
    this.canvasScaleShell.style.backgroundSize =
      `${String(CHECKER_SIZE_PX)}px ${String(CHECKER_SIZE_PX)}px, ` +
      `${String(CHECKER_SIZE_PX)}px ${String(CHECKER_SIZE_PX)}px, ` +
      `${String(CHECKER_SIZE_PX)}px ${String(CHECKER_SIZE_PX)}px, ` +
      `${String(CHECKER_SIZE_PX)}px ${String(CHECKER_SIZE_PX)}px`;
    this.canvasScaleShell.style.backgroundPosition =
      `0 0, 0 ${String(CHECKER_SIZE_PX / 2)}px, ` +
      `${String(CHECKER_SIZE_PX / 2)}px ${String(-CHECKER_SIZE_PX / 2)}px, ` +
      `${String(-CHECKER_SIZE_PX / 2)}px 0`;
  }

  private renderDocument(documentData: BroadsetDocument): void {
    const fragment = document.createDocumentFragment();
    const activeIds = new Set<string>();

    for (const node of buildSceneTree(documentData.elements)) {
      this.renderNode({ activeIds, documentData, node, parent: fragment });
    }

    this.elementLayer.replaceChildren(fragment);

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
    const hasChildren = node.children.length > 0;
    const previousElement = this.previousElementsById.get(node.element.id);
    const shouldUpdate =
      previousElement?.type !== node.element.type ||
      !areElementsEquivalent(previousElement, node.element);

    activeIds.add(node.element.id);

    if (shouldUpdate) {
      this.applyElementLayout(record, node.element, hasChildren);
      record.renderer.update(node.element);
    }

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

    if (existingRecord?.type === element.type) {
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

    if (element.type === 'group') {
      host.setAttribute(DATA_ATTRIBUTES.elementContent, '');
    } else {
      contentHost.setAttribute(DATA_ATTRIBUTES.elementContent, '');
    }

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

  private applyElementLayout(record: RendererRecord, element: BroadsetElement, hasChildren: boolean): void {
    const { contentHost, host, opacityHost } = record;
    const { style } = element;
    const transforms = buildElementTransform(element, style);

    host.style.position = 'absolute';
    host.style.left = toPixelValue(element.position.x);
    host.style.top = toPixelValue(element.position.y);
    host.style.width = toPixelValue(element.width);
    host.style.height = toPixelValue(element.height);
    host.style.transform = transforms;
    host.style.transformOrigin = 'center center';
    host.style.pointerEvents = 'none';
    // mix-blend-mode must live on the outermost per-element host so the element
    // blends against sibling elements behind it. Placing it on an inner node
    // (inside opacityHost, which creates a new stacking context when opacity<1)
    // would isolate the blend to that stacking context and paint as no-op.
    host.style.mixBlendMode = style.mixBlendMode ?? '';

    opacityHost.style.width = '100%';
    opacityHost.style.height = '100%';
    opacityHost.style.opacity = String(style.opacity);

    contentHost.style.position = 'relative';
    contentHost.style.display = 'block';
    contentHost.style.width = '100%';
    contentHost.style.height = '100%';
    contentHost.style.boxSizing = 'border-box';
    contentHost.style.overflow = style.clipChildren === true ? 'hidden' : 'visible';

    const maskValue = resolveClipPathValue(style.maskType, style.customClipPath);

    contentHost.style.clipPath = maskValue;
    // Parented elements use model-space coordinates relative to their parent's top-left.
    // Applying parent padding on the same host shifts that coordinate origin.
    contentHost.style.padding = hasChildren ? '0px' : formatPadding(style);
    contentHost.style.borderRadius = formatBorderRadius(element, style);
    contentHost.style.borderWidth = style.borderWidth === undefined ? '' : toPixelValue(style.borderWidth);
    contentHost.style.borderStyle = style.borderWidth === undefined ? '' : (style.borderStyle ?? 'solid');
    contentHost.style.borderColor = style.borderColor ?? '';
    contentHost.style.boxShadow = style.boxShadow ?? '';
    contentHost.style.filter = style.filter ?? '';
    contentHost.style.backdropFilter = style.backdropFilter ?? '';
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
    contentHost.style.fontVariationSettings = style.fontVariationSettings ?? '';
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
    this.canvasTransformLayer.style.transform = `scale(${String(safeScale)})`;
  }
}

function resolveClipPathValue(maskType: string | undefined, customClipPath: string | undefined): string {
  if (maskType === 'none' || maskType === undefined || customClipPath === undefined) return '';
  if (customClipPath.trim() === '') return '';

  return customClipPath;
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

function areElementsEquivalent(previous: BroadsetElement, next: BroadsetElement): boolean {
  return JSON.stringify(previous) === JSON.stringify(next);
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
