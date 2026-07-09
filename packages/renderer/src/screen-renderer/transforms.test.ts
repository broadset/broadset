import type { BroadsetElement, BroadsetElementStyle } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { buildElementTransform } from './transforms';

function makeElement(overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id: 'el-test',
    type: 'rectangle',
    name: 'Test',
    parentId: null,
    locked: false,
    width: 100,
    height: 50,
    rotation: 0,
    position: { x: 10, y: 20 },
    content: '',
    dataField: undefined,
    repeater: undefined,
    visibleWhen: undefined,
    clipboard: undefined,
    assetId: undefined,
    extensions: {},
    ...overrides,
    style: {
      ...(overrides.style ?? {}),
    } as BroadsetElementStyle,
  } as BroadsetElement;
}

describe('buildElementTransform', () => {
  it('returns an empty string when rotation and 3D transforms are absent', () => {
    const element = makeElement();

    expect(buildElementTransform(element, element.style)).toBe('');
  });

  it('emits only the 2D rotation when rotation is non-zero and no 3D style is set', () => {
    const element = makeElement({ rotation: 45 });

    expect(buildElementTransform(element, element.style)).toBe('rotate(45deg)');
  });

  it('appends rotateX in degree units when style.rotateX is set', () => {
    const element = makeElement({ style: { rotateX: 30 } as BroadsetElementStyle });

    expect(buildElementTransform(element, element.style)).toBe('rotateX(30deg)');
  });

  it('emits rotation, rotateX, rotateY, rotateZ, and translateZ in a stable order', () => {
    const element = makeElement({
      rotation: 10,
      style: {
        rotateX: 20,
        rotateY: 30,
        rotateZ: 40,
        translateZ: 50,
      } as BroadsetElementStyle,
    });

    expect(buildElementTransform(element, element.style)).toBe(
      'rotate(10deg) rotateX(20deg) rotateY(30deg) rotateZ(40deg) translateZ(50px)',
    );
  });

  it('omits 3D tokens whose values are undefined', () => {
    const element = makeElement({
      rotation: 15,
      style: { rotateY: 10 } as BroadsetElementStyle,
    });

    expect(buildElementTransform(element, element.style)).toBe('rotate(15deg) rotateY(10deg)');
  });

  it('omits 3D tokens whose values are explicitly 0 so effectively flat elements stay 2D', () => {
    const element = makeElement({
      rotation: 0,
      style: {
        rotateX: 0,
        rotateY: 0,
        rotateZ: 0,
        translateZ: 0,
      } as BroadsetElementStyle,
    });

    expect(buildElementTransform(element, element.style)).toBe('');
  });
});
