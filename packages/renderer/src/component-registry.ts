import type { CapabilityProfile, PageElement } from '@broadset/model';
import { getCapabilityProfile } from '@broadset/model';

// ---------------------------------------------------------------------------
// Renderer instance interface
// ---------------------------------------------------------------------------

/** Lifecycle interface for a single element's renderer. */
export interface ElementRendererInstance {
  mount(): void;
  update(element: PageElement): void;
  destroy(): void;
}

/** Factory function that creates an ElementRendererInstance. */
export type RendererFactory = (element: PageElement, host: HTMLElement) => ElementRendererInstance;

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

/** Input for registering a component plugin. */
export interface ComponentPlugin {
  readonly type: string;
  readonly rendererFactory?: RendererFactory;
  readonly capabilities?: Partial<CapabilityProfile>;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Component registry
// ---------------------------------------------------------------------------

/**
 * Manages built-in and plugin renderer registrations plus capability resolution.
 *
 * Resolution priority:
 *   1. Plugin renderer
 *   2. Built-in renderer
 *   3. Fallback renderer
 *
 * Capability resolution:
 *   1. Start with built-in capabilities (or all-false for unknown types)
 *   2. Merge plugin capabilities on top (if plugin specifies them)
 */
export class ComponentRegistry {
  private readonly builtInRenderers = new Map<string, RendererFactory>();
  private readonly pluginRenderers = new Map<string, RendererFactory>();
  private readonly pluginCapabilities = new Map<string, Partial<CapabilityProfile>>();
  private fallbackRenderer: RendererFactory | undefined;

  /** Register a built-in renderer for a known element type. */
  registerBuiltIn(type: string, factory: RendererFactory): void {
    this.builtInRenderers.set(type, factory);
  }

  /** Register a component plugin (renderer and/or capabilities). */
  registerPlugin(plugin: ComponentPlugin): void {
    if (plugin.rendererFactory !== undefined) {
      this.pluginRenderers.set(plugin.type, plugin.rendererFactory);
    }

    if (plugin.capabilities !== undefined) {
      this.pluginCapabilities.set(plugin.type, plugin.capabilities);
    }
  }

  /** Set the fallback renderer for unknown types. */
  setFallbackRenderer(factory: RendererFactory): void {
    this.fallbackRenderer = factory;
  }

  /**
   * Resolves capability flags for the given element type.
   *
   * Order: built-in profile (or all-false) → plugin overrides merged on top.
   */
  resolveCapabilities(type: string): CapabilityProfile {
    const base = getCapabilityProfile(type);
    const pluginCaps = this.pluginCapabilities.get(type);

    if (pluginCaps === undefined) {
      return base;
    }

    return { ...base, ...pluginCaps };
  }

  /**
   * Resolves the renderer factory for the given element type.
   *
   * Priority: plugin → built-in → fallback.
   * Returns undefined if no renderer is available.
   */
  resolveRenderer(type: string): RendererFactory | undefined {
    return this.pluginRenderers.get(type) ?? this.builtInRenderers.get(type) ?? this.fallbackRenderer;
  }
}
