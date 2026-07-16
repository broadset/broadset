import type { ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SAMPLE_PROJECT_BLOBS_V1, SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { loadStoredProjectV1, saveStoredProjectV1 } from '../v1-project-persistence';
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

    const expectedInstance = projectFormatV1
      .resolvePageInstanceTree({
        project: SAMPLE_PROJECT_V1,
        documentId: SAMPLE_PROJECT_V1.documents[0]?.id ?? projectFormatV1.idSchema.parse('missing-document'),
        pageId: SAMPLE_PROJECT_V1.documents[0]?.pages[0]?.id ?? projectFormatV1.idSchema.parse('missing-page'),
      })
      .find(({ element: resolvedElement }) => resolvedElement.id === elementId);

    if (expectedInstance === undefined) throw new Error('Expected the resolved v1 fixture instance');

    await waitFor(() => {
      expect(editorStore?.getState().activeInstanceAddresses).toEqual([
        {
          rootInstanceId: expectedInstance.rootInstanceId,
          componentInstancePath: expectedInstance.componentInstancePath,
          elementId,
        },
      ]);
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
    let storedText: string | null = null;
    const storage = {
      getItem: (): string | null => storedText,
      setItem: (_key: string, value: string): void => {
        storedText = value;
      },
    };

    await saveStoredProjectV1({
      storage,
      storageKey: 'project',
      project: storedProject,
      blobs: SAMPLE_PROJECT_BLOBS_V1,
    });

    let editorStore: ProjectEditorStore | undefined;
    const { container } = render(
      <V1DemoWorkspace
        initialElementId={elementId}
        persistence={{ storage, storageKey: 'project' }}
        blobs={SAMPLE_PROJECT_BLOBS_V1}
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

    const persisted = await loadStoredProjectV1({
      storage,
      storageKey: 'project',
      fallbackProject: SAMPLE_PROJECT_V1,
      fallbackBlobs: SAMPLE_PROJECT_BLOBS_V1,
    });

    expect(persisted.project.documents[0]?.pages.length).toBe(SAMPLE_PROJECT_V1.documents[0]?.pages.length);
  });

  it('retains exact recovery bytes from persisted and imported quarantines without replacing the project', async () => {
    const persistedText = '{bad persisted json';
    const persistedBytes = new TextEncoder().encode(persistedText);
    const importedBytes = Uint8Array.of(0x80, 0xc0, 0xaf);
    const onProjectRecoveryRetained = vi.fn<(bytes: Uint8Array) => void>();
    const persistence = {
      storage: {
        getItem: (): string => persistedText,
        setItem: (): void => undefined,
      },
      storageKey: 'project',
    };
    let editorStore: ProjectEditorStore | undefined;

    render(
      <V1DemoWorkspace
        persistence={persistence}
        blobs={SAMPLE_PROJECT_BLOBS_V1}
        project={SAMPLE_PROJECT_V1}
        onProjectRecoveryRetained={onProjectRecoveryRetained}
        onStoreReady={(store) => {
          editorStore = store;
        }}
      />,
    );

    await waitFor(() => {
      expect(onProjectRecoveryRetained).toHaveBeenCalledExactlyOnceWith(persistedBytes);
    });

    expect(screen.getByText(`Recovery source retained (${String(persistedBytes.byteLength)} bytes)`)).toBeTruthy();
    expect(editorStore?.getState().project).toEqual(SAMPLE_PROJECT_V1);

    fireEvent.change(screen.getByLabelText('Choose Broadset project file'), {
      target: {
        files: [
          new File([importedBytes], 'invalid-utf8.broadset.json', {
            type: 'application/vnd.broadset.project+json',
          }),
        ],
      },
    });

    await waitFor(() => {
      expect(onProjectRecoveryRetained).toHaveBeenCalledTimes(2);
    });

    expect(onProjectRecoveryRetained.mock.calls[1]?.[0]).toEqual(importedBytes);
    expect(screen.getByText(`Recovery source retained (${String(importedBytes.byteLength)} bytes)`)).toBeTruthy();
    expect(editorStore?.getState().project).toEqual(SAMPLE_PROJECT_V1);
  });

  it('drives the rendered v1 viewport from the workspace toolbar', () => {
    render(<V1DemoWorkspace project={SAMPLE_PROJECT_V1} />);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));

    expect(screen.getByTestId('v1-canvas-viewport').style.transform).toBe('translate(0px, 0px) scale(1.1)');
    expect(screen.getByLabelText('Zoom level').textContent).toBe('110%');
  });

  it('toggles v1 element placement and cancels it with Escape', () => {
    render(<V1DemoWorkspace project={SAMPLE_PROJECT_V1} />);

    const preview = screen.getByLabelText(/screen preview for/i);
    const rectangle = screen.getByRole('button', { name: 'Rectangle' });

    fireEvent.click(rectangle);

    expect(preview.style.cursor).toBe('crosshair');
    expect(screen.queryByTestId('placement-mode-banner')).toBeNull();

    fireEvent.click(rectangle);
    expect(preview.style.cursor).toBe('default');

    fireEvent.click(screen.getByRole('button', { name: 'Countdown' }));
    expect(preview.style.cursor).toBe('crosshair');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(preview.style.cursor).toBe('default');
  });
});
