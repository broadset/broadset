import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it, vi } from 'vitest';

import { type RenderContextV1, type ResolvedRenderAssetV1 } from './element-dom';
import { createResolvedSceneDomV1, renderResolvedSceneV1 } from './scene-dom';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);
const PROJECT_ID = id('project');
const DOCUMENT_ID = id('document');
const PAGE_ID = id('page');
const NO_SWATCHES: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Swatch> = new Map();
const NO_FONTS: ReadonlyMap<projectFormatV1.Id, projectFormatV1.FontFamilyResource> = new Map();
const TEST_CLOCK = { now: (): Date => new Date('2026-07-14T12:34:56.789Z') };

function context(
  resolveAsset: RenderContextV1['resolveAsset'] = (): ResolvedRenderAssetV1 => ({
    status: 'missing',
    diagnostic: 'Missing',
  }),
): RenderContextV1 {
  return {
    swatches: NO_SWATCHES,
    fonts: NO_FONTS,
    resolveAsset,
    clock: TEST_CLOCK,
    document,
  };
}

function geometry(x = 0): projectFormatV1.ElementGeometry {
  return projectFormatV1.createElementGeometry({
    width: 100,
    height: 50,
    transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, x, 0] },
  });
}

function group(elementId: string, opacity = 1): projectFormatV1.Element {
  return projectFormatV1.createElementV1({
    id: id(elementId),
    name: elementId,
    geometry: geometry(),
    appearance: { ...projectFormatV1.createDefaultAppearance(), opacity },
    kind: 'group',
  });
}

function clock(elementId: string, format = 'HH:mm'): projectFormatV1.Element {
  return projectFormatV1.createElementV1({
    id: id(elementId),
    name: elementId,
    geometry: geometry(),
    kind: 'clock',
    clock: { format, timeZone: 'UTC' },
  });
}

function vector(elementId: string, subtype: 'rectangle' | 'ellipse'): projectFormatV1.Element {
  return projectFormatV1.createElementV1({
    id: id(elementId),
    name: elementId,
    geometry: geometry(),
    kind: 'vector',
    geometryData:
      subtype === 'rectangle' ? projectFormatV1.createRectangleGeometry() : projectFormatV1.createEllipseGeometry(),
  });
}

function address(
  rootInstanceId: string,
  elementId: string,
  componentInstancePath: readonly projectFormatV1.Id[] = [],
): projectFormatV1.ResolvedSceneAddressV1 {
  return { rootInstanceId: id(rootInstanceId), componentInstancePath, elementId: id(elementId) };
}

function sceneNode(options: {
  readonly element: projectFormatV1.Element;
  readonly address: projectFormatV1.ResolvedSceneAddressV1;
  readonly parentAddress?: projectFormatV1.ResolvedSceneAddressV1 | null;
  readonly depth?: number;
}): projectFormatV1.ResolvedSceneNodeV1 {
  return {
    address: options.address,
    parentAddress: options.parentAddress ?? null,
    sourceElement: options.element,
    element: options.element,
    localGeometry: options.element.geometry,
    worldGeometry: options.element.geometry,
    visible: true,
    depth: options.depth ?? 0,
    properties: [],
    fallbacks: [],
  };
}

function snapshot(
  nodes: readonly projectFormatV1.ResolvedSceneNodeV1[],
  pageId = PAGE_ID,
): projectFormatV1.ResolvedSceneSnapshotV1 {
  const project = projectFormatV1.createProjectV1({ id: PROJECT_ID });
  const broadsetDocument = project.documents[0];

  if (broadsetDocument === undefined) throw new Error('Expected default document');

  return {
    projectId: PROJECT_ID,
    documentId: DOCUMENT_ID,
    pageId,
    tick: 0,
    surface: { ...broadsetDocument.surface, unit: 'mm', dpi: 254, size: [192, 108] },
    color: broadsetDocument.color,
    nodes,
    resources: project.resources,
    data: { selectedVariableModes: {}, selectedSampleDataSets: {}, values: [] },
    fallbacks: [],
    diagnostics: [],
  };
}

function directIds(parent: Element): readonly (string | undefined)[] {
  return Array.from(parent.children, (child) =>
    child instanceof HTMLElement ? child.dataset['elementId'] : undefined,
  );
}

describe('createResolvedSceneDomV1', () => {
  it('reconciles transparent, solid, and gradient surface paints', () => {
    const base = snapshot([]);
    const red: projectFormatV1.ConcreteColorValue = {
      kind: 'color',
      space: 'srgb',
      channels: [1, 0, 0],
      alpha: 1,
    };
    const gradient: projectFormatV1.Gradient = {
      kind: 'linear',
      start: [0, 0],
      end: [1, 0],
      stops: [
        { id: id('stop-a'), color: red, opacity: 1, offset: 0 },
        { id: id('stop-b'), color: { ...red, channels: [0, 0, 1] }, opacity: 1, offset: 1 },
      ],
      coordinateSpace: 'object-bounds',
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
      spread: 'pad',
      interpolation: 'srgb',
    };
    const withPaint = (background: projectFormatV1.Paint): projectFormatV1.ResolvedSceneSnapshotV1 => ({
      ...base,
      surface: { ...base.surface, background },
    });
    const handle = createResolvedSceneDomV1({ snapshot: withPaint({ kind: 'none' }), context: context() });

    const backdrop = handle.root.querySelector<HTMLElement>(':scope > .broadset-surface-backdrop');
    const sceneRoot = handle.root.querySelector<HTMLElement>(':scope > [data-broadset-canvas-root]');

    expect(handle.root.dataset['broadsetCanvasRoot']).toBeUndefined();
    expect(backdrop).not.toBeNull();
    expect(sceneRoot).not.toBeNull();
    expect(sceneRoot?.contains(backdrop)).toBe(false);
    expect(sceneRoot?.style.transformStyle).toBe('preserve-3d');
    expect(backdrop?.style.background).toBe('');
    expect(backdrop?.style.backgroundColor).toBe('');

    handle.update(withPaint({ kind: 'solid', color: red }), context());
    expect(backdrop?.style.backgroundColor).toContain('color(srgb 1 0 0)');
    expect(backdrop?.style.background).not.toContain('gradient');

    handle.update(withPaint({ kind: 'gradient', gradient }), context());
    expect(backdrop?.style.backgroundColor).toBe('transparent');
    expect(backdrop?.style.background).toContain('linear-gradient');

    handle.update(withPaint({ kind: 'none' }), context());
    expect(backdrop?.style.background).toBe('');
    expect(backdrop?.style.backgroundColor).toBe('');

    const assetId = id('surface-asset');
    const ready = context(() => ({ status: 'ready', url: 'blob:surface' }));

    handle.update(withPaint({ kind: 'picture', assetId, fit: 'cover' }), ready);
    expect(backdrop?.querySelector<HTMLElement>(':scope > [data-paint-layer]')?.style.backgroundSize).toBe('cover');

    handle.update(
      withPaint({
        kind: 'pattern',
        assetId,
        repeat: 'mirror',
        transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 2, 3] },
      }),
      ready,
    );

    const surfacePattern = backdrop?.querySelector<HTMLElement>(':scope > [data-paint-layer]');

    expect(surfacePattern?.querySelector('[data-pattern-mirror="true"]')).not.toBeNull();

    handle.update(withPaint({ kind: 'picture', assetId, fit: 'contain' }), context());
    expect(backdrop?.textContent).toContain('Paint asset missing');
  });

  it('renders only resolved snapshot nodes with page-aware repeated-instance identity', () => {
    const rootA = address('root-a', 'group-a');
    const rootB = address('root-b', 'group-b');
    const instanceA = id('instance-a');
    const instanceB = id('instance-b');
    const nodes = [
      sceneNode({ element: group('group-a'), address: rootA }),
      sceneNode({
        element: clock('leaf'),
        address: address('root-a', 'leaf', [instanceA]),
        parentAddress: rootA,
        depth: 1,
      }),
      sceneNode({ element: group('group-b'), address: rootB }),
      sceneNode({
        element: clock('leaf'),
        address: address('root-b', 'leaf', [instanceB]),
        parentAddress: rootB,
        depth: 1,
      }),
    ];

    const handle = createResolvedSceneDomV1({ snapshot: snapshot(nodes), context: context() });
    const layer = handle.root.querySelector<HTMLElement>('[data-broadset-element-layer]');

    const sceneRoot = handle.root.querySelector<HTMLElement>(':scope > [data-broadset-canvas-root]');

    expect(handle.root.dataset['broadsetCanvasRoot']).toBeUndefined();
    expect(sceneRoot?.dataset['broadsetCanvasTransform']).toBeUndefined();
    expect(handle.root.style.width).toBe('1920px');
    expect(layer?.querySelectorAll('[data-element-id="leaf"]')).toHaveLength(2);
    expect(layer?.querySelector('[data-element-id="group-a"] [data-element-id="leaf"]')).not.toBeNull();
    expect(layer?.querySelector('[data-element-id="group-b"] [data-element-id="leaf"]')).not.toBeNull();
  });

  it('resolves boolean operands within each repeated instance address', () => {
    const operandAId = id('operand-a');
    const operandBId = id('operand-b');
    const booleanId = id('boolean');
    const operand = (elementId: projectFormatV1.Id, translation: number): projectFormatV1.Element =>
      projectFormatV1.createElementV1({
        id: elementId,
        name: 'Operand',
        geometry: geometry(translation),
        kind: 'vector',
        geometryData: projectFormatV1.createRectangleGeometry(),
      });
    const boolean = (): projectFormatV1.Element =>
      projectFormatV1.createElementV1({
        id: booleanId,
        name: 'Boolean',
        geometry: geometry(),
        kind: 'vector',
        geometryData: { kind: 'boolean', operation: 'union', operandIds: [operandAId, operandBId] },
      });
    const nodes = [
      sceneNode({ element: operand(operandAId, 1), address: address('root-a', 'operand-a') }),
      sceneNode({ element: operand(operandBId, 11), address: address('root-a', 'operand-b') }),
      sceneNode({ element: boolean(), address: address('root-a', 'boolean') }),
      sceneNode({ element: operand(operandAId, 2), address: address('root-b', 'operand-a') }),
      sceneNode({ element: operand(operandBId, 12), address: address('root-b', 'operand-b') }),
      sceneNode({ element: boolean(), address: address('root-b', 'boolean') }),
    ];
    const handle = createResolvedSceneDomV1({ snapshot: snapshot(nodes), context: context() });
    const booleans = handle.root.querySelectorAll<HTMLElement>('[data-element-id="boolean"]');

    expect(booleans).toHaveLength(2);
    expect(booleans[0]?.querySelector('mask path[fill="white"]')?.getAttribute('transform')).toBe(
      'matrix(1 0 0 1 1 0)',
    );
    expect(booleans[1]?.querySelector('mask path[fill="white"]')?.getAttribute('transform')).toBe(
      'matrix(1 0 0 1 2 0)',
    );
  });

  it('resolves transitive operands for nested booleans through the scene path', () => {
    const a = vector('nested-a', 'rectangle');
    const b = vector('nested-b', 'ellipse');
    const nested = projectFormatV1.createElementV1({
      id: id('nested-boolean'),
      name: 'Nested',
      geometry: geometry(),
      kind: 'vector',
      geometryData: { kind: 'boolean', operation: 'union', operandIds: [a.id, b.id] },
    });
    const outer = projectFormatV1.createElementV1({
      id: id('outer-boolean'),
      name: 'Outer',
      geometry: geometry(),
      kind: 'vector',
      geometryData: { kind: 'boolean', operation: 'subtract', operandIds: [nested.id, b.id] },
    });
    const nodes = [a, b, nested, outer].map((element) => sceneNode({ element, address: address('root', element.id) }));
    const handle = createResolvedSceneDomV1({ snapshot: snapshot(nodes), context: context() });
    const outerHost = handle.root.querySelector<HTMLElement>('[data-element-id="outer-boolean"]');

    expect(outerHost?.querySelectorAll('mask')).toHaveLength(2);
    expect(outerHost?.textContent).not.toContain('Boolean operands unavailable');
  });

  it('rebuilds only changed vector content when a stroke asset dependency changes', () => {
    const a = vector('stroke-a', 'rectangle');
    const b = vector('stroke-b', 'ellipse');
    const boolean = (assetId: projectFormatV1.Id): projectFormatV1.Element => {
      const base = projectFormatV1.createElementV1({
        id: id('stroke-boolean'),
        name: 'Stroke boolean',
        geometry: geometry(),
        kind: 'vector',
        geometryData: { kind: 'boolean', operation: 'union', operandIds: [a.id, b.id] },
      });

      return {
        ...base,
        appearance: {
          ...base.appearance,
          strokes: [
            {
              id: id('asset-stroke'),
              enabled: true,
              opacity: 1,
              blendMode: 'normal',
              paint: { kind: 'picture', assetId, fit: 'cover' },
              width: 2,
              alignment: 'center',
              cap: 'round',
              join: 'round',
              miterLimit: 4,
              dash: [],
              dashOffset: 0,
            },
          ],
        },
      };
    };
    const sibling = clock('stroke-sibling');
    const nodes = (combined: projectFormatV1.Element): readonly projectFormatV1.ResolvedSceneNodeV1[] =>
      [a, b, combined, sibling].map((element) => sceneNode({ element, address: address('root', element.id) }));
    const ready = context((assetId) => ({ status: 'ready', url: `blob:${String(assetId)}` }));
    const handle = createResolvedSceneDomV1({ snapshot: snapshot(nodes(boolean(id('asset-a')))), context: ready });
    const booleanHost = handle.root.querySelector<HTMLElement>('[data-element-id="stroke-boolean"]');
    const oldSvg = booleanHost?.querySelector('svg');
    const siblingContent = handle.root.querySelector('[data-element-id="stroke-sibling"] [data-element-content]');

    handle.update(snapshot(nodes(boolean(id('asset-b')))), ready);

    expect(handle.root.querySelector('[data-element-id="stroke-boolean"]')).toBe(booleanHost);
    expect(oldSvg?.isConnected).toBe(false);
    expect(
      booleanHost?.querySelector<HTMLElement>('[data-vector-stroke="asset-stroke"] [data-paint-layer]')?.style
        .backgroundImage,
    ).toContain('blob:asset-b');
    expect(handle.root.querySelector('[data-element-id="stroke-sibling"] [data-element-content]')).toBe(siblingContent);
  });

  it('preserves a path host while replacing its stale stroke-only SVG subtree', () => {
    const path = (assetId: projectFormatV1.Id): projectFormatV1.VectorElement => {
      const base = projectFormatV1.createElementV1({
        id: id('stroke-path'),
        name: 'Stroke path',
        geometry: geometry(),
        kind: 'vector',
        geometryData: {
          kind: 'path',
          fillRule: 'nonzero',
          path: {
            closed: false,
            points: [
              { id: id('stroke-path-a'), x: 0, y: 0 },
              { id: id('stroke-path-b'), x: 10, y: 10 },
            ],
            segments: [
              { id: id('stroke-path-move'), kind: 'move', pointId: id('stroke-path-a') },
              { id: id('stroke-path-line'), kind: 'line', pointId: id('stroke-path-b') },
            ],
          },
        },
      });

      if (base.kind !== 'vector') throw new Error('Expected path vector');

      return {
        ...base,
        appearance: {
          ...base.appearance,
          strokes: [
            {
              id: id('path-asset-stroke'),
              enabled: true,
              opacity: 1,
              blendMode: 'normal',
              paint: { kind: 'picture', assetId, fit: 'cover' },
              width: 2,
              alignment: 'outside',
              cap: 'round',
              join: 'round',
              miterLimit: 4,
              dash: [],
              dashOffset: 0,
            },
          ],
        },
      };
    };
    const ready = context((assetId) => ({ status: 'ready', url: `blob:${String(assetId)}` }));
    const nodes = (element: projectFormatV1.VectorElement): readonly projectFormatV1.ResolvedSceneNodeV1[] => [
      sceneNode({ element, address: address('root', element.id) }),
    ];
    const handle = createResolvedSceneDomV1({ snapshot: snapshot(nodes(path(id('path-asset-a')))), context: ready });
    const host = handle.root.querySelector<HTMLElement>('[data-element-id="stroke-path"]');
    const oldSvg = host?.querySelector('svg');

    handle.update(snapshot(nodes(path(id('path-asset-b')))), ready);

    expect(handle.root.querySelector('[data-element-id="stroke-path"]')).toBe(host);
    expect(oldSvg?.isConnected).toBe(false);
    expect(
      host?.querySelector<HTMLElement>('[data-vector-stroke="path-asset-stroke"] [data-paint-layer]')?.style
        .backgroundImage,
    ).toContain('blob:path-asset-b');
  });

  it('shows complete missing and shared-budget diagnostics for nested boolean operands', () => {
    const baseElement = vector('budget-base', 'rectangle');

    if (baseElement.kind !== 'vector') throw new Error('Expected vector');

    const base = baseElement;
    const missing = projectFormatV1.createElementV1({
      id: id('missing-boolean'),
      name: 'Missing boolean',
      geometry: geometry(),
      kind: 'vector',
      geometryData: { kind: 'boolean', operation: 'union', operandIds: [base.id, id('absent-operand')] },
    });
    const missingHandle = createResolvedSceneDomV1({
      snapshot: snapshot(
        [base, missing].map((element) => sceneNode({ element, address: address('root', element.id) })),
      ),
      context: context(),
    });

    expect(missingHandle.root.querySelector('[data-element-id="missing-boolean"]')?.textContent).toContain(
      'Boolean operand missing',
    );

    const elements: projectFormatV1.VectorElement[] = [base];
    let previous = base;

    for (let index = 0; index < 65; index += 1) {
      const nested = projectFormatV1.createElementV1({
        id: id(`budget-${String(index)}`),
        name: 'Budget boolean',
        geometry: geometry(),
        kind: 'vector',
        geometryData: { kind: 'boolean', operation: 'union', operandIds: [previous.id, base.id] },
      });

      if (nested.kind !== 'vector') throw new Error('Expected vector');
      elements.push(nested);
      previous = nested;
    }

    const budgetHandle = createResolvedSceneDomV1({
      snapshot: snapshot(elements.map((element) => sceneNode({ element, address: address('root', element.id) }))),
      context: context(),
    });

    expect(budgetHandle.root.querySelector(`[data-element-id="${String(previous.id)}"]`)?.textContent).toContain(
      'Boolean operand budget exceeded',
    );
  });

  it('reuses stable hosts and leaves an unaffected sibling content subtree untouched', () => {
    const firstAddress = address('first-root', 'first');
    const secondAddress = address('second-root', 'second');
    const initial = snapshot([
      sceneNode({ element: clock('first', 'A'), address: firstAddress }),
      sceneNode({ element: clock('second', 'B'), address: secondAddress }),
    ]);
    const handle = createResolvedSceneDomV1({ snapshot: initial, context: context() });
    const firstHost = handle.root.querySelector<HTMLElement>('[data-element-id="first"]');
    const secondHost = handle.root.querySelector<HTMLElement>('[data-element-id="second"]');
    const secondContent = secondHost?.querySelector('[data-element-content]');

    handle.update(
      snapshot([
        sceneNode({ element: clock('first', 'Changed'), address: firstAddress }),
        sceneNode({ element: clock('second', 'B'), address: secondAddress }),
      ]),
      context(),
    );

    expect(handle.root.querySelector('[data-element-id="first"]')).toBe(firstHost);
    expect(handle.root.querySelector('[data-element-id="first"]')?.textContent).toBe('Changed');
    expect(handle.root.querySelector('[data-element-id="second"]')).toBe(secondHost);
    expect(secondHost?.querySelector('[data-element-content]')).toBe(secondContent);
  });

  it('updates host-only geometry without rebuilding that element content', () => {
    const elementAddress = address('root', 'clock');
    const initialElement = clock('clock', 'Stable');
    const handle = createResolvedSceneDomV1({
      snapshot: snapshot([sceneNode({ element: initialElement, address: elementAddress })]),
      context: context(),
    });
    const host = handle.root.querySelector<HTMLElement>('[data-element-id="clock"]');
    const content = host?.querySelector('[data-element-content]');
    const payload = content?.firstChild;
    const movedElement: projectFormatV1.Element = { ...initialElement, geometry: geometry(20) };

    handle.update(snapshot([sceneNode({ element: movedElement, address: elementAddress })]), context());

    expect(handle.root.querySelector('[data-element-id="clock"]')).toBe(host);
    expect(host?.querySelector('[data-element-content]')).toBe(content);
    expect(content?.firstChild).toBe(payload);
    expect(host?.style.transform).toBe('matrix(1, 0, 0, 1, 200, 0)');
  });

  it('refreshes host and content CSS when the surface unit context changes', () => {
    const nodeAddress = address('root', 'rectangle');
    const rectangle = projectFormatV1.createElementV1({
      id: id('rectangle'),
      name: 'rectangle',
      geometry: geometry(),
      kind: 'vector',
      geometryData: projectFormatV1.createRectangleGeometry([1, 0, 0, 0]),
    });
    const node = sceneNode({ element: rectangle, address: nodeAddress });
    const millimeterSnapshot = snapshot([node]);
    const pixelSnapshot: projectFormatV1.ResolvedSceneSnapshotV1 = {
      ...millimeterSnapshot,
      surface: { ...millimeterSnapshot.surface, unit: 'px', dpi: 96 },
    };
    const handle = createResolvedSceneDomV1({ snapshot: pixelSnapshot, context: context() });
    const host = handle.root.querySelector<HTMLElement>('[data-element-id="rectangle"]');
    const shape = host?.querySelector<HTMLElement>('[data-element-content]');
    const initialPath = shape?.querySelector<SVGPathElement>('[data-vector-path]');

    expect(host?.style.width).toBe('100px');
    expect(initialPath?.getAttribute('d')).toContain('A 1 1');

    handle.update(millimeterSnapshot, context());

    expect(handle.root.querySelector('[data-element-id="rectangle"]')).toBe(host);
    expect(host?.style.width).toBe('1000px');
    expect(shape?.querySelector<SVGPathElement>('[data-vector-path]')?.getAttribute('d')).toContain('A 1 1');
  });

  it('fails soft when an injected clock begins throwing during an incremental update', () => {
    const nodeAddress = address('root', 'clock');
    const clockNode = sceneNode({ element: clock('clock', 'HH:mm:ss'), address: nodeAddress });
    const handle = createResolvedSceneDomV1({ snapshot: snapshot([clockNode]), context: context() });
    const throwingContext: RenderContextV1 = {
      ...context(),
      clock: {
        now: (): Date => {
          throw new Error('clock failed');
        },
      },
    };

    expect(() => {
      handle.update(snapshot([clockNode]), throwingContext);
    }).not.toThrow();
    expect(handle.root.querySelector('[data-element-id="clock"]')?.textContent).toContain('Realtime clock unavailable');
  });

  it('updates from an injected clock subscription and disposes it on destroy', () => {
    let now = new Date('2026-07-14T12:34:56.000Z');
    let listener: (() => void) | undefined;
    const cleanup = vi.fn();
    const clockContext: RenderContextV1 = {
      ...context(),
      clock: {
        now: (): Date => now,
        subscribe: (next): (() => void) => {
          listener = next;

          return cleanup;
        },
      },
    };
    const clockNode = sceneNode({ element: clock('clock', 'HH:mm:ss'), address: address('root', 'clock') });
    const handle = createResolvedSceneDomV1({ snapshot: snapshot([clockNode]), context: clockContext });

    expect(handle.root.querySelector('[data-element-id="clock"]')?.textContent).toBe('12:34:56');
    now = new Date('2026-07-14T12:34:57.000Z');
    listener?.();
    expect(handle.root.querySelector('[data-element-id="clock"]')?.textContent).toBe('12:34:57');

    handle.destroy();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('moves existing nodes for sibling reorder and reparenting', () => {
    const parentA = address('parent-a-root', 'parent-a');
    const parentB = address('parent-b-root', 'parent-b');
    const child = address('child-root', 'child');
    const parentANode = sceneNode({ element: group('parent-a'), address: parentA });
    const parentBNode = sceneNode({ element: group('parent-b'), address: parentB });
    const childNode = sceneNode({ element: clock('child'), address: child, parentAddress: parentA, depth: 1 });
    const handle = createResolvedSceneDomV1({
      snapshot: snapshot([parentANode, childNode, parentBNode]),
      context: context(),
    });
    const childHost = handle.root.querySelector<HTMLElement>('[data-element-id="child"]');

    handle.update(snapshot([parentBNode, parentANode, { ...childNode, parentAddress: parentB }]), context());

    const layer = handle.root.querySelector<HTMLElement>('[data-broadset-element-layer]');
    const newParent = handle.root.querySelector<HTMLElement>('[data-element-id="parent-b"]');

    expect(layer === null ? [] : directIds(layer)).toEqual(['parent-b', 'parent-a']);
    expect(handle.root.querySelector('[data-element-id="child"]')).toBe(childHost);
    expect(childHost?.parentElement).toBe(newParent);
  });

  it('remounts only kind/vector-subtype changes and detaches removed nodes', () => {
    const changingAddress = address('changing-root', 'changing');
    const removedAddress = address('removed-root', 'removed');
    const handle = createResolvedSceneDomV1({
      snapshot: snapshot([
        sceneNode({ element: vector('changing', 'rectangle'), address: changingAddress }),
        sceneNode({ element: clock('removed'), address: removedAddress }),
      ]),
      context: context(),
    });
    const before = handle.root.querySelector('[data-element-id="changing"]');
    const removed = handle.root.querySelector('[data-element-id="removed"]');

    handle.update(
      snapshot([sceneNode({ element: vector('changing', 'ellipse'), address: changingAddress })]),
      context(),
    );

    expect(handle.root.querySelector('[data-element-id="changing"]')).not.toBe(before);
    expect(removed?.isConnected).toBe(false);
  });

  it('replaces page content, then destroy clears and permanently ignores updates', () => {
    const first = sceneNode({ element: clock('first'), address: address('root', 'first') });
    const second = sceneNode({ element: clock('second'), address: address('root', 'second') });
    const handle = createResolvedSceneDomV1({ snapshot: snapshot([first]), context: context() });
    const firstHost = handle.root.querySelector('[data-element-id="first"]');

    handle.update(snapshot([second], id('page-two')), context());
    expect(firstHost?.isConnected).toBe(false);
    expect(handle.root.querySelector('[data-element-id="second"]')).not.toBeNull();

    handle.destroy();
    handle.update(snapshot([first]), context());
    expect(handle.root.querySelector('[data-element-id]')).toBeNull();
  });

  it('provides a detached fail-soft one-shot root', () => {
    const root = renderResolvedSceneV1(snapshot([]), context());

    expect(root.dataset['broadsetCanvasRoot']).toBeUndefined();
    expect(root.querySelector(':scope > [data-broadset-canvas-root]')).not.toBeNull();
    expect(root.isConnected).toBe(false);
  });

  it('keeps one-shot realtime clocks static so no undisposable subscription is created', () => {
    const subscribe = vi.fn((_listener: () => void): (() => void) => vi.fn());
    const clockContext: RenderContextV1 = {
      ...context(),
      clock: { now: TEST_CLOCK.now, subscribe },
    };
    const root = renderResolvedSceneV1(
      snapshot([sceneNode({ element: clock('clock', 'HH:mm:ss'), address: address('root', 'clock') })]),
      clockContext,
    );

    expect(root.textContent).toContain('12:34:56');
    expect(subscribe).not.toHaveBeenCalled();
  });
});
