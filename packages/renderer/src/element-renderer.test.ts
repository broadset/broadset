import type { PageElement } from '@broadset/model';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import type { RendererFactory } from './component-registry';
import { ComponentRegistry } from './component-registry';
import { ElementRenderer } from './element-renderer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(overrides: Partial<PageElement> & { id: string }): PageElement {
  return {
    type: 'text',
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    rotation: 0,
    content: 'Hello',
    parentId: null,
    groupId: null,
    ...overrides,
  };
}

function createTrackingFactory(label: string): {
  factory: RendererFactory;
  calls: { method: string; args: unknown[] }[];
} {
  const calls: { method: string; args: unknown[] }[] = [];
  const factory: RendererFactory = (element: PageElement, host: HTMLElement) => ({
    mount(): void {
      calls.push({ method: 'mount', args: [element.id, host] });
      host.textContent = `${label}:${element.id}`;
    },
    update(updated: PageElement): void {
      calls.push({ method: 'update', args: [updated.id] });
      host.textContent = `${label}:${updated.id}:updated`;
    },
    destroy(): void {
      calls.push({ method: 'destroy', args: [element.id] });
    },
  });

  return { factory, calls };
}

describe('Element Renderer Lifecycle', () => {
  let host: HTMLDivElement;
  let registry: ComponentRegistry;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    registry = new ComponentRegistry();
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  /**
   * @description When an element's type changes, the previous renderer must be
   * destroyed and a new renderer for the new type must be mounted. This ensures
   * the correct rendering logic is always active for the current element type.
   */
  it('type change destroys previous renderer and mounts new one', () => {
    const { factory: textFactory, calls: textCalls } = createTrackingFactory('text');
    const { factory: imageFactory, calls: imageCalls } = createTrackingFactory('image');

    registry.registerBuiltIn('text', textFactory);
    registry.registerBuiltIn('image', imageFactory);

    const renderer = new ElementRenderer(registry, host);

    const textElement = makeElement({ id: 'el-1', type: 'text' });

    renderer.mount(textElement);

    expect(textCalls).toHaveLength(1);
    expect(textCalls[0]?.method).toBe('mount');

    // Change type
    const imageElement = makeElement({ id: 'el-1', type: 'image' });

    renderer.remount(imageElement);

    // Old renderer destroyed
    expect(textCalls.some((c) => c.method === 'destroy')).toBe(true);
    // New renderer mounted
    expect(imageCalls.some((c) => c.method === 'mount')).toBe(true);
  });

  /**
   * @description After destroy() is called, the host output must be cleared and
   * subsequent update() calls must have no effect. This prevents stale rendering
   * artifacts and ensures clean teardown.
   */
  it('destroy clears host and prevents later updates', () => {
    const { factory, calls } = createTrackingFactory('text');

    registry.registerBuiltIn('text', factory);

    const renderer = new ElementRenderer(registry, host);
    const element = makeElement({ id: 'el-1', type: 'text' });

    renderer.mount(element);
    expect(host.textContent).not.toBe('');

    renderer.destroy();
    expect(host.innerHTML).toBe('');

    // Update after destroy should be a no-op
    const updatedElement = makeElement({ id: 'el-1', type: 'text', content: 'Changed' });

    renderer.update(updatedElement);

    expect(host.innerHTML).toBe('');

    // Only mount + destroy calls, no update after destroy
    const methodsAfterDestroy = calls.slice(calls.findIndex((c) => c.method === 'destroy') + 1).map((c) => c.method);

    expect(methodsAfterDestroy).not.toContain('update');
  });

  /**
   * @description mount() should invoke the renderer factory's mount method and
   * produce visible output in the host element.
   */
  it('mount produces visible output', () => {
    const { factory } = createTrackingFactory('text');

    registry.registerBuiltIn('text', factory);

    const renderer = new ElementRenderer(registry, host);
    const element = makeElement({ id: 'el-1', type: 'text' });

    renderer.mount(element);
    expect(host.textContent).toBe('text:el-1');
  });

  /**
   * @description update() should delegate to the active renderer instance's
   * update method, modifying the host output.
   */
  it('update modifies host via active renderer', () => {
    const { factory } = createTrackingFactory('text');

    registry.registerBuiltIn('text', factory);

    const renderer = new ElementRenderer(registry, host);
    const element = makeElement({ id: 'el-1', type: 'text' });

    renderer.mount(element);

    const updatedElement = makeElement({ id: 'el-1', type: 'text', content: 'Updated' });

    renderer.update(updatedElement);

    expect(host.textContent).toBe('text:el-1:updated');
  });
});
