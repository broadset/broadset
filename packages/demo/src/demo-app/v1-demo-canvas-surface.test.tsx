import { createProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1DemoCanvasSurface } from './v1-demo-canvas-surface';

describe('V1DemoCanvasSurface', () => {
  it('renders v1 rulers from viewport state and honors their visibility setting', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const { getByTestId, queryByTestId } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    expect(getByTestId('ruler-horizontal-strip')).toBeTruthy();
    expect(getByTestId('ruler-vertical-strip')).toBeTruthy();

    act(() => {
      store.getState().updateCanvasSettings({ showRulers: false });
    });

    expect(queryByTestId('ruler-horizontal-strip')).toBeNull();
    expect(queryByTestId('ruler-vertical-strip')).toBeNull();
  });

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

  it('clears v1 selection on empty-canvas pointer-down', () => {
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

    fireEvent.pointerDown(getByTestId('v1-canvas-surface'));

    expect(store.getState().activeElementIds).toEqual([]);
  });

  it('opens a v1 element context menu, toggles locking, and uses a paste-only empty-canvas menu', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const elementId = projectFormatV1.idSchema.parse('el-network-bug');
    const { container, getByRole, getByTestId, getByText, queryByText } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );
    const element = container.querySelector<HTMLElement>(`[data-element-id="${elementId}"]`);

    if (element === null) throw new Error('Expected the v1 fixture element');

    act(() => {
      store.getState().selectElement(elementId);
    });

    fireEvent.pointerDown(getByTestId('v1-canvas-surface'), { button: 2 });
    fireEvent.contextMenu(getByTestId('v1-canvas-surface'), { clientX: 40, clientY: 50 });

    expect(getByTestId('demo-context-menu')).toBeTruthy();
    expect(getByText('Cut')).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();

    fireEvent.click(getByRole('menuitem', { name: /lock/i }));

    expect(
      store.getState().project.documents[0]?.elements.find((candidate) => candidate.id === elementId)?.locked,
    ).toBe(true);

    fireEvent.click(getByTestId('v1-canvas-surface'));
    fireEvent.contextMenu(getByTestId('v1-canvas-surface'), { clientX: 10, clientY: 20 });

    expect(getByText('Paste')).toBeTruthy();
    expect(queryByText('Cut')).toBeNull();
    expect(queryByText('Delete')).toBeNull();
  });

  it('preserves a v1 multi-selection on right-click and exposes group and ordering actions', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const firstId = projectFormatV1.idSchema.parse('el-network-bug');
    const secondId = projectFormatV1.idSchema.parse('el-sb-clock');
    const { container, getByText } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );
    const first = container.querySelector<HTMLElement>(`[data-element-id="${firstId}"]`);

    if (first === null) throw new Error('Expected the first v1 fixture element');

    act(() => {
      store.getState().setActiveElements([firstId, secondId]);
    });

    fireEvent.pointerDown(first, { button: 2 });
    fireEvent.contextMenu(first, { clientX: 40, clientY: 50 });

    expect(store.getState().activeElementIds).toEqual([firstId, secondId]);
    expect(getByText('Group')).toBeTruthy();
    expect(getByText('Ungroup')).toBeTruthy();
    expect(getByText('Bring forward')).toBeTruthy();
    expect(getByText('Send backward')).toBeTruthy();
  });

  it('shows v1 transform bounds for a multi-element selection', () => {
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
      store
        .getState()
        .setActiveElements([
          projectFormatV1.idSchema.parse('el-scorebug'),
          projectFormatV1.idSchema.parse('el-network-bug'),
        ]);
    });

    const widget = getByTestId('demo-transform-widget');

    expect(widget.style.width).toBe('1832px');
    expect(widget.style.height).toBe('76px');
    expect(widget.style.transform).toBe('matrix(1, 0, 0, 1, 48, 36)');
  });

  it('moves a v1 multi-selection as one undoable project edit', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const scorebugId = projectFormatV1.idSchema.parse('el-scorebug');
    const networkBugId = projectFormatV1.idSchema.parse('el-network-bug');
    const { getByTestId } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    act(() => {
      store.getState().setActiveElements([scorebugId, networkBugId]);
    });

    const bounds = getByTestId('transform-bounds');

    fireEvent.pointerDown(bounds, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(bounds, { clientX: 120, clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(bounds, { clientX: 120, clientY: 110, pointerId: 1 });

    const moved = store
      .getState()
      .project.documents[0]?.elements.filter((element) => element.id === scorebugId || element.id === networkBugId);

    expect(moved?.map((element) => element.geometry.transform)).toEqual([
      { kind: 'affine2d', matrix: [1, 0, 0, 1, 68, 46] },
      { kind: 'affine2d', matrix: [1, 0, 0, 1, 1828, 46] },
    ]);

    act(() => {
      store.getState().undo();
    });

    const restored = store
      .getState()
      .project.documents[0]?.elements.filter((element) => element.id === scorebugId || element.id === networkBugId);

    expect(restored?.map((element) => element.geometry.transform)).toEqual([
      { kind: 'affine2d', matrix: [1, 0, 0, 1, 48, 36] },
      { kind: 'affine2d', matrix: [1, 0, 0, 1, 1808, 36] },
    ]);
  });

  it('ignores non-primary pointer gestures on v1 transform bounds', () => {
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

    fireEvent.pointerDown(bounds, { button: 2, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(bounds, { button: 2, clientX: 125, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(bounds, { button: 2, clientX: 125, clientY: 130, pointerId: 1 });

    const element = store.getState().project.documents[0]?.elements.find((candidate) => candidate.id === elementId);

    expect(element?.geometry.transform).toEqual({ kind: 'affine2d', matrix: [1, 0, 0, 1, 48, 36] });
  });

  it('zooms the v1 viewport around the wheel pointer', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const { getByTestId } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    fireEvent.wheel(getByTestId('v1-canvas-surface'), {
      clientX: 100,
      clientY: 50,
      deltaMode: 0,
      deltaY: -100,
    });

    expect(store.getState().canvasSettings).toMatchObject({ panX: -20, panY: -10, zoom: 1.2 });
    expect(getByTestId('v1-canvas-viewport').style.transform).toBe('translate(-20px, -10px) scale(1.2)');
  });

  it('pans the v1 viewport with a middle-button pointer drag', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const { getByTestId } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );
    const surface = getByTestId('v1-canvas-surface');

    fireEvent.pointerDown(surface, { button: 1, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(surface, { button: 1, clientX: 130, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(surface, { button: 1, clientX: 130, clientY: 80, pointerId: 1 });

    expect(store.getState().canvasSettings).toMatchObject({ panX: 30, panY: -20, zoom: 1 });
    expect(getByTestId('v1-canvas-viewport').style.transform).toBe('translate(30px, -20px) scale(1)');
  });
});
