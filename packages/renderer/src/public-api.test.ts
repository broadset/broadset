import { describe, expect, it } from 'vitest';

import * as renderer from './index';

describe('@broadset/renderer public API', () => {
  it('exports only the resolved-scene v1 runtime surface', () => {
    expect(new Set(Object.keys(renderer))).toEqual(
      new Set([
        'appearanceToStyle',
        'colorValueToCss',
        'createResolvedSceneDomV1',
        'geometryToBoxStyle',
        'gradientToCss',
        'gradientToDataAttributeV1',
        'paragraphToStyle',
        'pluginRendererKeyV1',
        'renderResolvedSceneV1',
        'runToStyle',
        'runToStyleV1',
        'sceneInstanceKeyV1',
        'spatialValueToCssPixelsV1',
        'transformToCss',
      ]),
    );
    expect('renderPageV1' in renderer).toBe(false);
  });
});
