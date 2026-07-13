import { createProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1DemoCanvasSurface } from './v1-demo-canvas-surface';

describe('V1DemoCanvasSurface', () => {
  it('renders the active v1 page through project-store viewport state', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const { container } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );
    const viewport = container.querySelector<HTMLElement>('[data-testid="v1-canvas-viewport"]');

    expect(container.querySelector('[data-element-id="el-scorebug"]')).not.toBeNull();
    expect(viewport?.style.transform).toBe('translate(0px, 0px) scale(1)');

    act(() => {
      store.getState().updateCanvasSettings({ panX: 24, panY: -12, zoom: 1.5 });
    });

    expect(viewport?.style.transform).toBe('translate(24px, -12px) scale(1.5)');
  });

  it('shows transform bounds for the single selected v1 element', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const elementId = projectFormatV1.idSchema.parse('el-scorebug');
    const { container } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    expect(container.querySelector('[data-testid="demo-transform-widget"]')).toBeNull();

    act(() => {
      store.getState().selectElement(elementId);
    });

    const widget = container.querySelector<HTMLElement>('[data-testid="demo-transform-widget"]');

    expect(widget?.style.width).toBe('580px');
    expect(widget?.style.height).toBe('76px');
    expect(widget?.style.transform).toBe('matrix(1, 0, 0, 1, 48, 36)');
  });

  it('commits a pointer drag to canonical v1 element geometry', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const elementId = projectFormatV1.idSchema.parse('el-scorebug');
    const { getByTestId } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    act(() => {
      store.getState().selectElement(elementId);
    });

    const bounds = getByTestId('transform-bounds');

    fireEvent.pointerDown(bounds, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(bounds, { clientX: 125, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(bounds, { clientX: 125, clientY: 130, pointerId: 1 });

    const element = store.getState().project.documents[0]?.elements.find((candidate) => candidate.id === elementId);

    expect(element?.geometry.transform).toEqual({ kind: 'affine2d', matrix: [1, 0, 0, 1, 73, 66] });
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('records a completed pointer drag as one undoable project edit', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const elementId = projectFormatV1.idSchema.parse('el-scorebug');
    const { getByTestId } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    act(() => {
      store.getState().selectElement(elementId);
    });

    const bounds = getByTestId('transform-bounds');

    fireEvent.pointerDown(bounds, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(bounds, { clientX: 125, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(bounds, { clientX: 125, clientY: 130, pointerId: 1 });

    act(() => {
      store.getState().undo();
    });

    const element = store.getState().project.documents[0]?.elements.find((candidate) => candidate.id === elementId);

    expect(element?.geometry.transform).toEqual({ kind: 'affine2d', matrix: [1, 0, 0, 1, 48, 36] });
  });

  it('resizes canonical v1 bounds from the southeast transform handle', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const elementId = projectFormatV1.idSchema.parse('el-scorebug');
    const { getByTestId } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    act(() => {
      store.getState().selectElement(elementId);
    });

    const handle = getByTestId('transform-handle-se');

    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 120, clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 120, clientY: 110, pointerId: 1 });

    const element = store.getState().project.documents[0]?.elements.find((candidate) => candidate.id === elementId);

    expect(element?.geometry.bounds).toEqual({ width: 600, height: 86 });
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('exposes all eight v1 resize handles', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const { getByTestId } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    act(() => {
      store.getState().selectElement(projectFormatV1.idSchema.parse('el-scorebug'));
    });

    for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      expect(getByTestId(`transform-handle-${handle}`)).toBeTruthy();
    }
  });

  it('reproduces ancestor transforms around a nested v1 selection', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const { getByTestId } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    act(() => {
      store.getState().selectElement(projectFormatV1.idSchema.parse('el-sb-home-abbr'));
    });

    const ancestor = getByTestId('v1-transform-ancestor-el-scorebug');
    const widget = getByTestId('demo-transform-widget');

    expect(ancestor.contains(widget)).toBe(true);
    expect(ancestor.style.transform).toBe('matrix(1, 0, 0, 1, 48, 36)');
  });

  it('keeps drag previews local until the pointer gesture commits', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const elementId = projectFormatV1.idSchema.parse('el-scorebug');
    const { getByTestId } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    act(() => {
      store.getState().selectElement(elementId);
    });

    const bounds = getByTestId('transform-bounds');

    fireEvent.pointerDown(bounds, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(bounds, { clientX: 125, clientY: 130, pointerId: 1 });

    const previewedElement = store
      .getState()
      .project.documents[0]?.elements.find((candidate) => candidate.id === elementId);

    expect(previewedElement?.geometry.transform).toEqual({ kind: 'affine2d', matrix: [1, 0, 0, 1, 48, 36] });
    expect(getByTestId('demo-transform-widget').style.transform).toBe('matrix(1, 0, 0, 1, 73, 66)');

    fireEvent.pointerUp(bounds, { clientX: 125, clientY: 130, pointerId: 1 });
  });

  it('discards a v1 transform preview when the pointer gesture is cancelled', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const elementId = projectFormatV1.idSchema.parse('el-scorebug');
    const { getByTestId } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    act(() => {
      store.getState().selectElement(elementId);
    });

    const bounds = getByTestId('transform-bounds');

    fireEvent.pointerDown(bounds, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(bounds, { clientX: 125, clientY: 130, pointerId: 1 });
    fireEvent.pointerCancel(bounds, { clientX: 125, clientY: 130, pointerId: 1 });

    const element = store.getState().project.documents[0]?.elements.find((candidate) => candidate.id === elementId);

    expect(element?.geometry.transform).toEqual({ kind: 'affine2d', matrix: [1, 0, 0, 1, 48, 36] });
    expect(getByTestId('demo-transform-widget').style.transform).toBe('matrix(1, 0, 0, 1, 48, 36)');
  });

  it('commits rotation through the canonical v1 transform matrix', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const elementId = projectFormatV1.idSchema.parse('el-scorebug');
    const { getByTestId } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    act(() => {
      store.getState().selectElement(elementId);
    });

    const handle = getByTestId('transform-rotation-handle');

    fireEvent.pointerDown(handle, { clientX: 338, clientY: 12, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 400, clientY: 74, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 400, clientY: 74, pointerId: 1 });

    const element = store.getState().project.documents[0]?.elements.find((candidate) => candidate.id === elementId);
    const matrix = element?.geometry.transform.matrix;

    expect(matrix?.[0]).toBeCloseTo(0, 8);
    expect(matrix?.[1]).toBeCloseTo(1, 8);
    expect(matrix?.[4]).toBe(48);
    expect(matrix?.[5]).toBe(36);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });
});
