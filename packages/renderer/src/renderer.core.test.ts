/** @jest-environment jsdom */

import { createDefaultStyle } from '@broadset/model';

import {
  ALL_DISABLED_CAPABILITIES,
  applyBackgroundStyle,
  buildSceneTree,
  createScreenRenderer,
  DATA_ATTRIBUTES,
  getRendererCapabilities,
  type RendererPlugin,
} from './index';
import { createDocument, createElement } from './renderer-test-helpers';

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

  /** @description Structured gradients must store JSON on data-gradient for playback animation targeting. */
  it('stores data-gradient attribute for structured gradient objects', () => {
    const node = document.createElement('div');

    applyBackgroundStyle(node, {
      ...createDefaultStyle(),
      backgroundGradient: {
        type: 'linear',
        stops: [
          { color: '#ff0000', position: 0 },
          { color: '#0000ff', position: 100 },
        ],
        angle: 90,
      },
    });

    const parsed = JSON.parse(node.dataset['gradient'] ?? '{}') as {
      readonly type: string;
      readonly stops: readonly unknown[];
      readonly angle: number;
    };

    expect(parsed.type).toBe('linear');
    expect(parsed.stops).toHaveLength(2);
    expect(parsed.angle).toBe(90);
  });

  /** @description String gradients should not store data-gradient since they cannot be parsed back for per-stop animation. */
  it('does not store data-gradient for string gradients', () => {
    const node = document.createElement('div');

    applyBackgroundStyle(node, {
      ...createDefaultStyle(),
      backgroundGradient: 'linear-gradient(90deg, red, blue)',
    });

    expect(node.dataset['gradient']).toBeUndefined();
  });

  /** @description Switching from gradient to solid background must clear the data-gradient attribute. */
  it('clears data-gradient when switching to solid background', () => {
    const node = document.createElement('div');

    applyBackgroundStyle(node, {
      ...createDefaultStyle(),
      backgroundGradient: {
        type: 'radial',
        stops: [
          { color: '#ffffff', position: 0 },
          { color: '#000000', position: 100 },
        ],
        center: [50, 50],
      },
    });

    expect(node.dataset['gradient']).toBeDefined();

    applyBackgroundStyle(node, {
      ...createDefaultStyle(),
      backgroundColor: '#000000',
    });

    expect(node.dataset['gradient']).toBeUndefined();
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

  /** @description Boolean group with union renders an SVG with a combined path element. */
  it('renders a boolean group as a single SVG path', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const group = createElement({
      id: 'group-1',
      type: 'group',
      booleanOperation: 'union',
      width: 200,
      height: 200,
    });
    const child1 = createElement({
      id: 'child-1',
      type: 'path',
      parentId: 'group-1',
      content: 'M0 0 L100 0 L100 100 L0 100 Z',
      style: { ...createDefaultStyle(), stroke: '#ff0000', strokeWidth: 3, fill: '#00ff00' },
    });
    const child2 = createElement({
      id: 'child-2',
      type: 'path',
      parentId: 'group-1',
      content: 'M50 50 L150 50 L150 150 L50 150 Z',
    });

    const controller = createScreenRenderer({
      host,
      document: createDocument([group, child1, child2]),
    });

    const groupNode = host.querySelector(`[${DATA_ATTRIBUTES.elementId}="group-1"]`);

    expect(groupNode).not.toBeNull();

    const svg = groupNode?.querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg?.querySelector('path')?.getAttribute('d')).toBeTruthy();
    expect(svg?.querySelector('path')?.getAttribute('stroke')).toBe('#ff0000');
    expect(svg?.querySelector('path')?.getAttribute('fill')).toBe('#00ff00');

    controller.destroy();
  });

  /** @description Boolean group with null operation renders normally — children visible as separate elements. */
  it('renders a group without booleanOperation normally', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const group = createElement({
      id: 'group-1',
      type: 'group',
      booleanOperation: null,
      width: 200,
      height: 200,
    });
    const child1 = createElement({
      id: 'child-1',
      type: 'path',
      parentId: 'group-1',
      content: 'M0 0 L100 0 L100 100 L0 100 Z',
    });

    const controller = createScreenRenderer({
      host,
      document: createDocument([group, child1]),
    });

    const groupNode = host.querySelector(`[${DATA_ATTRIBUTES.elementId}="group-1"]`);

    expect(groupNode).not.toBeNull();

    const childNode = groupNode?.querySelector(`[${DATA_ATTRIBUTES.elementId}="child-1"]`);

    expect(childNode).not.toBeNull();

    const contentHost = groupNode?.querySelector('[data-element-content]');
    const booleanSvg = contentHost?.querySelector(':scope > svg[viewBox="0 0 200 200"]');

    expect(booleanSvg).toBeNull();

    controller.destroy();
  });

  /** @description Boolean group styling inherits from the first child. */
  it('inherits stroke/fill from first child in boolean group', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const group = createElement({
      id: 'group-1',
      type: 'group',
      booleanOperation: 'subtract',
      width: 200,
      height: 200,
    });
    const child1 = createElement({
      id: 'child-1',
      type: 'path',
      parentId: 'group-1',
      content: 'M0 0 L100 0 L100 100 L0 100 Z',
      style: { ...createDefaultStyle(), stroke: '#0000ff', strokeWidth: 5, fill: '#ff00ff' },
    });
    const child2 = createElement({
      id: 'child-2',
      type: 'path',
      parentId: 'group-1',
      content: 'M25 25 L75 25 L75 75 L25 75 Z',
    });

    const controller = createScreenRenderer({
      host,
      document: createDocument([group, child1, child2]),
    });

    const groupNode = host.querySelector(`[${DATA_ATTRIBUTES.elementId}="group-1"]`);
    const pathEl = groupNode?.querySelector('svg path');

    expect(pathEl?.getAttribute('stroke')).toBe('#0000ff');
    expect(pathEl?.getAttribute('stroke-width')).toBe('5');
    expect(pathEl?.getAttribute('fill')).toBe('#ff00ff');

    controller.destroy();
  });
});
