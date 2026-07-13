import { createProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1ViewportToolbar } from './v1-viewport-toolbar';

describe('V1ViewportToolbar', () => {
  it('exposes undo and redo state from the v1 project history', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const elementId = projectFormatV1.idSchema.parse('el-sb-home-score');

    render(<V1ViewportToolbar editorStore={store} />);

    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });

    expect(undo.hasAttribute('disabled')).toBe(true);
    expect(redo.hasAttribute('disabled')).toBe(true);

    store.getState().commitElementUpdate(elementId, { position: { x: 240, y: 72 } });

    await waitFor(() => {
      expect(undo.hasAttribute('disabled')).toBe(false);
    });

    fireEvent.click(undo);

    await waitFor(() => {
      expect(redo.hasAttribute('disabled')).toBe(false);
    });
  });

  it('zooms the v1 canvas in and reports the current percentage', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1ViewportToolbar editorStore={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));

    expect(store.getState().canvasSettings.zoom).toBe(1.1);
    expect(screen.getByLabelText('Zoom level').textContent).toBe('110%');
  });

  it('zooms the v1 canvas out without crossing the minimum', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    store.getState().updateCanvasSettings({ zoom: 0.2 });
    render(<V1ViewportToolbar editorStore={store} />);

    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });

    fireEvent.click(zoomOut);
    fireEvent.click(zoomOut);

    expect(store.getState().canvasSettings.zoom).toBe(0.1);
    expect(screen.getByLabelText('Zoom level').textContent).toBe('10%');
  });

  it('resets the v1 canvas viewport from the zoom-to-fit control', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    store.getState().updateCanvasSettings({ panX: 24, panY: -12, zoom: 2 });
    render(<V1ViewportToolbar editorStore={store} />);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom to fit' }));

    expect(store.getState().canvasSettings).toMatchObject({ panX: 0, panY: 0, zoom: 1 });
    expect(screen.getByLabelText('Zoom level').textContent).toBe('100%');
  });

  it('toggles v1 ruler visibility from the View menu', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1ViewportToolbar editorStore={store} />);

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    fireEvent.click(screen.getByText('Show rulers'));

    expect(store.getState().canvasSettings.showRulers).toBe(false);
  });

  it('edits v1 canvas state through the Document Settings dialog', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1ViewportToolbar editorStore={store} />);

    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    fireEvent.click(screen.getByText('Document Settings'));

    const dialog = screen.getByRole('dialog', { name: 'Canvas Settings' });
    const grid = screen.getByRole('switch', { name: 'Show grid' });

    expect(dialog).toBeTruthy();

    if (!(grid instanceof HTMLInputElement)) throw new Error('Expected Show grid to render as an input');

    expect(grid.checked).toBe(false);

    fireEvent.click(grid);
    expect(store.getState().gridSettings.showGrid).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Canvas Settings' })).toBeNull();
  });
});
