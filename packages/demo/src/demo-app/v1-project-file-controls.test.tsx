import { createProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1ProjectFileControls } from './v1-project-file-controls';

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Expected text file contents'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read exported project'));
    };

    reader.readAsText(blob);
  });
}

describe('V1ProjectFileControls', () => {
  it('imports an external SVG as a validated v1 project with packaged source bytes', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1ProjectFileControls editorStore={store} />);

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect id="box" width="100" height="50" fill="#f00"/></svg>';

    fireEvent.change(screen.getByLabelText('Choose Broadset project file'), {
      target: { files: [new File([svg], 'external.svg', { type: 'image/svg+xml' })] },
    });

    await waitFor(
      () => {
        expect(store.getState().project.metadata.name).toBe('external');
      },
      { timeout: 10_000 },
    );

    expect(store.getState().project.documents[0]?.elements.length).toBeGreaterThan(0);
    expect(store.getState().blobs.size).toBeGreaterThan(0);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('retains the last valid v1 project when an invalid file is quarantined', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1ProjectFileControls editorStore={store} />);

    fireEvent.change(screen.getByLabelText('Choose Broadset project file'), {
      target: { files: [new File(['{}'], 'invalid.bsp', { type: 'application/json' })] },
    });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('not a Broadset project format v1');
    });

    expect(store.getState().project).toBe(SAMPLE_PROJECT_V1);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('loads and saves only canonical, semantically valid v1 projects', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const downloads: { readonly blob: Blob; readonly filename: string }[] = [];
    const importedProject: projectFormatV1.BroadsetProjectV1 = {
      ...SAMPLE_PROJECT_V1,
      metadata: { ...SAMPLE_PROJECT_V1.metadata, name: 'Imported v1 project' },
    };

    render(
      <V1ProjectFileControls
        editorStore={store}
        download={(blob, filename) => {
          downloads.push({ blob, filename });
        }}
      />,
    );

    const file = new File([projectFormatV1.canonicalizeProjectV1(importedProject)], 'project.bsp', {
      type: 'application/vnd.broadset.project+json',
    });

    fireEvent.change(screen.getByLabelText('Choose Broadset project file'), { target: { files: [file] } });

    await waitFor(() => {
      expect(store.getState().project.metadata.name).toBe('Imported v1 project');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save .bsp' }));

    const call = downloads[0];

    if (call === undefined) throw new Error('Expected a project download');

    const { blob, filename } = call;
    const exportedText = await readBlobText(blob);
    const loaded = await projectFormatV1.loadProjectV1Json(exportedText);

    expect(filename).toBe('broadset-project.bsp');
    expect(exportedText).toBe(projectFormatV1.canonicalizeProjectV1(importedProject));
    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') throw new Error('Expected valid exported v1 project');
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(loaded.project)).toEqual([]);
  });
});
