import { describe, expect, it } from 'vitest';

import {
  createBlackColorValue,
  createDefaultAppearance,
  createElementGeometry,
  createElementV1,
  createEmptyTextBody,
} from './construction';
import { idSchema, type PropertyTarget } from './identity';
import { applyResolvedOverrideV1, readResolvedPropertyValueV1 } from './resolved-overrides';

const id = (value: string): ReturnType<typeof idSchema.parse> => idSchema.parse(value);

function target(entityKind: string, entityId: string, pointer: string): PropertyTarget {
  return {
    entity: { projectId: id('project'), documentId: id('document'), entityKind, entityId: id(entityId) },
    pointer,
  };
}

function pathElement() {
  const appearance = createDefaultAppearance();

  return createElementV1({
    id: id('shape'),
    name: 'Shape',
    kind: 'vector',
    geometry: createElementGeometry({ width: 100, height: 100 }),
    appearance: {
      ...appearance,
      fills: [
        {
          id: id('fill'),
          enabled: true,
          opacity: 1,
          blendMode: 'normal',
          paint: { kind: 'solid', color: createBlackColorValue() },
        },
      ],
    },
    geometryData: {
      kind: 'path',
      fillRule: 'nonzero',
      path: {
        points: [{ id: id('point'), x: 2, y: 3 }],
        segments: [{ id: id('move'), kind: 'move', pointId: id('point') }],
        closed: false,
      },
    },
  });
}

describe('applyResolvedOverrideV1', () => {
  it('applies an approved element pointer immutably', () => {
    const source = pathElement();
    const result = applyResolvedOverrideV1(source, target('element', 'shape', '/appearance/opacity'), {
      type: 'number',
      value: 0.35,
    });

    expect(result?.appearance.opacity).toBe(0.35);
    expect(source.appearance.opacity).toBe(1);
    expect(result).not.toBe(source);
  });

  it('applies approved stable nested-entity targets without collection indexes', () => {
    const source = pathElement();
    const withFill = applyResolvedOverrideV1(source, target('fill', 'fill', '/opacity'), {
      type: 'number',
      value: 0.4,
    });

    expect(withFill).toBeDefined();
    if (withFill === undefined) return;

    const withPoint = applyResolvedOverrideV1(withFill, target('path-point', 'point', '/x'), {
      type: 'length',
      value: 12,
    });

    expect(withPoint?.appearance.fills[0]?.opacity).toBe(0.4);
    expect(
      withPoint?.kind === 'vector' && withPoint.geometryData.kind === 'path' ?
        withPoint.geometryData.path.points[0]?.x
      : undefined,
    ).toBe(12);
    expect(source.appearance.fills[0]?.opacity).toBe(1);
  });

  it('rejects forbidden pointers and incompatible typed values', () => {
    const source = pathElement();

    expect(
      applyResolvedOverrideV1(source, target('element', 'shape', '/id'), { type: 'string', value: 'other' }),
    ).toBeUndefined();
    expect(
      applyResolvedOverrideV1(source, target('element', 'shape', '/appearance/opacity'), {
        type: 'string',
        value: 'wrong',
      }),
    ).toBeUndefined();
    expect(
      applyResolvedOverrideV1(source, target('fill', 'missing', '/opacity'), { type: 'number', value: 0.5 }),
    ).toBeUndefined();
  });

  it('applies an approved fixed text padding tuple position', () => {
    const text = createElementV1({
      id: id('text'),
      name: 'Text',
      kind: 'text',
      geometry: createElementGeometry({ width: 100, height: 40 }),
      text: createEmptyTextBody({
        paragraphId: id('paragraph'),
        runId: id('run'),
        fontFamilyId: id('font-family'),
        fontFaceId: id('font-face'),
      }),
    });
    const paddingTarget = target('element', 'text', '/layout/padding/2');
    const result = applyResolvedOverrideV1(text, paddingTarget, {
      type: 'length',
      value: 9,
    });

    expect(readResolvedPropertyValueV1(text, paddingTarget)).toEqual({ type: 'length', value: 0 });
    expect(result?.kind === 'text' ? result.layout.padding : undefined).toEqual([0, 0, 9, 0]);
  });
});
