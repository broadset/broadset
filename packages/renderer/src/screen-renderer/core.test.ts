/** @vitest-environment jsdom */

import {
  createDefaultStyle,
  gradientFill,
  noneFill,
  resolveContentAsPlainString,
  rgbColor,
  solidFill,
} from '@broadset/model';
import { describe, expect, it } from 'vitest';

import {
  ALL_DISABLED_CAPABILITIES,
  applyBackgroundStyle,
  buildSceneTree,
  createScreenRenderer,
  DATA_ATTRIBUTES,
  getRendererCapabilities,
  type RendererPlugin,
} from '../index';
import { createDocument, createElement } from './test-helpers';

function createHost(): HTMLDivElement {
  const host = document.createElement('div');

  host.style.width = '1280px';
  host.style.height = '720px';

  return host;
}

describe('renderer core', () => {
  it('renders the cross-package data attributes on each element node', () => {
    const host = createHost();

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

  /** @description Every rendered element must expose exactly one animation target; groups must place the marker on the container itself. */
  it('applies data-element-content on exactly one target per element and on the group container', () => {
    const host = createHost();

    const elements = [
      createElement({ id: 'text-ct', type: 'text', content: 'Hello' }),
      createElement({ id: 'image-ct', type: 'image', content: 'https://example.com/logo.png' }),
      createElement({ id: 'svg-ct', type: 'svg', content: '<svg viewBox="0 0 10 10"></svg>' }),
      createElement({ id: 'path-ct', type: 'path', content: 'M0 0 L10 10' }),
      createElement({ id: 'rect-ct', type: 'rectangle' }),
      createElement({ id: 'ellipse-ct', type: 'ellipse' }),
      createElement({ id: 'qr-ct', type: 'qrcode', content: 'https://broadset.dev' }),
      createElement({ id: 'video-ct', type: 'video', content: 'https://example.com/video.mp4' }),
      createElement({ id: 'clock-ct', type: 'clock', content: '12:00:00' }),
      createElement({ id: 'ticker-ct', type: 'ticker', content: '["A","B"]' }),
      createElement({ id: 'group-ct', type: 'group' }),
    ];

    const controller = createScreenRenderer({
      host,
      document: createDocument(elements),
    });

    for (const element of elements) {
      const node = host.querySelector(`[${DATA_ATTRIBUTES.elementId}="${element.id}"]`);

      expect(node).not.toBeNull();

      if (element.type === 'group') {
        expect(node?.hasAttribute('data-element-content')).toBe(true);
        expect(node?.querySelectorAll('[data-element-content]')).toHaveLength(0);
      } else {
        const targets = node?.querySelectorAll('[data-element-content]') ?? [];

        expect(node?.hasAttribute('data-element-content')).toBe(false);
        expect(targets).toHaveLength(1);
      }
    }

    controller.destroy();
  });

  /** @description Empty image content must render a visible placeholder instead of an empty or broken image node. */
  it('renders a placeholder for image elements with empty content', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'image-empty', type: 'image', name: 'Hero Image', content: '' })]),
    });

    const placeholder = host.querySelector('[aria-label="Hero Image placeholder"]');

    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toContain('Image unavailable');
    expect(host.querySelector('img')).toBeNull();

    controller.destroy();
  });

  /** @description Broken image loads must swap to a visible placeholder instead of leaving a failed img element behind. A CORS-enabled first attempt falls back to a plain-fetch second attempt; only when both error out does the placeholder appear. */
  it('renders a placeholder after an image load error', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([
        createElement({
          id: 'image-error',
          type: 'image',
          name: 'Scorebug Image',
          content: 'https://cdn.invalid/logo.png',
        }),
      ]),
    });

    const corsImage = host.querySelector('img');

    expect(corsImage).not.toBeNull();
    expect(corsImage?.crossOrigin).toBe('anonymous');
    corsImage?.dispatchEvent(new Event('error'));

    // First error swaps in a plain-fetch fallback <img> (no crossOrigin).
    const fallbackImage = host.querySelector('img');

    expect(fallbackImage).not.toBeNull();
    expect(fallbackImage?.crossOrigin).toBeFalsy();
    fallbackImage?.dispatchEvent(new Event('error'));

    // Only after the fallback also errors does the placeholder appear.
    const placeholder = host.querySelector('[aria-label="Scorebug Image placeholder"]');

    expect(placeholder).not.toBeNull();
    expect(host.querySelector('img')).toBeNull();

    controller.destroy();
  });

  /** @description Text rendering must strip executable markup and event-handler attributes so only safe visible text reaches the DOM. */
  it('sanitizes text content before rendering visible characters', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([
        createElement({
          id: 'text-safe',
          type: 'text',
          content:
            '<span onclick="alert(1)">Safe</span><script>alert(2)</script><img src="x" onerror="alert(3)" /> Text',
        }),
      ]),
    });

    const contentNode = host.querySelector(`[${DATA_ATTRIBUTES.elementContent}]`);

    expect(contentNode?.querySelector('script')).toBeNull();
    expect(contentNode?.querySelector('img')).toBeNull();
    expect(contentNode?.textContent).toBe('Safe Text');

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

  /** @description Parented child coordinates must remain relative to parent top-left and must not be shifted by parent padding. */
  it('does not shift child coordinate origin when parent has padding', () => {
    const host = createHost();

    const parent = createElement({
      id: 'parent-with-padding',
      type: 'group',
      width: 240,
      height: 180,
      style: { ...createDefaultStyle(), padding: [20, 24, 28, 32] },
    });
    const child = createElement({
      id: 'child-relative',
      type: 'text',
      parentId: 'parent-with-padding',
      position: { x: 12, y: 18 },
      content: 'Child',
    });

    const controller = createScreenRenderer({
      host,
      document: createDocument([parent, child]),
    });

    const parentContentHost = host.querySelector<HTMLDivElement>(
      `[${DATA_ATTRIBUTES.elementId}="parent-with-padding"] [${DATA_ATTRIBUTES.opacityTarget}] > div`,
    );
    const childHost = host.querySelector<HTMLDivElement>(`[${DATA_ATTRIBUTES.elementId}="child-relative"]`);

    expect(parentContentHost).not.toBeNull();
    expect(parentContentHost?.style.padding).toBe('0px');
    expect(childHost?.style.left).toBe('12px');
    expect(childHost?.style.top).toBe('18px');

    controller.destroy();
  });

  it('applies solid and gradient backgrounds without leaving stale styles behind', () => {
    const node = document.createElement('div');

    applyBackgroundStyle(node, {
      ...createDefaultStyle(),
      fill: gradientFill({
        type: 'linear',
        stops: [
          { color: rgbColor('#111111'), position: 0 },
          { color: rgbColor('#ffffff'), position: 100 },
        ],
        angle: 90,
      }),
    });

    expect(node.style.backgroundImage).toContain('linear-gradient');
    expect(node.style.backgroundColor).toBe('');

    applyBackgroundStyle(node, {
      ...createDefaultStyle(),
      fill: solidFill(rgbColor('#123456')),
    });

    expect(node.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(node.style.backgroundImage).toBe('');
  });

  /** @description Structured gradients must store JSON on data-gradient for playback animation targeting. */
  it('stores data-gradient attribute for structured gradient objects', () => {
    const node = document.createElement('div');

    applyBackgroundStyle(node, {
      ...createDefaultStyle(),
      fill: gradientFill({
        type: 'linear',
        stops: [
          { color: rgbColor('#ff0000'), position: 0 },
          { color: rgbColor('#0000ff'), position: 100 },
        ],
        angle: 90,
      }),
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

  /**
   * @description Switching from gradient to `none` (empty fill) clears
   * every background property and the data-gradient attribute, so the
   * element reverts to transparent without leftover styling.
   */
  it('clears every background property and data-gradient when switching to fill: none', () => {
    const node = document.createElement('div');

    applyBackgroundStyle(node, {
      ...createDefaultStyle(),
      fill: gradientFill({
        type: 'linear',
        stops: [
          { color: rgbColor('#ff0000'), position: 0 },
          { color: rgbColor('#0000ff'), position: 100 },
        ],
      }),
    });

    expect(node.dataset['gradient']).toBeDefined();

    applyBackgroundStyle(node, { ...createDefaultStyle(), fill: noneFill() });

    expect(node.style.backgroundColor).toBe('');
    expect(node.style.backgroundImage).toBe('');
    expect(node.dataset['gradient']).toBeUndefined();
  });

  /** @description Switching from gradient to solid background must clear the data-gradient attribute. */
  it('clears data-gradient when switching to solid background', () => {
    const node = document.createElement('div');

    applyBackgroundStyle(node, {
      ...createDefaultStyle(),
      fill: gradientFill({
        type: 'radial',
        stops: [
          { color: rgbColor('#ffffff'), position: 0 },
          { color: rgbColor('#000000'), position: 100 },
        ],
        center: [50, 50],
      }),
    });

    expect(node.dataset['gradient']).toBeDefined();

    applyBackgroundStyle(node, {
      ...createDefaultStyle(),
      fill: solidFill(rgbColor('#000000')),
    });

    expect(node.dataset['gradient']).toBeUndefined();
  });

  /** @description Mask preset must apply a CSS clip-path so the element visually reflects the chosen shape. Regression for a past state where the properties panel let users pick masks but the renderer never applied them. */
  it('applies customClipPath to the element content host when maskType is set', () => {
    const host = createHost();

    const controller = createScreenRenderer({
      host,
      document: createDocument([
        createElement({
          id: 'masked-rect',
          type: 'rectangle',
          style: { ...createDefaultStyle(), maskType: 'custom', customClipPath: 'circle(50%)' },
        }),
      ]),
    });

    const elementNode = host.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.elementId}="masked-rect"]`);
    const contentNode = elementNode?.querySelector<HTMLElement>('[data-element-content]');

    expect(contentNode?.style.clipPath).toBe('circle(50%)');

    controller.destroy();
  });

  /** @description Opacity must render as 1 when a style omits the field — fixture JSON and externally-authored elements frequently leave it off. Regression for a bug where String(undefined) leaked "undefined" to CSS, so the opacity slider silently had no visible effect on affected elements. */
  it('defaults opacity host style to 1 when the style omits the opacity field', () => {
    const host = createHost();
    const defaultStyle = createDefaultStyle();

    // Simulate a JSON-authored element that never set opacity. We spread
    // createDefaultStyle but scrub the field afterwards to match production
    // fixtures like sampleDocument.json where "style" can omit opacity.
    const styleWithoutOpacity: Record<string, unknown> = { ...defaultStyle };

    delete styleWithoutOpacity['opacity'];

    const controller = createScreenRenderer({
      host,
      document: createDocument([
        createElement({
          id: 'rect-no-opacity',
          type: 'rectangle',
          style: styleWithoutOpacity as unknown as typeof defaultStyle,
        }),
      ]),
    });

    const opacityNode = host.querySelector<HTMLElement>(
      `[${DATA_ATTRIBUTES.elementId}="rect-no-opacity"] [${DATA_ATTRIBUTES.opacityTarget}]`,
    );

    expect(opacityNode?.style.opacity).toBe('1');

    controller.destroy();
  });

  /** @description Switching maskType back to 'none' must clear the clip-path so the element becomes unmasked. */
  it('clears clip-path when maskType reverts to none', () => {
    const host = createHost();

    const controller = createScreenRenderer({
      host,
      document: createDocument([
        createElement({
          id: 'masked-rect',
          type: 'rectangle',
          style: { ...createDefaultStyle(), maskType: 'custom', customClipPath: 'circle(50%)' },
        }),
      ]),
    });

    controller.updateDocument(
      createDocument([
        createElement({
          id: 'masked-rect',
          type: 'rectangle',
          style: { ...createDefaultStyle(), maskType: 'none', customClipPath: '' },
        }),
      ]),
    );

    const elementNode = host.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.elementId}="masked-rect"]`);
    const contentNode = elementNode?.querySelector<HTMLElement>('[data-element-content]');

    expect(contentNode?.style.clipPath).toBe('');

    controller.destroy();
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
    const host = createHost();

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'frame-1', type: 'rectangle' })]),
    });

    const canvasRoot = host.querySelector('[data-broadset-canvas-root="true"]');

    if (!(canvasRoot instanceof HTMLElement)) {
      throw new Error('Canvas root element is missing');
    }

    expect(canvasRoot.style.borderRadius).toBe('0px');
    expect(canvasRoot.style.boxShadow).toBe('none');
    expect(canvasRoot.style.outline).toBe('none');

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

  /** @description Updating one element must only rerender that element and keep unaffected nodes stable. */
  it('updates only the affected element on incremental document updates', () => {
    const updateCounts = new Map<string, number>();
    const plugin: RendererPlugin = {
      type: 'custom',
      rendererFactory: ({ element, host: rendererHost }) => {
        rendererHost.textContent = resolveContentAsPlainString(element.content);

        return {
          update(nextElement) {
            updateCounts.set(nextElement.id, (updateCounts.get(nextElement.id) ?? 0) + 1);
            rendererHost.textContent = resolveContentAsPlainString(nextElement.content);
          },
          destroy() {
            rendererHost.textContent = '';
          },
        };
      },
    };
    const host = createHost();
    const initialElements = Array.from({ length: 10 }, (_value, index) =>
      createElement({
        id: `node-${String(index)}`,
        type: 'custom',
        content: `content-${String(index)}`,
        position: { x: index * 10, y: index * 5 },
      }),
    );

    const controller = createScreenRenderer({
      host,
      document: createDocument(initialElements),
      plugins: [plugin],
    });

    updateCounts.clear();

    const updatedElements = initialElements.map((element, index) =>
      index === 4 ? { ...element, position: { x: element.position.x + 24, y: element.position.y + 8 } } : element,
    );

    controller.updateDocument(createDocument(updatedElements));

    expect(updateCounts.get('node-4')).toBe(1);
    expect(Array.from(updateCounts.entries()).filter(([id]) => id !== 'node-4')).toHaveLength(0);

    controller.destroy();
  });

  /** @description Adding a new element must not remount existing rendered elements. */
  it('adds new elements without remounting existing nodes', () => {
    const mountCounts = new Map<string, number>();
    const plugin: RendererPlugin = {
      type: 'custom',
      rendererFactory: ({ element, host: rendererHost }) => {
        mountCounts.set(element.id, (mountCounts.get(element.id) ?? 0) + 1);
        rendererHost.textContent = resolveContentAsPlainString(element.content);

        return {
          update(nextElement) {
            rendererHost.textContent = resolveContentAsPlainString(nextElement.content);
          },
          destroy() {
            rendererHost.textContent = '';
          },
        };
      },
    };
    const host = createHost();
    const baseElements = [
      createElement({ id: 'custom-a', type: 'custom', content: 'A' }),
      createElement({ id: 'custom-b', type: 'custom', content: 'B' }),
    ];

    const controller = createScreenRenderer({
      host,
      document: createDocument(baseElements),
      plugins: [plugin],
    });

    controller.updateDocument(
      createDocument([...baseElements, createElement({ id: 'custom-c', type: 'custom', content: 'C' })]),
    );

    expect(mountCounts.get('custom-a')).toBe(1);
    expect(mountCounts.get('custom-b')).toBe(1);
    expect(mountCounts.get('custom-c')).toBe(1);

    controller.destroy();
  });

  /** @description Boolean group with union renders an SVG with a combined path element. */
  it('renders a boolean group as a single SVG path', () => {
    const host = createHost();

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
      style: {
        ...createDefaultStyle(),
        stroke: rgbColor('#ff0000'),
        strokeWidth: 3,
        fill: solidFill(rgbColor('#00ff00')),
      },
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
    const host = createHost();

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
    const host = createHost();

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
      style: {
        ...createDefaultStyle(),
        stroke: rgbColor('#0000ff'),
        strokeWidth: 5,
        fill: solidFill(rgbColor('#ff00ff')),
      },
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
