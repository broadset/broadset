import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { renderResolvedElementV1 } from './element-dom';
import { createBooleanSvgV1 } from './vector-svg';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);
const red: projectFormatV1.ConcreteColorValue = {
  kind: 'color',
  space: 'srgb',
  channels: [1, 0, 0],
  alpha: 1,
};

function vector(
  value: string,
  geometryData: projectFormatV1.VectorGeometryData,
  transform: projectFormatV1.ElementTransform = { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
): projectFormatV1.VectorElement {
  const result = projectFormatV1.createElementV1({
    id: id(value),
    name: value,
    geometry: projectFormatV1.createElementGeometry({ width: 100, height: 50, transform }),
    kind: 'vector',
    geometryData,
  });

  if (result.kind !== 'vector') throw new Error('Expected vector');

  return result;
}

function withStroke(
  element: projectFormatV1.VectorElement,
  value: string,
  alignment: projectFormatV1.StrokeLayer['alignment'],
  join: projectFormatV1.StrokeLayer['join'] = 'round',
): projectFormatV1.VectorElement {
  return {
    ...element,
    appearance: {
      ...element.appearance,
      strokes: [
        {
          id: id(value),
          enabled: true,
          opacity: 1,
          blendMode: 'normal',
          paint: { kind: 'solid', color: red },
          width: 4,
          alignment,
          cap: 'round',
          join,
          miterLimit: 4,
          dash: [],
          dashOffset: 0,
        },
      ],
    },
  };
}

function render(
  element: projectFormatV1.VectorElement,
  operands: readonly projectFormatV1.VectorElement[],
  operandMap = new Map(operands.map((operand) => [operand.id, operand])),
): SVGSVGElement | undefined {
  return createBooleanSvgV1({
    document,
    element,
    operands,
    operandMap,
    backgroundImage: 'linear-gradient(red, red)',
    backgroundBlendMode: '',
    context: {
      document,
      swatches: new Map(),
      fonts: new Map(),
      resolveAsset: (assetId) => ({ status: 'ready', url: `blob:${String(assetId)}` }),
    },
    units: { unit: 'px', dpi: 96 },
  });
}

function renderElement(element: projectFormatV1.VectorElement): HTMLElement {
  const node: projectFormatV1.ResolvedSceneNodeV1 = {
    address: { rootInstanceId: id('root'), componentInstancePath: [], elementId: element.id },
    parentAddress: null,
    sourceElement: element,
    element,
    localGeometry: element.geometry,
    worldGeometry: element.geometry,
    visible: true,
    depth: 0,
    properties: [],
    fallbacks: [],
  };

  return renderResolvedElementV1({
    node,
    context: {
      document,
      swatches: new Map(),
      fonts: new Map(),
      resolveAsset: (assetId) => ({ status: 'ready', url: `blob:${String(assetId)}` }),
    },
    units: { unit: 'mm', dpi: 254 },
  });
}

function strokedOrdinaryVector(
  value: string,
  geometryData: projectFormatV1.VectorGeometryData,
): projectFormatV1.VectorElement {
  const base = vector(value, geometryData);
  const gradient: projectFormatV1.Gradient = {
    kind: 'linear',
    start: [0, 0],
    end: [1, 0],
    stops: [
      { id: id('gradient-a'), color: red, opacity: 1, offset: 0 },
      { id: id('gradient-b'), color: { ...red, channels: [0, 0, 1] }, opacity: 1, offset: 1 },
    ],
    coordinateSpace: 'object-bounds',
    transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
    spread: 'pad',
    interpolation: 'srgb',
  };
  const common: Pick<
    projectFormatV1.StrokeLayer,
    'enabled' | 'width' | 'alignment' | 'cap' | 'join' | 'miterLimit' | 'dash' | 'dashOffset'
  > = {
    enabled: true,
    width: 2,
    alignment: 'center',
    cap: 'square',
    join: 'miter',
    miterLimit: 7,
    dash: [1, 2],
    dashOffset: 0.5,
  };

  return {
    ...base,
    appearance: {
      ...base.appearance,
      strokes: [
        {
          ...common,
          id: id('solid-stroke'),
          opacity: 0.9,
          blendMode: 'multiply',
          paint: { kind: 'solid', color: red },
          startArrow: { kind: 'triangle', length: 4, width: 3 },
          endArrow: { kind: 'diamond', length: 5, width: 4 },
        },
        {
          ...common,
          id: id('gradient-stroke'),
          opacity: 0.8,
          blendMode: 'screen',
          paint: { kind: 'gradient', gradient },
          alignment: 'inside',
          cap: 'round',
          join: 'bevel',
        },
        {
          ...common,
          id: id('picture-stroke'),
          opacity: 0.7,
          blendMode: 'overlay',
          paint: { kind: 'picture', assetId: id('picture-stroke-asset'), fit: 'cover' },
          alignment: 'outside',
        },
        {
          ...common,
          id: id('pattern-stroke'),
          opacity: 0.6,
          blendMode: 'normal',
          paint: {
            kind: 'pattern',
            assetId: id('pattern-stroke-asset'),
            repeat: 'mirror',
            transform: { kind: 'affine2d', matrix: [2, 0, 0, 3, 1, 2] },
          },
        },
      ],
    },
  };
}

describe('boolean SVG fidelity', () => {
  it.each([
    ['rectangle', projectFormatV1.createRectangleGeometry()],
    [
      'path',
      {
        kind: 'path',
        fillRule: 'nonzero',
        path: {
          closed: false,
          points: [
            { id: id('ordinary-start'), x: 0, y: 0 },
            { id: id('ordinary-end'), x: 100, y: 50 },
          ],
          segments: [
            { id: id('ordinary-move'), kind: 'move', pointId: id('ordinary-start') },
            { id: id('ordinary-line'), kind: 'line', pointId: id('ordinary-end') },
          ],
        },
      } satisfies projectFormatV1.VectorGeometryData,
    ],
  ])('renders complete ordered stroke layers for an ordinary %s vector', (name, geometryData) => {
    const host = renderElement(strokedOrdinaryVector(`ordinary-${name}`, geometryData));
    const strokes = host.querySelectorAll<SVGGElement>('[data-vector-stroke]');

    expect(Array.from(strokes, (stroke) => stroke.dataset['vectorStroke'])).toEqual([
      'solid-stroke',
      'gradient-stroke',
      'picture-stroke',
      'pattern-stroke',
    ]);
    expect(strokes[0]?.dataset['strokeWidth']).toBe('20');
    expect(strokes[0]?.dataset['strokeDasharray']).toBe('10 20');
    expect(strokes[0]?.dataset['strokeDashoffset']).toBe('5');
    expect(strokes[0]?.dataset['strokeLinecap']).toBe('square');
    expect(strokes[0]?.dataset['strokeLinejoin']).toBe('miter');
    expect(strokes[0]?.dataset['strokeMiterlimit']).toBe('7');
    expect(strokes[0]?.dataset['strokeAlignment']).toBe('center');
    expect(strokes[0]?.style.opacity).toBe('0.9');
    expect(strokes[0]?.style.mixBlendMode).toBe('multiply');
    expect(host.querySelector('[data-arrow-start="triangle"]')).not.toBeNull();
    expect(host.querySelector('[data-arrow-end="diamond"]')).not.toBeNull();
    expect(host.querySelector('svg')?.style.overflow).toBe('visible');
    expect(strokes[0]?.querySelector('foreignObject')?.getAttribute('x')).toBe('-7');
    expect(strokes[0]?.querySelector('foreignObject')?.getAttribute('width')).toBe('114');
    expect(strokes[2]?.querySelector('foreignObject')?.getAttribute('x')).toBe('-14');
    expect(strokes[1]?.querySelector<HTMLElement>('[data-paint-layer]')?.style.backgroundImage).toContain(
      'linear-gradient',
    );
    expect(strokes[2]?.querySelector<HTMLElement>('[data-paint-layer]')?.style.backgroundImage).toContain(
      'blob:picture-stroke-asset',
    );
    expect(strokes[3]?.querySelector('[data-pattern-mirror]')).not.toBeNull();
    expect(host.textContent).not.toContain('Stroke paint preview unavailable');
  });

  it('expands an acute mitered path paint surface through the authored miter limit', () => {
    const geometryData: projectFormatV1.VectorGeometryData = {
      kind: 'path',
      fillRule: 'nonzero',
      path: {
        closed: false,
        points: [
          { id: id('acute-a'), x: 0, y: 50 },
          { id: id('acute-b'), x: 50, y: 0 },
          { id: id('acute-c'), x: 51, y: 50 },
        ],
        segments: [
          { id: id('acute-move'), kind: 'move', pointId: id('acute-a') },
          { id: id('acute-line-a'), kind: 'line', pointId: id('acute-b') },
          { id: id('acute-line-b'), kind: 'line', pointId: id('acute-c') },
        ],
      },
    };
    const host = renderElement(strokedOrdinaryVector('acute-miter', geometryData));
    const surface = host.querySelector('[data-vector-stroke="solid-stroke"] foreignObject');

    expect(surface?.getAttribute('x')).toBe('-7');
    expect(surface?.getAttribute('width')).toBe('114');
  });

  it('fails visibly before serializing an excessive ordinary stroke dash array', () => {
    const element = strokedOrdinaryVector('dash-budget', projectFormatV1.createRectangleGeometry());
    const stroke = element.appearance.strokes[0];

    if (stroke === undefined) throw new Error('Expected stroke');

    const host = renderElement({
      ...element,
      appearance: { ...element.appearance, strokes: [{ ...stroke, dash: Array.from({ length: 65 }, () => 1) }] },
    });

    expect(host.textContent).toContain('Stroke dash output budget exceeded');
    expect(host.querySelector('[data-vector-stroke="solid-stroke"]')).toBeNull();
  });

  it('allocates collision-free definition namespaces for separate SVG instances', () => {
    const element = strokedOrdinaryVector('definition-ids', projectFormatV1.createRectangleGeometry());
    const first = renderElement(element);
    const second = renderElement(element);
    const firstIds = new Set(Array.from(first.querySelectorAll('[id]'), (node) => node.id));
    const secondIds = Array.from(second.querySelectorAll('[id]'), (node) => node.id);

    expect(secondIds.every((definitionId) => !firstIds.has(definitionId))).toBe(true);
  });
  it('preserves rounded rectangles, evenodd clip rules, and representable matrix3d operands', () => {
    const rounded = vector('rounded', projectFormatV1.createRectangleGeometry([10, 20, 30, 40]));
    const path = vector(
      'path',
      {
        kind: 'path',
        fillRule: 'evenodd',
        path: { points: [], segments: [], closed: true },
      },
      {
        kind: 'matrix3d',
        matrix: [1, 2, 0, 0, 3, 4, 0, 0, 0, 0, 1, 0, 5, 6, 0, 1],
      },
    );
    const result = render(
      vector('combined', { kind: 'boolean', operation: 'union', operandIds: [rounded.id, path.id] }),
      [rounded, path],
    );
    const operands = result?.querySelectorAll('mask > path');

    expect(operands?.[1]?.getAttribute('d')).toContain('A 10 10');
    expect(operands?.[2]?.getAttribute('clip-rule')).toBe('evenodd');
    expect(operands?.[2]?.getAttribute('transform')).toBe('matrix(1 2 3 4 5 6)');
  });

  it('renders nested booleans and ordered solid stroke layers, and fails visibly for perspective operands', () => {
    const a = vector('a', projectFormatV1.createRectangleGeometry());
    const b = vector('b', projectFormatV1.createEllipseGeometry());
    const nested = vector('nested', { kind: 'boolean', operation: 'union', operandIds: [a.id, b.id] });
    const outerBase = vector('outer', { kind: 'boolean', operation: 'subtract', operandIds: [nested.id, b.id] });
    const outer: projectFormatV1.VectorElement = {
      ...outerBase,
      appearance: {
        ...outerBase.appearance,
        strokes: [
          {
            id: id('stroke'),
            enabled: true,
            opacity: 0.5,
            blendMode: 'multiply',
            paint: { kind: 'solid', color: red },
            width: 4,
            alignment: 'center',
            cap: 'round',
            join: 'round',
            miterLimit: 3,
            dash: [],
            dashOffset: 1,
          },
        ],
      },
    };
    const result = render(
      outer,
      [nested, b],
      new Map([
        [a.id, a],
        [b.id, b],
        [nested.id, nested],
      ]),
    );
    const stroke = result?.querySelector('[data-vector-stroke="stroke"]');
    const perspective = vector('perspective', projectFormatV1.createRectangleGeometry(), {
      kind: 'matrix3d',
      matrix: [1, 0, 0, 0.1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    });

    expect(result?.querySelectorAll('mask[id^="broadset-boolean-mask-"]')).toHaveLength(2);
    expect(stroke?.getAttribute('data-stroke-width')).toBe('4');
    expect(stroke?.getAttribute('data-stroke-linecap')).toBe('round');
    expect(stroke?.getAttribute('data-stroke-dasharray')).toBe('');
    expect(result?.querySelector('filter feMorphology[operator="dilate"]')).not.toBeNull();
    expect(
      render(vector('invalid', { kind: 'boolean', operation: 'union', operandIds: [perspective.id, b.id] }), [
        perspective,
        b,
      ]),
    ).toBeUndefined();
  });

  it('uses full stroke widths for inside and outside morphology', () => {
    const a = vector('radius-a', projectFormatV1.createRectangleGeometry());
    const b = vector('radius-b', projectFormatV1.createEllipseGeometry());
    const boolean = vector('radius-boolean', {
      kind: 'boolean',
      operation: 'union',
      operandIds: [a.id, b.id],
    });
    const inside = render(withStroke(boolean, 'inside', 'inside'), [a, b]);
    const outside = render(withStroke(boolean, 'outside', 'outside'), [a, b]);
    const radii = (result: SVGSVGElement | undefined): string[] =>
      [...(result?.querySelectorAll('filter feMorphology') ?? [])].map(
        (morphology) => morphology.getAttribute('radius') ?? '',
      );

    expect(radii(inside)).toEqual(['4', '4']);
    expect(radii(outside)).toEqual(['4', '4']);
  });

  it('renders a visible fallback for unsupported stroke semantics', () => {
    const a = vector('fallback-a', projectFormatV1.createRectangleGeometry());
    const b = vector('fallback-b', projectFormatV1.createEllipseGeometry());
    const base = withStroke(
      vector('fallback-boolean', {
        kind: 'boolean',
        operation: 'union',
        operandIds: [a.id, b.id],
      }),
      'unsupported',
      'center',
      'bevel',
    );
    const stroke = base.appearance.strokes[0];

    if (stroke === undefined) throw new Error('Expected stroke');

    const boolean: projectFormatV1.VectorElement = {
      ...base,
      appearance: { ...base.appearance, strokes: [{ ...stroke, dash: [2, 1] }] },
    };
    const result = render(boolean, [a, b]);
    const fallback = result?.querySelector('[data-vector-stroke-fallback="unsupported"]');

    expect(fallback?.textContent).toBe('Implicit boolean boundary cannot represent dashed or arrow strokes');
    expect(result?.querySelector('[data-vector-stroke]')).toBeNull();
  });

  it('bounds deep nesting and indirect cycles across the whole boolean traversal', () => {
    const base = vector('base', projectFormatV1.createRectangleGeometry());
    const operands = new Map<projectFormatV1.Id, projectFormatV1.VectorElement>([[base.id, base]]);
    let previous = base;

    for (let index = 0; index < 66; index += 1) {
      const nested = vector(`nested-${String(index)}`, {
        kind: 'boolean',
        operation: 'union',
        operandIds: [previous.id, base.id],
      });

      operands.set(nested.id, nested);
      previous = nested;
    }

    const previousOperands =
      previous.geometryData.kind === 'boolean' ?
        previous.geometryData.operandIds.flatMap((operandId) => {
          const operand = operands.get(operandId);

          return operand === undefined ? [] : [operand];
        })
      : [];

    expect(render(previous, previousOperands, operands)).toBeUndefined();

    const cycleA = vector('cycle-a', { kind: 'boolean', operation: 'union', operandIds: [id('cycle-b'), base.id] });
    const cycleB = vector('cycle-b', { kind: 'boolean', operation: 'union', operandIds: [cycleA.id, base.id] });
    const cycleMap = new Map([
      [base.id, base],
      [cycleA.id, cycleA],
      [cycleB.id, cycleB],
    ]);

    expect(render(cycleA, [cycleB, base], cycleMap)).toBeUndefined();
  });

  it('applies one complete budget across wide nested booleans and reuses shared DAG nodes', () => {
    const leaves = Array.from({ length: 70 }, (_, index) =>
      vector(`wide-leaf-${String(index)}`, projectFormatV1.createRectangleGeometry()),
    );
    const left = vector('wide-left', {
      kind: 'boolean',
      operation: 'union',
      operandIds: leaves.slice(0, 35).map((leaf) => leaf.id),
    });
    const right = vector('wide-right', {
      kind: 'boolean',
      operation: 'union',
      operandIds: leaves.slice(35).map((leaf) => leaf.id),
    });
    const wide = vector('wide-root', {
      kind: 'boolean',
      operation: 'union',
      operandIds: [left.id, right.id],
    });
    const wideMap = new Map(
      [...leaves, left, right].map((operand): readonly [projectFormatV1.Id, projectFormatV1.VectorElement] => [
        operand.id,
        operand,
      ]),
    );

    expect(() => render(wide, [left, right], wideMap)).not.toThrow();
    expect(render(wide, [left, right], wideMap)).toBeUndefined();

    const a = vector('dag-a', projectFormatV1.createRectangleGeometry());
    const b = vector('dag-b', projectFormatV1.createEllipseGeometry());
    const shared = vector('dag-shared', {
      kind: 'boolean',
      operation: 'intersect',
      operandIds: [a.id, b.id],
    });
    const branchA = vector('dag-branch-a', {
      kind: 'boolean',
      operation: 'union',
      operandIds: [shared.id, a.id],
    });
    const branchB = vector('dag-branch-b', {
      kind: 'boolean',
      operation: 'subtract',
      operandIds: [shared.id, b.id],
    });
    const root = vector('dag-root', {
      kind: 'boolean',
      operation: 'exclude',
      operandIds: [branchA.id, branchB.id],
    });
    const dagMap = new Map(
      [a, b, shared, branchA, branchB].map((operand): readonly [projectFormatV1.Id, projectFormatV1.VectorElement] => [
        operand.id,
        operand,
      ]),
    );
    const result = render(root, [branchA, branchB], dagMap);
    const intersectionParent = vector('dag-intersection-parent', {
      kind: 'boolean',
      operation: 'intersect',
      operandIds: [shared.id, a.id],
    });
    const intersection = render(intersectionParent, [shared, a], dagMap);

    expect(result).not.toBeUndefined();
    expect(result?.querySelectorAll('[data-boolean-combined="intersect"]')).toHaveLength(2);

    const nestedIntersection = Array.from(
      intersection?.querySelectorAll('[data-boolean-combined="intersect"]') ?? [],
    ).find((node) => node.parentElement?.tagName === 'mask');

    expect(nestedIntersection?.getAttribute('mask')).toContain('boolean-mask');
    expect(nestedIntersection?.parentElement?.id).toContain('boolean-intersection');
    expect(intersection?.querySelector('[id*="boolean-intersection"]')?.tagName).toBe('mask');
  });
});
