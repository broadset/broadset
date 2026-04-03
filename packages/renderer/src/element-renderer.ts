import type { PageElement } from '@broadset/model';

import type { ComponentRegistry, ElementRendererInstance } from './component-registry';

// ---------------------------------------------------------------------------
// Element renderer (lifecycle manager)
// ---------------------------------------------------------------------------

/**
 * Manages the lifecycle of a single element's renderer, delegating to
 * the ComponentRegistry for renderer resolution.
 *
 * Lifecycle:
 * - mount(element) — resolves and mounts the renderer
 * - update(element) — delegates to the active renderer
 * - remount(element) — destroys current renderer, mounts new one (for type changes)
 * - destroy() — clears host and prevents further updates
 */
export class ElementRenderer {
  private readonly registry: ComponentRegistry;
  private readonly host: HTMLElement;
  private activeInstance: ElementRendererInstance | undefined;
  private destroyed = false;

  constructor(registry: ComponentRegistry, host: HTMLElement) {
    this.registry = registry;
    this.host = host;
  }

  /** Mount a renderer for the given element. */
  mount(element: PageElement): void {
    if (this.destroyed) {
      return;
    }

    const factory = this.registry.resolveRenderer(element.type);

    if (factory === undefined) {
      return;
    }

    this.activeInstance = factory(element, this.host);
    this.activeInstance.mount();
  }

  /** Update the active renderer with new element data. */
  update(element: PageElement): void {
    if (this.destroyed || this.activeInstance === undefined) {
      return;
    }

    this.activeInstance.update(element);
  }

  /** Destroy current renderer, mount a new one (for element type changes). */
  remount(element: PageElement): void {
    if (this.destroyed) {
      return;
    }

    // Destroy the existing instance
    if (this.activeInstance !== undefined) {
      this.activeInstance.destroy();
      this.activeInstance = undefined;
    }

    // Clear host before mounting new renderer
    this.host.replaceChildren();

    // Mount the new renderer
    this.mount(element);
  }

  /** Destroy the renderer and clear host output. */
  destroy(): void {
    if (this.destroyed) {
      return;
    }

    if (this.activeInstance !== undefined) {
      this.activeInstance.destroy();
      this.activeInstance = undefined;
    }

    this.host.replaceChildren();
    this.destroyed = true;
  }
}
