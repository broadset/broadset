import type { EditorStore, ElementUpdate } from '@broadset/editor';
import type { BroadsetElement } from '@broadset/model';
import type { JSX, MouseEvent } from 'react';
import { useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HANDLE_SIZE = 8;
const ROTATION_HANDLE_OFFSET = 24;
const ACCENT_COLOR = '#006FEE';
const HANDLE_BORDER_COLOR = '#ffffff';

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface HandleDef {
  readonly id: HandleId;
  readonly cursor: string;
  readonly getPos: (w: number, h: number) => { readonly x: number; readonly y: number };
}

const RESIZE_HANDLES: readonly HandleDef[] = [
  { id: 'nw', cursor: 'nw-resize', getPos: () => ({ x: 0, y: 0 }) },
  { id: 'n', cursor: 'n-resize', getPos: (w) => ({ x: w / 2, y: 0 }) },
  { id: 'ne', cursor: 'ne-resize', getPos: (w) => ({ x: w, y: 0 }) },
  { id: 'e', cursor: 'e-resize', getPos: (w, h) => ({ x: w, y: h / 2 }) },
  { id: 'se', cursor: 'se-resize', getPos: (w, h) => ({ x: w, y: h }) },
  { id: 's', cursor: 's-resize', getPos: (w, h) => ({ x: w / 2, y: h }) },
  { id: 'sw', cursor: 'sw-resize', getPos: (_, h) => ({ x: 0, y: h }) },
  { id: 'w', cursor: 'w-resize', getPos: (_, h) => ({ x: 0, y: h / 2 }) },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TransformWidgetProps {
  readonly element: BroadsetElement;
  readonly zoom: number;
  readonly store: EditorStore;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransformWidget({ element, zoom, store }: TransformWidgetProps): JSX.Element {
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    handle: HandleId | 'body' | 'rotate';
  } | null>(null);

  const half = HANDLE_SIZE / 2;
  const invZoom = 1 / zoom;

  // --- Drag body (translate) ---
  const handleBodyMouseDown = useCallback(
    (e: MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: element.position.x,
        origY: element.position.y,
        origW: element.width,
        origH: element.height,
        handle: 'body',
      };

      const onMove = (ev: globalThis.MouseEvent): void => {
        const drag = dragRef.current;

        if (drag === null || drag.handle !== 'body') return;

        const dx = (ev.clientX - drag.startX) * invZoom;
        const dy = (ev.clientY - drag.startY) * invZoom;

        store.getState().updateElementEphemeral(element.id, {
          position: { x: drag.origX + dx, y: drag.origY + dy },
        });
      };

      const onUp = (ev: globalThis.MouseEvent): void => {
        const drag = dragRef.current;

        if (drag !== null && drag.handle === 'body') {
          const dx = (ev.clientX - drag.startX) * invZoom;
          const dy = (ev.clientY - drag.startY) * invZoom;

          store.getState().commitElementUpdate(element.id, {
            position: { x: drag.origX + dx, y: drag.origY + dy },
          });
        }

        dragRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [element, invZoom, store],
  );

  // --- Resize handle ---
  const handleResizeMouseDown = useCallback(
    (e: MouseEvent, handleId: HandleId): void => {
      e.stopPropagation();
      e.preventDefault();

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: element.position.x,
        origY: element.position.y,
        origW: element.width,
        origH: element.height,
        handle: handleId,
      };

      const onMove = (ev: globalThis.MouseEvent): void => {
        const drag = dragRef.current;

        if (drag === null) return;

        const dx = (ev.clientX - drag.startX) * invZoom;
        const dy = (ev.clientY - drag.startY) * invZoom;

        const update = computeResize(drag.handle as HandleId, drag, dx, dy);

        store.getState().updateElementEphemeral(element.id, update);
      };

      const onUp = (ev: globalThis.MouseEvent): void => {
        const drag = dragRef.current;

        if (drag !== null) {
          const dx = (ev.clientX - drag.startX) * invZoom;
          const dy = (ev.clientY - drag.startY) * invZoom;

          const update = computeResize(drag.handle as HandleId, drag, dx, dy);

          store.getState().commitElementUpdate(element.id, update);
        }

        dragRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [element, invZoom, store],
  );

  // --- Rotation handle ---
  const handleRotateMouseDown = useCallback(
    (e: MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();

      const centerX = element.position.x + element.width / 2;
      const centerY = element.position.y + element.height / 2;

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: element.position.x,
        origY: element.position.y,
        origW: element.width,
        origH: element.height,
        handle: 'rotate',
      };

      const canvasEl = (e.target as HTMLElement).closest('[data-transform-root]');
      const canvasRect = canvasEl?.getBoundingClientRect();

      const onMove = (ev: globalThis.MouseEvent): void => {
        if (canvasRect === undefined) return;

        const mouseCanvasX = (ev.clientX - canvasRect.left) * invZoom;
        const mouseCanvasY = (ev.clientY - canvasRect.top) * invZoom;

        const angle = Math.atan2(mouseCanvasY - centerY, mouseCanvasX - centerX);
        // atan2 gives radians from east; convert to degrees from north
        const degrees = ((angle * 180) / Math.PI + 90 + 360) % 360;

        store.getState().updateElementEphemeral(element.id, {
          rotation: Math.round(degrees),
        });
      };

      const onUp = (ev: globalThis.MouseEvent): void => {
        if (canvasRect !== undefined) {
          const mouseCanvasX = (ev.clientX - canvasRect.left) * invZoom;
          const mouseCanvasY = (ev.clientY - canvasRect.top) * invZoom;

          const angle = Math.atan2(mouseCanvasY - centerY, mouseCanvasX - centerX);
          const degrees = ((angle * 180) / Math.PI + 90 + 360) % 360;

          store.getState().commitElementUpdate(element.id, {
            rotation: Math.round(degrees),
          });
        }

        dragRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [element, invZoom, store],
  );

  return (
    <div
      data-testid="transform-widget"
      data-transform-root=""
      style={{
        position: 'absolute',
        left: element.position.x,
        top: element.position.y,
        width: element.width,
        height: element.height,
        transform: element.rotation !== 0 ? `rotate(${String(element.rotation)}deg)` : undefined,
        transformOrigin: 'center center',
        boxSizing: 'border-box',
      }}
    >
      {/* Drag body – transparent overlay that captures drag events */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          cursor: 'move',
          outline: `${String(2 * invZoom)}px solid ${ACCENT_COLOR}`,
          outlineOffset: `${String(1 * invZoom)}px`,
        }}
        onMouseDown={handleBodyMouseDown}
      />

      {/* Resize handles */}
      {RESIZE_HANDLES.map((h) => {
        const pos = h.getPos(element.width, element.height);

        return (
          <div
            key={h.id}
            data-testid={`resize-handle-${h.id}`}
            style={{
              position: 'absolute',
              left: pos.x - half * invZoom,
              top: pos.y - half * invZoom,
              width: HANDLE_SIZE * invZoom,
              height: HANDLE_SIZE * invZoom,
              backgroundColor: ACCENT_COLOR,
              border: `${String(1.5 * invZoom)}px solid ${HANDLE_BORDER_COLOR}`,
              cursor: h.cursor,
              boxSizing: 'border-box',
              zIndex: 1,
            }}
            onMouseDown={(e) => {
              handleResizeMouseDown(e, h.id);
            }}
          />
        );
      })}

      {/* Rotation handle – circle above top-center, connected by a line */}
      <div
        style={{
          position: 'absolute',
          left: element.width / 2 - 0.5 * invZoom,
          top: -ROTATION_HANDLE_OFFSET * invZoom,
          width: 1 * invZoom,
          height: ROTATION_HANDLE_OFFSET * invZoom,
          backgroundColor: ACCENT_COLOR,
        }}
      />
      <div
        data-testid="rotation-handle"
        style={{
          position: 'absolute',
          left: element.width / 2 - 5 * invZoom,
          top: -(ROTATION_HANDLE_OFFSET + 5) * invZoom,
          width: 10 * invZoom,
          height: 10 * invZoom,
          borderRadius: '50%',
          backgroundColor: ACCENT_COLOR,
          border: `${String(1.5 * invZoom)}px solid ${HANDLE_BORDER_COLOR}`,
          cursor: 'grab',
          boxSizing: 'border-box',
          zIndex: 1,
        }}
        onMouseDown={handleRotateMouseDown}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resize computation
// ---------------------------------------------------------------------------

function computeResize(
  handle: HandleId,
  orig: { readonly origX: number; readonly origY: number; readonly origW: number; readonly origH: number },
  dx: number,
  dy: number,
): ElementUpdate {
  let x = orig.origX;
  let y = orig.origY;
  let w = orig.origW;
  let h = orig.origH;

  switch (handle) {
    case 'nw':
      x += dx;
      y += dy;
      w -= dx;
      h -= dy;
      break;
    case 'n':
      y += dy;
      h -= dy;
      break;
    case 'ne':
      y += dy;
      w += dx;
      h -= dy;
      break;
    case 'e':
      w += dx;
      break;
    case 'se':
      w += dx;
      h += dy;
      break;
    case 's':
      h += dy;
      break;
    case 'sw':
      x += dx;
      w -= dx;
      h += dy;
      break;
    case 'w':
      x += dx;
      w -= dx;
      break;
  }

  // Ensure minimum size
  const MIN_SIZE = 1;

  if (w < MIN_SIZE) {
    w = MIN_SIZE;
  }

  if (h < MIN_SIZE) {
    h = MIN_SIZE;
  }

  return {
    position: { x, y },
    width: w,
    height: h,
  };
}
