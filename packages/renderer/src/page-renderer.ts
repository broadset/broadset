import type { BroadsetDocument, Canvas, PageElement } from '@broadset/model';

import { registerBuiltInRenderers } from './built-in-renderers';
import type { ElementRendererInstance } from './component-registry';
import { ComponentRegistry } from './component-registry';
import { buildSceneTree, type SceneNode } from './scene-tree';

// ---------------------------------------------------------------------------
// Page Renderer
// ---------------------------------------------------------------------------

/**
 * Renders a single page from a BroadsetDocument into a host element.
 *
 * - Builds a scene tree from the flat element array
 * - Creates renderer instances for each element
 * - Respects parent→child nesting from the scene tree
 * - Applies canvas dimensions as mm-based CSS sizing
 */
export class PageRenderer {
  private readonly registry: ComponentRegistry;
  private readonly instances: ElementRendererInstance[] = [];
  private host: HTMLElement | undefined;

  constructor(registry?: ComponentRegistry) {
    this.registry = registry ?? new ComponentRegistry();
    registerBuiltInRenderers(this.registry);
  }

  /**
   * Render a page into the given host element.
   *
   * @param canvas - The canvas dimensions
   * @param elements - Flat array of elements on this page
   * @param host - DOM element to render into
   */
  render(canvas: Canvas, elements: readonly PageElement[], host: HTMLElement): void {
    this.destroy();
    this.host = host;

    // Set up the canvas with dimensions
    host.style.position = 'relative';
    host.style.width = `${String(canvas.width)}mm`;
    host.style.height = `${String(canvas.height)}mm`;
    host.style.overflow = 'hidden';

    // Build scene tree and render recursively
    const tree = buildSceneTree(elements);

    for (const node of tree) {
      this.renderNode(node, host);
    }
  }

  /** Destroy all renderer instances and clear the host. */
  destroy(): void {
    for (const instance of this.instances) {
      instance.destroy();
    }

    this.instances.length = 0;

    if (this.host !== undefined) {
      this.host.innerHTML = '';
      this.host = undefined;
    }
  }

  private renderNode(node: SceneNode, parent: HTMLElement): void {
    const factory = this.registry.resolveRenderer(node.element.type);

    if (factory === undefined) {
      return;
    }

    const instance = factory(node.element, parent);

    instance.mount();
    this.instances.push(instance);

    // For groups, find the container just appended and render children into it
    if (node.children.length > 0) {
      const container = parent.lastElementChild as HTMLElement | null;

      if (container !== null) {
        for (const child of node.children) {
          this.renderNode(child, container);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Document Renderer
// ---------------------------------------------------------------------------

/**
 * High-level renderer that renders an entire BroadsetDocument.
 * Renders the first page by default. Supports switching pages.
 */
export class DocumentRenderer {
  private readonly pageRenderer: PageRenderer;
  private document: BroadsetDocument | undefined;
  private currentPageIndex = 0;
  private host: HTMLElement | undefined;

  constructor(registry?: ComponentRegistry) {
    this.pageRenderer = new PageRenderer(registry);
  }

  /**
   * Mount a document into a host element.
   * Renders the first page by default.
   */
  mount(doc: BroadsetDocument, host: HTMLElement): void {
    this.document = doc;
    this.host = host;
    this.currentPageIndex = 0;
    this.renderCurrentPage();
  }

  /** Switch to a specific page index. */
  setPage(index: number): void {
    if (this.document === undefined || this.host === undefined) {
      return;
    }

    if (index < 0 || index >= this.document.pages.length) {
      return;
    }

    this.currentPageIndex = index;
    this.renderCurrentPage();
  }

  /** Destroy the renderer and clean up. */
  destroy(): void {
    this.pageRenderer.destroy();
    this.document = undefined;
    this.host = undefined;
  }

  private renderCurrentPage(): void {
    if (this.document === undefined || this.host === undefined) {
      return;
    }

    const page = this.document.pages[this.currentPageIndex];

    if (page === undefined) {
      return;
    }

    this.pageRenderer.render(this.document.canvas, page.elements, this.host);
  }
}
