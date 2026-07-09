import './runtime-canvas';

import { readPsd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { exportPsdBytes } from './export';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

function readLayerBounds(type: 'text' | 'path'): { readonly width: number; readonly height: number } {
  const element = makeElement(type, {
    id: `${type}-bounds`,
    name: `${type} bounds`,
    position: { x: 25, y: 15 },
    width: 100,
    height: 40,
    content: type === 'text' ? 'Hello' : 'M 0 0 L 100 40',
    style: makeStyle({
      opacity: 1,
      borderColor: { kind: 'rgb', hex: '#ff0000' },
      borderWidth: 2,
    }),
  });
  const psd = readPsd(exportPsdBytes(makeDocument({ elements: [element] })), {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  const layer = psd.children?.[0];

  return {
    width: (layer?.right ?? 0) - (layer?.left ?? 0),
    height: (layer?.bottom ?? 0) - (layer?.top ?? 0),
  };
}

describe('PSD export — layer channel bounds', () => {
  it('round-trips text layers with non-zero PSD bounds', () => {
    expect(readLayerBounds('text')).toEqual({ width: 100, height: 40 });
  });

  it('round-trips path layers with non-zero PSD bounds', () => {
    expect(readLayerBounds('path')).toEqual({ width: 100, height: 40 });
  });
});
