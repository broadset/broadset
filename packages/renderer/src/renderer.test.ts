/** @jest-environment jsdom */

import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { createDefaultStyle } from '@broadset/model';

import {
  ALL_DISABLED_CAPABILITIES,
  applyBackgroundStyle,
  buildSceneTree,
  computeTrimPathAttributes,
  createScreenRenderer,
  DATA_ATTRIBUTES,
  getRendererCapabilities,
  type RendererPlugin,
} from './index';

function createElement(overrides: Partial<BroadsetElement> & Pick<BroadsetElement, 'id' | 'type'>): BroadsetElement {
  return {
    id: overrides.id,
    type: overrides.type,
    name: overrides.name ?? overrides.id,
    locked: false,
    position: overrides.position ?? { x: 0, y: 0 },
    width: overrides.width ?? 160,
    height: overrides.height ?? 80,
    rotation: overrides.rotation ?? 0,
    content: overrides.content ?? '',
    style: {
      ...createDefaultStyle(),
      ...(overrides.style ?? {}),
    },
    parentId: overrides.parentId ?? null,
    groupId: overrides.groupId ?? null,
    assetId: overrides.assetId ?? null,
    dataField: overrides.dataField ?? null,
    visibleWhen: overrides.visibleWhen ?? null,
    repeater: overrides.repeater ?? null,
    typeConfig: overrides.typeConfig ?? null,
    componentRef: overrides.componentRef ?? null,
    autoSize: overrides.autoSize ?? 'fixed',
    textPathElementId: overrides.textPathElementId ?? null,
    booleanOperation: overrides.booleanOperation ?? null,
    extensions: overrides.extensions ?? {},
  };
}

function createDocument(elements: readonly BroadsetElement[]): BroadsetDocument {
  return {
    id: 'doc-renderer-test',
    name: 'Renderer Test Document',
    documentMode: 'screen',
    canvas: {
      width: 1280,
      height: 720,
      unit: 'px',
      dpi: 96,
      padding: [0, 0, 0, 0],
      backgroundColor: '#101828',
      backgroundMode: 'solid',
    },
    elements,
    animations: [],
    pages: [{ id: 'page-1', name: 'Default', overrides: [], locale: null, extensions: {} }],
    dataSchema: { fields: [] },
    extensions: {},
  };
}

describe('renderer core', () => {
  it('renders the cross-package data attributes on each element node', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'text-1', type: 'text', content: 'Hello Broadset' })]),
    });

    const elementNode = host.querySelector(`[${DATA_ATTRIBUTES.elementId}="text-1"]`);
    const contentNode = host.querySelector(`[${DATA_ATTRIBUTES.elementContent}]`);
    const opacityNode = host.querySelector(`[${DATA_ATTRIBUTES.opacityTarget}]`);

    expect(elementNode).not.toBeNull();
    expect(elementNode?.getAttribute(DATA_ATTRIBUTES.visibility)).toBe('onscreen');
    expect(contentNode).not.toBeNull();
    expect(opacityNode).not.toBeNull();

    controller.destroy();
  });

  it('builds a scene tree that promotes orphans to roots and preserves sibling order', () => {
    const root = createElement({ id: 'root', type: 'group' });
    const childA = createElement({ id: 'child-a', type: 'text', parentId: 'root' });
    const childB = createElement({ id: 'child-b', type: 'text', parentId: 'root' });
    const orphan = createElement({ id: 'orphan', type: 'rectangle', parentId: 'missing-parent' });
    const tailRoot = createElement({ id: 'tail-root', type: 'image' });

    const sceneTree = buildSceneTree([root, childA, childB, orphan, tailRoot]);

    expect(sceneTree.map((node) => node.element.id)).toEqual(['root', 'orphan', 'tail-root']);
    expect(sceneTree[0]?.children.map((node) => node.element.id)).toEqual(['child-a', 'child-b']);
  });

  it('applies solid and gradient backgrounds without leaving stale styles behind', () => {
    const node = document.createElement('div');

    applyBackgroundStyle(node, {
      ...createDefaultStyle(),
      backgroundGradient: 'linear-gradient(90deg, #111111 0%, #ffffff 100%)',
    });

    expect(node.style.backgroundImage).toContain('linear-gradient');
    expect(node.style.backgroundColor).toBe('');

    applyBackgroundStyle(node, {
      ...createDefaultStyle(),
      backgroundColor: '#123456',
    });

    expect(node.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(node.style.backgroundImage).toBe('');
  });

  it('resolves capabilities in plugin, built-in, then all-false priority order', () => {
    const plugin: RendererPlugin = {
      type: 'countdown',
      capabilities: { borderRadius: true },
    };
    const overridePlugin: RendererPlugin = {
      type: 'ellipse',
      capabilities: { borderRadius: true },
    };

    expect(getRendererCapabilities('text')).toMatchObject({ typography: true, borderRadius: true });
    expect(getRendererCapabilities('missing-type')).toEqual(ALL_DISABLED_CAPABILITIES);
    expect(getRendererCapabilities('countdown', [plugin])).toMatchObject({ borderRadius: true, typography: false });
    expect(getRendererCapabilities('ellipse', [overridePlugin])).toMatchObject({
      borderRadius: true,
      appearance: true,
    });
  });

  it('keeps the preview frame square without extra rounding or card chrome', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'frame-1', type: 'rectangle' })]),
    });

    const canvasScaleShell = host.firstElementChild as HTMLDivElement | null;
    const canvasRoot = canvasScaleShell?.firstElementChild as HTMLDivElement | null;

    expect(canvasRoot).not.toBeNull();
    expect(canvasRoot?.style.borderRadius).toBe('0px');
    expect(canvasRoot?.style.boxShadow).toBe('none');
    expect(canvasRoot?.style.outline).toBe('none');

    controller.destroy();
  });

  it('remounts renderers on type changes and ignores updates after destroy', () => {
    const lifecycleEvents: string[] = [];
    const pluginA: RendererPlugin = {
      type: 'custom-a',
      rendererFactory: ({ element, host: rendererHost }) => {
        lifecycleEvents.push(`mount:${element.type}`);
        rendererHost.textContent = `rendered:${element.type}`;

        return {
          update(nextElement) {
            rendererHost.textContent = `rendered:${nextElement.type}`;
          },
          destroy() {
            lifecycleEvents.push(`destroy:${element.type}`);
          },
        };
      },
    };
    const pluginB: RendererPlugin = {
      type: 'custom-b',
      rendererFactory: ({ element, host: rendererHost }) => {
        lifecycleEvents.push(`mount:${element.type}`);
        rendererHost.textContent = `rendered:${element.type}`;

        return {
          update(nextElement) {
            rendererHost.textContent = `rendered:${nextElement.type}`;
          },
          destroy() {
            lifecycleEvents.push(`destroy:${element.type}`);
          },
        };
      },
    };
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'node-1', type: 'custom-a', content: 'A' })]),
      plugins: [pluginA, pluginB],
    });

    controller.updateDocument(createDocument([createElement({ id: 'node-1', type: 'custom-b', content: 'B' })]));

    expect(lifecycleEvents).toEqual(['mount:custom-a', 'destroy:custom-a', 'mount:custom-b']);
    expect(host.textContent).toContain('rendered:custom-b');

    controller.destroy();
    controller.updateDocument(createDocument([createElement({ id: 'node-1', type: 'custom-a', content: 'A-again' })]));

    expect(host.innerHTML).toBe('');
    expect(lifecycleEvents).toEqual(['mount:custom-a', 'destroy:custom-a', 'mount:custom-b', 'destroy:custom-b']);
  });
});

/* ================================================================== */
/*  computeTrimPathAttributes                                          */
/* ================================================================== */

describe('computeTrimPathAttributes', () => {
  /** @description Default trim values (start=0, end=1, offset=0) must return null (no dash modification needed). */
  it('returns null for default trim values', () => {
    expect(computeTrimPathAttributes(200, 0, 1, 0)).toBeNull();
  });

  /** @description Zero total length must return null regardless of trim values. */
  it('returns null for zero total length', () => {
    expect(computeTrimPathAttributes(0, 0.25, 0.75, 0)).toBeNull();
  });

  /** @description Partial visibility (25% to 75%) must produce a dasharray showing 50% of the path. */
  it('computes correct dasharray for partial visibility', () => {
    const result = computeTrimPathAttributes(200, 0.25, 0.75, 0);

    expect(result).not.toBeNull();
    expect(result?.dasharray).toBe('100 100');
    expect(result?.dashoffset).toBe('-50');
  });

  /** @description trimEnd: 0, trimStart: 0 means nothing visible — dasharray gap covers entire path. */
  it('produces zero-length dash when trimStart equals trimEnd', () => {
    const result = computeTrimPathAttributes(200, 0.5, 0.5, 0);

    expect(result).not.toBeNull();
    expect(result?.dasharray).toBe('0 200');
    expect(result?.dashoffset).toBe('0');
  });

  /** @description Trim offset rotates the visible window around the path. */
  it('applies trim offset to dashoffset', () => {
    const result = computeTrimPathAttributes(400, 0, 0.5, 0.25);

    expect(result).not.toBeNull();
    expect(result?.dasharray).toBe('200 200');
    expect(result?.dashoffset).toBe('-100');
  });

  /** @description Full path with non-zero offset still hides nothing but shifts the dash start. */
  it('handles full visibility with offset', () => {
    const result = computeTrimPathAttributes(100, 0, 1, 0.5);

    expect(result).not.toBeNull();
    expect(result?.dasharray).toBe('100 0');
    expect(result?.dashoffset).toBe('-50');
  });

  /** @description Line-draw reveal from empty (trimEnd=0) has zero-length dash. */
  it('handles line-draw start at trimEnd=0', () => {
    const result = computeTrimPathAttributes(300, 0, 0, 0);

    expect(result).not.toBeNull();
    expect(result?.dasharray).toBe('0 300');
    expect(result?.dashoffset).toBe('0');
  });
});
