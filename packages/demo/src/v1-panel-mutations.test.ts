import { createProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from './sample-project-v1';
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
});
