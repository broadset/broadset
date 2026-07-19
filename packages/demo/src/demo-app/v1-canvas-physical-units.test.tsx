import { createProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import type { PhysicalUnitContextV1 } from '@broadset/renderer';
import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { V1ClipPathEditingOverlay } from '../demo-components/v1-clip-path-editing-overlay';
import { V1PathEditingOverlay } from '../demo-components/v1-path-editing-overlay';
import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { cssPixelsToDocumentValueV1, documentValueToCssPixelsV1, surfaceUnitContextV1 } from './v1-canvas-units';
import { V1DemoCanvasSurface } from './v1-demo-canvas-surface';

const DOCUMENT_ID = projectFormatV1.idSchema.parse('doc-broadcast-main');
const PAGE_ID = projectFormatV1.idSchema.parse('page-match-live');
const ELEMENT_ID = projectFormatV1.idSchema.parse('el-scorebug');
const SECOND_ELEMENT_ID = projectFormatV1.idSchema.parse('el-top-gradient');

function editingPath(): projectFormatV1.Element {
  const firstId = projectFormatV1.idSchema.parse('physical-path-first');
  const secondId = projectFormatV1.idSchema.parse('physical-path-second');

  return projectFormatV1.createElementV1({
    id: projectFormatV1.idSchema.parse('physical-path'),
    name: 'Physical path',
    geometry: projectFormatV1.createElementGeometry({
      width: 3,
      height: 4,
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 10, 5] },
    }),
    kind: 'vector',
    geometryData: {
      kind: 'path',
      fillRule: 'nonzero',
      path: {
        closed: false,
        points: [
          { id: firstId, x: 1, y: 2 },
          { id: secondId, x: 3, y: 4 },
        ],
        segments: [
          { id: projectFormatV1.idSchema.parse('physical-path-move'), kind: 'move', pointId: firstId },
          { id: projectFormatV1.idSchema.parse('physical-path-line'), kind: 'line', pointId: secondId },
        ],
      },
    },
  });
}

function millimetreElement(element: projectFormatV1.Element): projectFormatV1.Element {
  if (element.id === ELEMENT_ID) {
    return {
      ...element,
      geometry: {
        ...element.geometry,
        bounds: { width: 20, height: 10 },
        transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 10, 5] },
      },
    };
  }

  if (element.id === SECOND_ELEMENT_ID) {
    return {
      ...element,
      geometry: {
        ...element.geometry,
        bounds: { width: 5, height: 5 },
        transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
      },
    };
  }

  return element;
}

function physicalProject(): projectFormatV1.BroadsetProjectV1 {
  return projectFormatV1.broadsetProjectV1Schema.parse({
    ...SAMPLE_PROJECT_V1,
    documents: SAMPLE_PROJECT_V1.documents.map((document) =>
      document.id === DOCUMENT_ID ?
        {
          ...document,
          surface: {
            ...document.surface,
            dpi: 254,
            padding: { top: 1, right: 2, bottom: 3, left: 4 },
            size: [192, 108],
            unit: 'mm',
          },
          elements: document.elements.map(millimetreElement),
        }
      : document,
    ),
  });
}

function inchProject(): projectFormatV1.BroadsetProjectV1 {
  const project = physicalProject();

  return projectFormatV1.broadsetProjectV1Schema.parse({
    ...project,
    documents: project.documents.map((document) =>
      document.id === DOCUMENT_ID ?
        {
          ...document,
          surface: { ...document.surface, dpi: 120, size: [16, 9], unit: 'in' },
          elements: document.elements.map((element) =>
            element.id === ELEMENT_ID ?
              {
                ...element,
                geometry: {
                  ...element.geometry,
                  bounds: { width: 2, height: 1 },
                  transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 1, 0.5] },
                },
              }
            : element,
          ),
        }
      : document,
    ),
  });
}

describe('v1 canvas physical-unit boundary', () => {
  it('round-trips millimetres and inches at the document DPI', () => {
    const millimetres: PhysicalUnitContextV1 = { unit: 'mm', dpi: 254 };
    const inches: PhysicalUnitContextV1 = { unit: 'in', dpi: 120 };

    expect(documentValueToCssPixelsV1(10, millimetres)).toBe(100);
    expect(cssPixelsToDocumentValueV1(100, millimetres)).toBe(10);
    expect(documentValueToCssPixelsV1(2, inches)).toBe(240);
    expect(cssPixelsToDocumentValueV1(240, inches)).toBe(2);
    expect(cssPixelsToDocumentValueV1(Number.NaN, inches)).toBe(0);
  });

  it('renders chrome in CSS pixels and commits pointer movement in canonical millimetres', () => {
    const project = physicalProject();
    const store = createProjectEditorStore({ project });
    const { getByTestId } = render(
      <V1DemoCanvasSurface documentId={DOCUMENT_ID} editorStore={store} pageId={PAGE_ID} project={project} />,
    );

    act(() => {
      store.getState().selectElement(ELEMENT_ID);
      store.getState().updateCanvasSettings({ viewMode: 'broadcast' });
    });

    const widget = getByTestId('demo-transform-widget');
    const safety = getByTestId('safety-boundaries-overlay');
    const leftBoundary = getByTestId('safety-boundary-left');
    const horizontalRuler = getByTestId('ruler-horizontal-strip');

    expect(widget.style.width).toBe('200px');
    expect(widget.style.height).toBe('100px');
    expect(widget.style.transform).toBe('matrix(1, 0, 0, 1, 100, 50)');
    expect(safety.getAttribute('width')).toBe('1920');
    expect(safety.getAttribute('height')).toBe('1080');
    expect(leftBoundary.getAttribute('width')).toBe('40');
    expect(within(horizontalRuler).getByText('19').parentElement?.style.left).toBe('190px');

    const bounds = getByTestId('transform-bounds');

    fireEvent.pointerDown(bounds, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(bounds, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(bounds, { clientX: 100, clientY: 50, pointerId: 1 });

    const element = store.getState().project.documents[0]?.elements.find((candidate) => candidate.id === ELEMENT_ID);

    expect(element?.geometry.transform).toEqual({ kind: 'affine2d', matrix: [1, 0, 0, 1, 20, 10] });
    expect(surfaceUnitContextV1(store.getState().project.documents[0])).toEqual({ unit: 'mm', dpi: 254 });
  });

  it('uses a CSS-pixel path-closing tolerance after inverse coordinate conversion', () => {
    const project = physicalProject();
    const store = createProjectEditorStore({ project });
    const { getByTestId } = render(
      <V1DemoCanvasSurface documentId={DOCUMENT_ID} editorStore={store} pageId={PAGE_ID} project={project} />,
    );
    const surface = getByTestId('v1-canvas-surface');

    act(() => {
      store.getState().beginPlacement('path');
    });
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerDown(surface, { clientX: 120, clientY: 50, pointerId: 1 });

    const drawingId = store.getState().pathDrawingElementId;
    const path = store
      .getState()
      .project.documents[0]?.elements.find((candidate) => candidate.id === drawingId && candidate.kind === 'vector');

    expect(drawingId).not.toBeNull();
    expect(path?.geometry.transform).toEqual({ kind: 'affine2d', matrix: [1, 0, 0, 1, 10, 5] });
    expect(
      path?.kind === 'vector' && path.geometryData.kind === 'path' ? path.geometryData.path.points : [],
    ).toHaveLength(2);
  });

  it('round-trips inch geometry through transform chrome and gesture commits', () => {
    const project = inchProject();
    const store = createProjectEditorStore({ project });
    const { getByTestId } = render(
      <V1DemoCanvasSurface documentId={DOCUMENT_ID} editorStore={store} pageId={PAGE_ID} project={project} />,
    );

    act(() => {
      store.getState().selectElement(ELEMENT_ID);
    });

    const widget = getByTestId('demo-transform-widget');
    const bounds = getByTestId('transform-bounds');

    expect(widget.style.width).toBe('240px');
    expect(widget.style.transform).toBe('matrix(1, 0, 0, 1, 120, 60)');

    fireEvent.pointerDown(bounds, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(bounds, { clientX: 120, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(bounds, { clientX: 120, clientY: 60, pointerId: 1 });

    const element = store.getState().project.documents[0]?.elements.find((candidate) => candidate.id === ELEMENT_ID);

    expect(element?.geometry.transform).toEqual({ kind: 'affine2d', matrix: [1, 0, 0, 1, 2, 1] });
  });

  it('uses the same forward and inverse boundary for multi-selection', () => {
    const project = physicalProject();
    const store = createProjectEditorStore({ project });
    const { getByTestId } = render(
      <V1DemoCanvasSurface documentId={DOCUMENT_ID} editorStore={store} pageId={PAGE_ID} project={project} />,
    );

    act(() => {
      store.getState().setActiveElements([ELEMENT_ID, SECOND_ELEMENT_ID]);
    });

    const widget = getByTestId('demo-transform-widget');
    const bounds = getByTestId('transform-bounds');

    expect(widget.style.width).toBe('300px');
    expect(widget.style.height).toBe('150px');

    fireEvent.pointerDown(bounds, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(bounds, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(bounds, { clientX: 100, clientY: 50, pointerId: 1 });

    const elements = store.getState().project.documents[0]?.elements;

    expect(elements?.find((element) => element.id === ELEMENT_ID)?.geometry.transform).toEqual({
      kind: 'affine2d',
      matrix: [1, 0, 0, 1, 20, 10],
    });
    expect(elements?.find((element) => element.id === SECOND_ELEMENT_ID)?.geometry.transform).toEqual({
      kind: 'affine2d',
      matrix: [1, 0, 0, 1, 10, 5],
    });
  });

  it('positions path and clip editing handles through the physical-unit boundary', () => {
    const project = physicalProject();
    const store = createProjectEditorStore({ project });
    const path = editingPath();
    const units: PhysicalUnitContextV1 = { unit: 'mm', dpi: 254 };
    const { getByTestId } = render(
      <>
        <V1PathEditingOverlay editorStore={store} element={path} panX={7} panY={11} units={units} zoom={2} />
        <V1ClipPathEditingOverlay clipElement={path} panX={7} panY={11} units={units} zoom={2} />
      </>,
    );

    expect(getByTestId('path-handle-anchor-physical-path-first').getAttribute('cx')).toBe('227');
    expect(getByTestId('path-handle-anchor-physical-path-first').getAttribute('cy')).toBe('151');
    expect(getByTestId('clip-path-handle-physical-path-second').getAttribute('cx')).toBe('267');
    expect(getByTestId('clip-path-handle-physical-path-second').getAttribute('cy')).toBe('191');
    expect(getByTestId('clip-path-midpoint-physical-path-first').getAttribute('cx')).toBe('247');
  });

  it('keeps placement preview chrome in CSS pixels while its state remains in millimetres', () => {
    const project = physicalProject();
    const store = createProjectEditorStore({ project });
    const { getByTestId } = render(
      <V1DemoCanvasSurface documentId={DOCUMENT_ID} editorStore={store} pageId={PAGE_ID} project={project} />,
    );

    act(() => {
      store.getState().beginPlacement('rectangle');
    });
    fireEvent.pointerMove(getByTestId('v1-canvas-surface'), { clientX: 100, clientY: 50, pointerId: 1 });

    const preview = getByTestId('placement-preview-overlay');

    expect(store.getState().placementPreview).toEqual({ x: 10, y: 5 });
    expect(preview.style.left).toBe('94px');
    expect(preview.style.top).toBe('44px');
  });
});
