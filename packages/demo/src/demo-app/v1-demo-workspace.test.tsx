import type { ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1DemoWorkspace } from './v1-demo-workspace';

describe('V1DemoWorkspace', () => {
  it('selects rendered v1 elements through the project store', async () => {
    const elementId = projectFormatV1.idSchema.parse('el-sb-away-score');
    let editorStore: ProjectEditorStore | undefined;
    const { container } = render(
      <V1DemoWorkspace
        project={SAMPLE_PROJECT_V1}
        onStoreReady={(store) => {
          editorStore = store;
        }}
      />,
    );
    const element = container.querySelector<HTMLElement>(`[data-element-id="${elementId}"]`);

    if (element === null) throw new Error('Expected the rendered v1 fixture element');

    fireEvent.pointerDown(element);

    await waitFor(() => {
      expect(editorStore?.getState().activeElementIds).toEqual([elementId]);
    });

    fireEvent.keyDown(window, { key: 'Delete' });

    await waitFor(() => {
      expect(editorStore?.getState().project.documents[0]?.elements.some(({ id }) => id === elementId)).toBe(false);
    });

    if (editorStore === undefined) throw new Error('Expected workspace store');

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(editorStore.getState().project)).toEqual([]);
  });

  it('keeps properties and canvas synchronized through one v1 project store', async () => {
    const elementId = projectFormatV1.idSchema.parse('el-sb-home-score');
    const storedProject: projectFormatV1.BroadsetProjectV1 = {
      ...SAMPLE_PROJECT_V1,
      metadata: { ...SAMPLE_PROJECT_V1.metadata, name: 'Stored v1 project' },
    };
    let storedText: string | null = projectFormatV1.canonicalizeProjectV1(storedProject);
    const storage = {
      getItem: (): string | null => storedText,
      setItem: (_key: string, value: string): void => {
        storedText = value;
      },
    };
    let editorStore: ProjectEditorStore | undefined;
    const { container } = render(
      <V1DemoWorkspace
        initialElementId={elementId}
        persistence={{ storage, storageKey: 'project' }}
        project={SAMPLE_PROJECT_V1}
        onStoreReady={(store) => {
          editorStore = store;
        }}
      />,
    );
    const xInput = screen.getByRole('textbox', { name: 'Position X (px)' });

    await waitFor(() => {
      expect(editorStore?.getState().project.metadata.name).toBe('Stored v1 project');
    });

    fireEvent.change(xInput, { target: { value: '200' } });
    fireEvent.blur(xInput);

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>(`[data-element-id="${elementId}"]`)?.style.transform).toContain(
        ', 200,',
      );
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Scene 2' }));

    if (editorStore === undefined) throw new Error('Expected workspace store');

    await waitFor(() => {
      expect(editorStore?.getState().activePageId).toBe(projectFormatV1.idSchema.parse('page-match-player'));
    });
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(editorStore.getState().project)).toEqual([]);

    const persisted = await projectFormatV1.loadProjectV1Json(storedText);

    expect(persisted.status).toBe('loaded');
  });
});
