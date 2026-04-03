import { describe, expect, it } from '@jest/globals';

import type { RendererFactory } from './component-registry';
import { ComponentRegistry } from './component-registry';

describe('Component Capability Resolution', () => {
  /**
   * @description Built-in capabilities (from model) must be returned for known
   * element types when no plugins are registered. Validates the base lookup path.
   */
  it('returns built-in capabilities for known type without plugins', () => {
    const registry = new ComponentRegistry();
    const caps = registry.resolveCapabilities('text');

    expect(caps.typography).toBe(true);
    expect(caps.borderRadius).toBe(true);
    expect(caps.appearance).toBe(true);
    expect(caps.boxEffects).toBe(true);
    // Non-text capabilities should be false
    expect(caps.pathEditing).toBe(false);
  });

  /**
   * @description Unknown element types (not in built-in table, no plugins) must
   * return a capability profile where every flag is false. This prevents
   * accidental feature enablement for unrecognized types.
   */
  it('returns all-false capabilities for unknown type without plugins', () => {
    const registry = new ComponentRegistry();
    const caps = registry.resolveCapabilities('ticker');

    expect(caps.borderRadius).toBe(false);
    expect(caps.typography).toBe(false);
    expect(caps.appearance).toBe(false);
    expect(caps.boxEffects).toBe(false);
    expect(caps.clipPath).toBe(false);
    expect(caps.objectFit).toBe(false);
    expect(caps.svgStrokeFill).toBe(false);
    expect(caps.pathEditing).toBe(false);
    expect(caps.squareConstrained).toBe(false);
    expect(caps.instantPlace).toBe(false);
  });

  /**
   * @description A plugin that registers a new type with partial capabilities must
   * have those capabilities merged onto the all-false default. Unspecified flags
   * must remain false.
   */
  it('plugin for new type merges over all-false defaults', () => {
    const registry = new ComponentRegistry();

    registry.registerPlugin({
      type: 'countdown',
      capabilities: { borderRadius: true },
    });

    const caps = registry.resolveCapabilities('countdown');

    expect(caps.borderRadius).toBe(true);
    // Unspecified flags remain false
    expect(caps.typography).toBe(false);
    expect(caps.appearance).toBe(false);
  });

  /**
   * @description A plugin overriding a built-in type must merge its capabilities
   * on top of the built-in defaults, only changing specified flags.
   */
  it('plugin overrides built-in type capabilities selectively', () => {
    const registry = new ComponentRegistry();

    registry.registerPlugin({
      type: 'ellipse',
      capabilities: { borderRadius: true },
    });

    const caps = registry.resolveCapabilities('ellipse');

    // Overridden flag
    expect(caps.borderRadius).toBe(true);
    // Built-in flags preserved
    expect(caps.appearance).toBe(true);
    expect(caps.boxEffects).toBe(true);
    expect(caps.clipPath).toBe(true);
  });

  /**
   * @description A plugin for a built-in type that specifies no capabilities
   * field must leave the original built-in capabilities intact.
   */
  it('plugin without capabilities preserves built-in capabilities', () => {
    const registry = new ComponentRegistry();
    const dummyFactory: RendererFactory = () => ({
      mount: () => undefined,
      update: () => undefined,
      destroy: () => undefined,
    });

    registry.registerPlugin({
      type: 'rectangle',
      rendererFactory: dummyFactory,
    });

    const caps = registry.resolveCapabilities('rectangle');

    expect(caps.borderRadius).toBe(true);
    expect(caps.appearance).toBe(true);
    expect(caps.boxEffects).toBe(true);
    expect(caps.clipPath).toBe(true);
  });
});

describe('Renderer Resolution Priority', () => {
  const fallbackFactory: RendererFactory = () => ({
    mount: () => undefined,
    update: () => undefined,
    destroy: () => undefined,
  });

  const pluginFactory: RendererFactory = () => ({
    mount: () => undefined,
    update: () => undefined,
    destroy: () => undefined,
  });

  const builtInFactory: RendererFactory = () => ({
    mount: () => undefined,
    update: () => undefined,
    destroy: () => undefined,
  });

  /**
   * @description When both a plugin and a built-in renderer exist for the same
   * element type, the plugin renderer must take precedence.
   */
  it('plugin renderer takes precedence over built-in', () => {
    const registry = new ComponentRegistry();

    registry.registerBuiltIn('text', builtInFactory);
    registry.registerPlugin({
      type: 'text',
      rendererFactory: pluginFactory,
    });

    const resolved = registry.resolveRenderer('text');

    expect(resolved).toBe(pluginFactory);
  });

  /**
   * @description When no plugin or built-in renderer exists for an element type,
   * the fallback renderer must be returned to prevent rendering failures.
   */
  it('unknown type returns fallback renderer', () => {
    const registry = new ComponentRegistry();

    registry.setFallbackRenderer(fallbackFactory);

    const resolved = registry.resolveRenderer('unknown_type');

    expect(resolved).toBe(fallbackFactory);
  });

  /**
   * @description When only a built-in renderer exists (no plugin override),
   * the built-in renderer must be returned.
   */
  it('built-in renderer used when no plugin registered', () => {
    const registry = new ComponentRegistry();

    registry.registerBuiltIn('image', builtInFactory);

    const resolved = registry.resolveRenderer('image');

    expect(resolved).toBe(builtInFactory);
  });
});
