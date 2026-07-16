import { createProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from './sample-project-v1';
import { toPanelElementV1 } from './v1-panel-adapter';
import { updateElementFromPanelV1 } from './v1-panel-mutations';

describe('updateElementFromPanelV1', () => {
  it('writes geometry, appearance, and structured text through v1 element shapes', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const elementId = projectFormatV1.idSchema.parse('el-sb-home-score');

    for (const [key, value] of [
      ['x', 180],
      ['width', 72],
      ['rotation', 12],
      ['opacity', 0.75],
      ['content', '3'],
      ['fontSize', 48],
      ['fontColor', '#ff000080'],
    ] as const) {
      expect(
        store.getState().updateElement(elementId, (element) => updateElementFromPanelV1({ element, key, value })),
      ).toBe(true);
    }

    const document = store.getState().project.documents[0];
    const element = document?.elements.find((candidate) => candidate.id === elementId);

    expect(element?.geometry.bounds.width).toBe(72);
    expect(element?.geometry.transform.kind).toBe('affine2d');

    if (element?.geometry.transform.kind !== 'affine2d') throw new Error('Expected affine transform');

    expect(element.geometry.transform.matrix[4]).toBe(180);
    expect(element.appearance.opacity).toBe(0.75);

    if (element.kind !== 'text') throw new Error('Expected text element');

    expect(element.text.paragraphs[0]?.runs[0]?.text).toBe('3');
    expect(element.text.paragraphs[0]?.runs[0]?.properties).toMatchObject({
      size: 48,
      color: { kind: 'color', space: 'srgb', channels: [1, 0, 0], alpha: 128 / 255 },
    });
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('fails soft for unsupported values', () => {
    const element = SAMPLE_PROJECT_V1.documents[0]?.elements.find(({ id }) => id === 'el-scorebug');

    if (element === undefined) throw new Error('Expected fixture element');

    expect(updateElementFromPanelV1({ element, key: 'opacity', value: 'opaque' })).toBe(element);
    expect(updateElementFromPanelV1({ element, key: 'fontColor', value: 'not-a-color' })).toBe(element);
  });

  it('writes image fit and text padding through their canonical v1 fields', () => {
    const image = SAMPLE_PROJECT_V1.documents[0]?.elements.find(({ kind }) => kind === 'image');
    const text = SAMPLE_PROJECT_V1.documents[0]?.elements.find(({ kind }) => kind === 'text');

    if (image === undefined || text === undefined) throw new Error('Expected image and text fixtures');

    const updatedImage = updateElementFromPanelV1({ element: image, key: 'objectFit', value: 'cover' });
    const updatedText = updateElementFromPanelV1({ element: text, key: 'padding', value: [24, 24, 24, 24] });

    if (updatedImage.kind !== 'image' || updatedText.kind !== 'text') throw new Error('Expected preserved kinds');

    expect(updatedImage.image.fit).toBe('cover');
    expect(updatedText.layout.padding).toEqual([24, 24, 24, 24]);
  });

  it('converts CSS gradient panel values into canonical v1 paints and clears back to solid', () => {
    const element = SAMPLE_PROJECT_V1.documents[0]?.elements.find(({ id }) => id === 'el-scorebug');

    if (element === undefined) throw new Error('Expected score bug fixture');

    const gradient = updateElementFromPanelV1({
      element,
      key: 'backgroundGradient',
      value: 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)',
    });
    const canonicalCssGradient = updateElementFromPanelV1({
      element,
      key: 'backgroundGradient',
      value: 'linear-gradient(180deg, color(srgb 1 0 0) 0%, color(srgb 0 0 1 / 0.5) 100%)',
    });
    const cleared = updateElementFromPanelV1({ element: gradient, key: 'backgroundGradient', value: '' });

    expect(gradient.appearance.fills[0]?.paint.kind).toBe('gradient');
    expect(canonicalCssGradient.appearance.fills[0]?.paint.kind).toBe('gradient');
    expect(cleared.appearance.fills[0]?.paint.kind).toBe('solid');
  });

  it('round-trips v1 rotation X/Y and translation Z through a canonical matrix3d', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const elementId = projectFormatV1.idSchema.parse('el-sb-home-score');

    const updates: readonly (readonly [string, number])[] = [
      ['rotateX', 35],
      ['rotateY', 25],
      ['translateZ', 120],
    ];

    for (const [key, value] of updates) {
      expect(
        store.getState().updateElement(elementId, (element) => updateElementFromPanelV1({ element, key, value })),
      ).toBe(true);
    }

    const element = store.getState().project.documents[0]?.elements.find((candidate) => candidate.id === elementId);

    if (element === undefined) throw new Error('Expected the updated v1 element');

    const panelElement = toPanelElementV1({ project: store.getState().project, element });

    expect(element.geometry.transform.kind).toBe('matrix3d');
    expect(panelElement.rotateX).toBeCloseTo(35, 8);
    expect(panelElement.rotateY).toBeCloseTo(25, 8);
    expect(panelElement.translateZ).toBe(120);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });
});
