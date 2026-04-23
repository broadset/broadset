import type { BroadsetDocument, BroadsetElement } from '@broadset/model';

import { applyCanvasFrame } from '../adapters/broadset/preview-host';
import {
  BROADSET_STRUCTURAL_ATTRIBUTES,
  DATA_ATTRIBUTES,
  DEFAULT_PERSPECTIVE_PX,
  type ElementRendererFactory,
  type RendererPlugin,
  type RendererRecord,
  type RenderSettings,
  type ScreenRendererController,
  type ScreenRendererOptions,
} from '../core/contracts';
import { classifyElementChange, type ElementChangeKind } from '../core/dirty';
import { buildSceneTree, type SceneTreeNode } from '../scene-tree';
import { BUILT_IN_RENDERERS, createFallbackRenderer } from '../screen-renderer/element-renderers';
import { applyElementLayout, toPixelValue } from './layout';

/**
 * DOM-based screen renderer controller. Owns the canvas shell DOM structure,
 * per-element renderer records, incremental update routing, and canvas
 * scaling. Preview-background policy lives in the Broadset adapter
 * (`adapters/broadset/preview-host.ts`). Per-type rendering lives in the
 * element renderer registry.
 */
export class DOMScreenRenderer implements ScreenRendererController {
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
    this.canvasTransformLayer = document.createElement('div');
    this.canvasTransformLayer.style.position = 'relative';
    this.canvasTransformLayer.style.transformOrigin = 'top left';
    this.canvasTransformLayer.setAttribute(BROADSET_STRUCTURAL_ATTRIBUTES.canvasTransform, 'true');

    // canvasRoot must NOT set any property that CSS promotes into
    // `transform-style: flat` on its used value, since the perspective chain
    // above relies on preserve-3d cascading down to element hosts. That rules
    // out `overflow: hidden`, `clip-path`, `opacity < 1`, `filter`, `mask`,
    // `mix-blend-mode`, `isolation: isolate`, and `contain: paint`.
    this.canvasRoot = document.createElement('div');
    this.canvasRoot.style.position = 'absolute';
    this.canvasRoot.style.inset = '0';
    this.canvasRoot.style.transformStyle = 'preserve-3d';
    this.canvasRoot.style.borderRadius = '0px';
    this.canvasRoot.style.boxShadow = 'none';
    this.canvasRoot.style.outline = 'none';
    this.canvasRoot.setAttribute(BROADSET_STRUCTURAL_ATTRIBUTES.canvasRoot, 'true');

    this.elementLayer = document.createElement('div');
    this.elementLayer.style.position = 'absolute';
    this.elementLayer.style.inset = '0';
    this.elementLayer.style.transformStyle = 'preserve-3d';
    this.elementLayer.setAttribute(BROADSET_STRUCTURAL_ATTRIBUTES.elementLayer, 'true');

    // Editor chrome (selection widgets, guides, snap indicators) portals into
    // overlayRoot. It's a sibling of canvasRoot sharing the same transform
    // layer, so chrome inherits perspective and scale identically to elements
    // while being free to render past the canvas bounds.
    this.overlayRoot = document.createElement('div');
    this.overlayRoot.style.position = 'absolute';
    this.overlayRoot.style.inset = '0';
    this.overlayRoot.style.pointerEvents = 'none';
    this.overlayRoot.style.transformStyle = 'preserve-3d';
    this.overlayRoot.setAttribute(BROADSET_STRUCTURAL_ATTRIBUTES.overlayRoot, 'true');

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
    applyCanvasFrame({
      documentData,
      canvasTransformLayer: this.canvasTransformLayer,
      canvasScaleShell: this.canvasScaleShell,
      canvasRoot: this.canvasRoot,
    });
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

  private applyPerspective(perspective: number): void {
    const safePerspective = Number.isFinite(perspective) && perspective > 0 ? perspective : DEFAULT_PERSPECTIVE_PX;

    this.canvasTransformLayer.style.perspective = `${String(safePerspective)}px`;
    this.canvasTransformLayer.style.perspectiveOrigin = 'center center';
    this.canvasTransformLayer.style.transformStyle = 'preserve-3d';
  }

  private renderDocument(documentData: BroadsetDocument): void {
    const activeIds = this.collectActiveIds(documentData);
    const changeKinds = this.computeChangeKinds(documentData, activeIds);
    const rootNodes = buildSceneTree(documentData.elements);
    const rootHosts: HTMLElement[] = [];

    for (const node of rootNodes) {
      rootHosts.push(this.renderNode({ changeKinds, documentData, node }));
    }

    reconcileChildren(this.elementLayer, rootHosts);
    this.destroyRemovedRecords(activeIds);
  }

  private collectActiveIds(documentData: BroadsetDocument): ReadonlySet<string> {
    const activeIds = new Set<string>();

    for (const element of documentData.elements) {
      activeIds.add(element.id);
    }

    return activeIds;
  }

  private computeChangeKinds(
    documentData: BroadsetDocument,
    activeIds: ReadonlySet<string>,
  ): ReadonlyMap<string, ElementChangeKind> {
    const changeKinds = new Map<string, ElementChangeKind>();

    for (const element of documentData.elements) {
      changeKinds.set(element.id, classifyElementChange(this.previousElementsById.get(element.id), element));
    }

    // Composite nodes (boolean groups) resolve child data at render time,
    // so their own output depends on child changes even when the composite
    // element itself did not change. Walk the element list once and mark
    // any composite parent whose direct children changed as dirty too.
    for (const element of documentData.elements) {
      const parent = findCompositeParent(documentData, element.parentId);

      if (parent === null) continue;

      const childKind = changeKinds.get(element.id);

      if (childKind === 'mount' || childKind === 'dirty' || childKind === 'remount') {
        markCompositeDirty(changeKinds, parent.id);
      }
    }

    // A child removal is not visible from the loop above (removed elements
    // are not in the next document). Re-scan the previous element set for
    // removed children whose composite parents are still in scope.
    for (const [previousId, previousElement] of this.previousElementsById.entries()) {
      if (activeIds.has(previousId)) continue;

      const parent = findCompositeParent(documentData, previousElement.parentId);

      if (parent === null) continue;

      markCompositeDirty(changeKinds, parent.id);
    }

    return changeKinds;
  }

  private destroyRemovedRecords(activeIds: ReadonlySet<string>): void {
    for (const [elementId, record] of this.rendererRecords.entries()) {
      if (activeIds.has(elementId)) continue;

      record.renderer.destroy();
      record.host.remove();
      this.rendererRecords.delete(elementId);
    }
  }

  private renderNode(args: {
    readonly changeKinds: ReadonlyMap<string, ElementChangeKind>;
    readonly documentData: BroadsetDocument;
    readonly node: SceneTreeNode;
  }): HTMLElement {
    const { changeKinds, documentData, node } = args;
    const record = this.getOrCreateRecord(documentData, node.element);
    const hasChildren = node.children.length > 0;
    const kind = changeKinds.get(node.element.id) ?? 'dirty';

    if (kind !== 'clean') {
      applyElementLayout(record, node.element, hasChildren);
      record.renderer.update(node.element, documentData);
    }

    const childHosts: HTMLElement[] = [];

    for (const child of node.children) {
      const childHost = this.renderNode({
        changeKinds,
        documentData,
        node: child,
      });

      childHosts.push(childHost);
    }

    if (hasChildren) {
      reconcileChildren(record.contentHost, childHosts);
    }

    return record.host;
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

function findCompositeParent(documentData: BroadsetDocument, parentId: string | null): BroadsetElement | null {
  if (parentId === null) return null;

  const parent = documentData.elements.find((candidate) => candidate.id === parentId);

  if (parent === undefined) return null;
  if (parent.type !== 'group') return null;
  if (parent.booleanOperation === null) return null;

  return parent;
}

function markCompositeDirty(changeKinds: Map<string, ElementChangeKind>, parentId: string): void {
  const current = changeKinds.get(parentId) ?? 'clean';

  if (current === 'clean') {
    changeKinds.set(parentId, 'dirty');
  }
}

/**
 * Keyed reconciliation. Ensures `parent`'s children match the order of
 * `nextChildren` by keyed identity without unnecessary DOM churn. Nodes
 * already at the correct position are left in place; out-of-order nodes
 * move to the target slot via `insertBefore`; trailing stale nodes are
 * removed.
 *
 * The reconciler is used on both the outer element layer (roots) and
 * nested group content hosts so sibling reorders preserve each host's
 * DOM identity — editor chrome and playback engines can hold direct
 * node references across updates.
 */
function reconcileChildren(parent: Element, nextChildren: readonly Element[]): void {
  for (let i = 0; i < nextChildren.length; i += 1) {
    const expected = nextChildren[i];

    if (expected === undefined) continue;

    const current = parent.childNodes.item(i);

    if (current === expected) continue;

    parent.insertBefore(expected, current);
  }

  while (parent.childNodes.length > nextChildren.length) {
    const last = parent.lastChild;

    if (last === null) break;

    parent.removeChild(last);
  }
}
