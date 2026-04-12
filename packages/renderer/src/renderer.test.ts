/** @jest-environment jsdom */

import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { createDefaultStyle } from '@broadset/model';

import {
  ALL_DISABLED_CAPABILITIES,
  applyBackgroundStyle,
  buildSceneTree,
  computeBooleanPath,
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

    // Child element should be rendered as a separate node inside the group
    const childNode = groupNode?.querySelector(`[${DATA_ATTRIBUTES.elementId}="child-1"]`);

    expect(childNode).not.toBeNull();

    // The group's own content host should NOT contain a boolean SVG with group dimensions
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

describe('computeBooleanPath', () => {
  /** @description Union of two non-overlapping rects should produce a combined path string extending to both. */
  it('produces a path for union of two children', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
      createElement({ id: 'r2', type: 'path', content: 'M50 50 L150 50 L150 150 L50 150 Z' }),
    ];

    const result = computeBooleanPath(children, 'union');

    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect((result ?? '').length).toBeGreaterThan(0);
    // Union of [0..100]x[0..100] and [50..150]x[50..150] should span to 150
    expect(result).toMatch(/150/);
  });

  /** @description Subtract should produce a different path than union. */
  it('produces a path for subtract operation', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
      createElement({ id: 'r2', type: 'path', content: 'M25 25 L75 25 L75 75 L25 75 Z' }),
    ];

    const result = computeBooleanPath(children, 'subtract');

    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  /** @description Intersect should produce only the overlapping region. */
  it('produces a path for intersect operation', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
      createElement({ id: 'r2', type: 'path', content: 'M50 50 L150 50 L150 150 L50 150 Z' }),
    ];

    const result = computeBooleanPath(children, 'intersect');

    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  /** @description Exclude should produce the XOR of two shapes. */
  it('produces a path for exclude operation', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
      createElement({ id: 'r2', type: 'path', content: 'M50 50 L150 50 L150 150 L50 150 Z' }),
    ];

    const result = computeBooleanPath(children, 'exclude');

    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  /** @description Fewer than 2 children should return null (no boolean op possible). */
  it('returns null for fewer than 2 children', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
    ];

    expect(computeBooleanPath(children, 'union')).toBeNull();
  });

  /** @description Null or absent operation returns null. */
  it('returns null when operation is not in the valid map', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 Z' }),
      createElement({ id: 'r2', type: 'path', content: 'M10 10 L50 10 Z' }),
    ];

    expect(computeBooleanPath(children, 'invalid')).toBeNull();
  });

  /** @description Children with empty content should be filtered out; if remaining < 2, returns null. */
  it('returns null when children have empty content', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
      createElement({ id: 'r2', type: 'path', content: '' }),
    ];

    expect(computeBooleanPath(children, 'union')).toBeNull();
  });

  /** @description Three-child union applies operations iteratively; result includes the third shape. */
  it('handles more than 2 children (iterative reduction)', () => {
    const children: readonly BroadsetElement[] = [
      createElement({ id: 'r1', type: 'path', content: 'M0 0 L100 0 L100 100 L0 100 Z' }),
      createElement({ id: 'r2', type: 'path', content: 'M50 0 L150 0 L150 100 L50 100 Z' }),
      createElement({ id: 'r3', type: 'path', content: 'M100 0 L200 0 L200 100 L100 100 Z' }),
    ];

    const result3 = computeBooleanPath(children, 'union');
    const result2 = computeBooleanPath(children.slice(0, 2), 'union');

    expect(result3).not.toBeNull();
    expect(result2).not.toBeNull();
    // 3-child union should differ from 2-child union (it includes the third rect extending to 200)
    expect(result3).not.toEqual(result2);
    expect(result3).toMatch(/200/);
  });
});

describe('per-character text wrapping', () => {
  /** @description Text elements must wrap each character in a span with data-char-index for animation targeting. */
  it('wraps text content characters in individual spans with data-char-index', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'txt-1', type: 'text', content: 'Hi' })]),
    });

    const contentNode = host.querySelector(`[${DATA_ATTRIBUTES.elementContent}]`);
    const charSpans = contentNode?.querySelectorAll('[data-char-index]') ?? [];

    expect(charSpans.length).toBe(2);
    expect(charSpans[0]?.textContent).toBe('H');
    expect(charSpans[0]?.getAttribute('data-char-index')).toBe('0');
    expect(charSpans[1]?.textContent).toBe('i');
    expect(charSpans[1]?.getAttribute('data-char-index')).toBe('1');

    controller.destroy();
  });

  /** @description Spaces in text must also receive their own character span. */
  it('wraps spaces as individual character spans', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'txt-2', type: 'text', content: 'A B' })]),
    });

    const contentNode = host.querySelector(`[${DATA_ATTRIBUTES.elementContent}]`);
    const charSpans = contentNode?.querySelectorAll('[data-char-index]') ?? [];

    expect(charSpans.length).toBe(3);
    expect(charSpans[0]?.textContent).toBe('A');
    expect(charSpans[1]?.textContent).toBe(' ');
    expect(charSpans[2]?.textContent).toBe('B');

    controller.destroy();
  });

  /** @description HTML markup in text content must be stripped before per-character wrapping. */
  it('strips HTML tags when wrapping characters', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'txt-3', type: 'text', content: '<b>OK</b>' })]),
    });

    const contentNode = host.querySelector(`[${DATA_ATTRIBUTES.elementContent}]`);
    const charSpans = contentNode?.querySelectorAll('[data-char-index]') ?? [];

    expect(charSpans.length).toBe(2);
    expect(charSpans[0]?.textContent).toBe('O');
    expect(charSpans[1]?.textContent).toBe('K');

    controller.destroy();
  });
});

/** @description The renderer must apply font-variation-settings CSS when the style field is set. */
describe('font-variation-settings', () => {
  /** @description When fontVariationSettings is set on a text element, the CSS property is applied. */
  it('applies font-variation-settings CSS from style', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([
        createElement({
          id: 'txt-var',
          type: 'text',
          content: 'Variable',
          style: { fontVariationSettings: "'wght' 600, 'wdth' 80", opacity: 1 },
        }),
      ]),
    });

    const contentNode = host.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.elementContent}]`);

    expect(contentNode?.style.fontVariationSettings).toBe("'wght' 600, 'wdth' 80");

    controller.destroy();
  });

  /** @description When fontVariationSettings is not set, the CSS property is empty. */
  it('omits font-variation-settings CSS when not set', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'txt-plain', type: 'text', content: 'Plain' })]),
    });

    const contentNode = host.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.elementContent}]`);

    expect(contentNode?.style.fontVariationSettings).toBe('');

    controller.destroy();
  });
});
