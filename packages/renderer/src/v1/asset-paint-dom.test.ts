import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { renderResolvedElementV1 } from './element-dom';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);

describe('asset-backed appearance paints', () => {
  it('preserves ordered picture/pattern layers with fit, crop, repeat, transform, opacity, and blend', () => {
    const pictureId = id('picture-asset');
    const patternId = id('pattern-asset');
    const element = projectFormatV1.createElementV1({
      id: id('element'),
      name: 'Painted rectangle',
      geometry: projectFormatV1.createElementGeometry({ width: 100, height: 50 }),
      appearance: {
        ...projectFormatV1.createDefaultAppearance(),
        fills: [
          {
            id: id('picture'),
            enabled: true,
            opacity: 0.75,
            blendMode: 'multiply',
            paint: {
              kind: 'picture',
              assetId: pictureId,
              fit: 'cover',
              crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.25 },
            },
          },
          {
            id: id('pattern'),
            enabled: true,
            opacity: 0.5,
            blendMode: 'screen',
            paint: {
              kind: 'pattern',
              assetId: patternId,
              repeat: 'repeat-x',
              transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
            },
          },
        ],
      },
      kind: 'vector',
      geometryData: projectFormatV1.createRectangleGeometry(),
    });
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
    const host = renderResolvedElementV1({
      node,
      context: {
        document,
        swatches: new Map(),
        fonts: new Map(),
        resolveAsset: (assetId) => ({ status: 'ready', url: `blob:${String(assetId)}` }),
      },
      units: { unit: 'px', dpi: 96 },
    });
    const layers = host.querySelectorAll<HTMLElement>('[data-paint-layer]');

    expect(Array.from(layers, (layer) => layer.dataset['paintLayer'])).toEqual(['picture', 'pattern']);
    expect(layers[0]?.style.backgroundImage).toContain('blob:picture-asset');
    expect(layers[0]?.style.backgroundSize).toBe('200% 400%');
    expect(layers[0]?.style.backgroundPosition).toBe('20% 26.66667%');
    expect(layers[0]?.style.opacity).toBe('0.75');
    expect(layers[1]?.dataset['patternRepeat']).toBe('repeat-x');
    expect(layers[1]?.querySelector('pattern')?.getAttribute('patternTransform')).toBe('matrix(1 0 0 1 0 0)');
    expect(layers[1]?.style.mixBlendMode).toBe('screen');
  });

  it('renders a visible inert diagnostic when an appearance asset cannot resolve', () => {
    const element = projectFormatV1.createElementV1({
      id: id('element'),
      name: 'Missing paint',
      geometry: projectFormatV1.createElementGeometry({ width: 100, height: 50 }),
      appearance: {
        ...projectFormatV1.createDefaultAppearance(),
        fills: [
          {
            id: id('picture'),
            enabled: true,
            opacity: 1,
            blendMode: 'normal',
            paint: { kind: 'picture', assetId: id('missing'), fit: 'contain' },
          },
        ],
      },
      kind: 'vector',
      geometryData: projectFormatV1.createRectangleGeometry(),
    });
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
    const host = renderResolvedElementV1({
      node,
      context: {
        document,
        swatches: new Map(),
        fonts: new Map(),
        resolveAsset: () => ({ status: 'missing', diagnostic: 'Paint asset missing' }),
      },
      units: { unit: 'px', dpi: 96 },
    });

    expect(host.textContent).toContain('Paint asset missing');
  });

  it('renders nonidentity and mirrored pattern transforms instead of rejecting them', () => {
    const assetId = id('pattern-asset');
    const element = projectFormatV1.createElementV1({
      id: id('transformed-pattern-element'),
      name: 'Transformed patterns',
      geometry: projectFormatV1.createElementGeometry({ width: 100, height: 50 }),
      appearance: {
        ...projectFormatV1.createDefaultAppearance(),
        fills: [
          {
            id: id('affine-pattern'),
            enabled: true,
            opacity: 0.6,
            blendMode: 'multiply',
            paint: {
              kind: 'pattern',
              assetId,
              repeat: 'repeat-x',
              transform: { kind: 'affine2d', matrix: [2, 0.25, -0.5, 3, 10, 5] },
            },
          },
          {
            id: id('mirror-pattern'),
            enabled: true,
            opacity: 0.4,
            blendMode: 'screen',
            paint: {
              kind: 'pattern',
              assetId,
              repeat: 'mirror',
              transform: { kind: 'affine2d', matrix: [4, 0, 0, 6, 2, 3] },
            },
          },
        ],
      },
      kind: 'vector',
      geometryData: projectFormatV1.createRectangleGeometry(),
    });
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
    const host = renderResolvedElementV1({
      node,
      context: {
        document,
        swatches: new Map(),
        fonts: new Map(),
        resolveAsset: () => ({ status: 'ready', url: 'blob:pattern' }),
      },
      units: { unit: 'mm', dpi: 254 },
    });
    const affine = host.querySelector<HTMLElement>('[data-paint-layer="affine-pattern"]');
    const mirror = host.querySelector<HTMLElement>('[data-paint-layer="mirror-pattern"]');

    expect(affine?.textContent).not.toContain('unavailable');
    expect(affine?.querySelector('pattern')?.getAttribute('patternTransform')).toBe('matrix(2 0.25 -0.5 3 100 50)');
    expect(affine?.querySelector('pattern')?.getAttribute('width')).toBe('1');
    expect(affine?.querySelector('pattern')?.getAttribute('height')).toBe('100%');
    expect(affine?.style.backgroundImage).toBe('');
    expect(affine?.style.opacity).toBe('0.6');
    expect(affine?.style.mixBlendMode).toBe('multiply');
    expect(mirror?.querySelector('[data-pattern-mirror]')).not.toBeNull();
    expect(mirror?.querySelector('pattern')?.getAttribute('patternTransform')).toBe('matrix(4 0 0 6 20 30)');
    expect(mirror?.querySelector('image')?.getAttribute('href')).toBe('blob:pattern');
    expect(mirror?.style.backgroundImage).toBe('');
    expect(mirror?.style.opacity).toBe('0.4');
    expect(mirror?.style.mixBlendMode).toBe('screen');

    affine?.querySelector('image')?.dispatchEvent(new Event('error'));
    expect(affine?.textContent).toContain('Pattern asset failed to load');
  });
});
