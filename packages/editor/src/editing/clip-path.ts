import { getCapabilityProfile } from '@broadset/model';

import type { EditorStore } from '../store-actions';

const DEFAULT_CLIP_PATH = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
const MIN_CLIP_PATH_POINTS = 3;
const POLYGON_POINT_PATTERN = /(-?\d+(?:\.\d+)?%?)\s+(-?\d+(?:\.\d+)?%?)/g;

interface PolygonPointToken {
  readonly x: string;
  readonly y: string;
}

function collectPolygonPointTokens(body: string): readonly PolygonPointToken[] {
  const tokens: PolygonPointToken[] = [];

  POLYGON_POINT_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;

  while ((match = POLYGON_POINT_PATTERN.exec(body)) !== null) {
    const x = match[1];
    const y = match[2];

    if (x !== undefined && y !== undefined) {
      tokens.push({ x, y });
    }
  }

  return tokens;
}

export function parsePolygonPoints(clipPath: string): { readonly x: number; readonly y: number }[] | null {
  const polygonMatch = /^polygon\(([^)]*)\)$/i.exec(clipPath.trim());

  if (polygonMatch?.[1] === undefined) {
    return null;
  }

  const body = polygonMatch[1];
  const points: { readonly x: number; readonly y: number }[] = [];

  for (const token of collectPolygonPointTokens(body)) {
    points.push({
      x: Number.parseFloat(token.x.replace('%', '')),
      y: Number.parseFloat(token.y.replace('%', '')),
    });
  }

  return points;
}

function serializePolygon(points: ReadonlyArray<{ readonly x: number; readonly y: number }>): string {
  const pointStrings = points.map((point) => `${String(point.x)}% ${String(point.y)}%`);

  return `polygon(${pointStrings.join(', ')})`;
}

export function startClipPathEditing(store: EditorStore, elementId: string): void {
  const state = store.getState();
  const element = state.document.elements.find((candidate) => candidate.id === elementId);

  if (element === undefined) {
    return;
  }

  const capabilities = getCapabilityProfile(element.type);

  if (!capabilities.clipPath) {
    return;
  }

  const needsSeeding = (element.style.customClipPath ?? '') === '';
  const nextDocument =
    needsSeeding ?
      {
        ...state.document,
        elements: state.document.elements.map((candidate) =>
          candidate.id === elementId ?
            {
              ...candidate,
              style: {
                ...candidate.style,
                customClipPath: DEFAULT_CLIP_PATH,
                maskType: 'custom' as const,
              },
            }
          : candidate,
        ),
      }
    : state.document;

  store.setState({
    document: nextDocument,
    activeElementIds: [elementId],
    placement: null,
    placementPreview: null,
    pathEditingElementId: null,
    pathDrawingElementId: null,
    clipPathEditingElementId: elementId,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: { type: 'clip-path-editing', elementId },
  });
}

export function stopClipPathEditing(store: EditorStore): void {
  store.setState({
    clipPathEditingElementId: null,
    editingMode: { type: 'none' },
  });
}

export function updateClipPathPoint(store: EditorStore, index: number, x: number, y: number): void {
  const state = store.getState();
  const editingElementId = state.clipPathEditingElementId;

  if (editingElementId === null) {
    return;
  }

  const element = state.document.elements.find((candidate) => candidate.id === editingElementId);

  if (element === undefined) {
    return;
  }

  const points = parsePolygonPoints(element.style.customClipPath ?? '');

  if (points === null || index < 0 || index >= points.length) {
    return;
  }

  const updated = points.map((point, idx) => (idx === index ? { x, y } : point));

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((candidate) =>
        candidate.id === editingElementId ?
          {
            ...candidate,
            style: {
              ...candidate.style,
              customClipPath: serializePolygon(updated),
            },
          }
        : candidate,
      ),
    },
  });
}

export function insertClipPathPoint(store: EditorStore, afterIndex: number, x: number, y: number): void {
  const state = store.getState();
  const editingElementId = state.clipPathEditingElementId;

  if (editingElementId === null) {
    return;
  }

  const element = state.document.elements.find((candidate) => candidate.id === editingElementId);

  if (element === undefined) {
    return;
  }

  const points = parsePolygonPoints(element.style.customClipPath ?? '');

  if (points === null || afterIndex < 0 || afterIndex >= points.length) {
    return;
  }

  const updated = [...points.slice(0, afterIndex + 1), { x, y }, ...points.slice(afterIndex + 1)];

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((candidate) =>
        candidate.id === editingElementId ?
          {
            ...candidate,
            style: {
              ...candidate.style,
              customClipPath: serializePolygon(updated),
            },
          }
        : candidate,
      ),
    },
  });
}

export function deleteClipPathPoint(store: EditorStore, index: number): void {
  const state = store.getState();
  const editingElementId = state.clipPathEditingElementId;

  if (editingElementId === null) {
    return;
  }

  const element = state.document.elements.find((candidate) => candidate.id === editingElementId);

  if (element === undefined) {
    return;
  }

  const points = parsePolygonPoints(element.style.customClipPath ?? '');

  if (points === null || points.length <= MIN_CLIP_PATH_POINTS || index < 0 || index >= points.length) {
    return;
  }

  const updated = points.filter((_, idx) => idx !== index);

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((candidate) =>
        candidate.id === editingElementId ?
          {
            ...candidate,
            style: {
              ...candidate.style,
              customClipPath: serializePolygon(updated),
            },
          }
        : candidate,
      ),
    },
  });
}
