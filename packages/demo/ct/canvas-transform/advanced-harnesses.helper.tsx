/* eslint-disable jsx-a11y/no-static-element-interactions --
   Test harness. Simulates real UI surfaces for CT scenarios; production a11y
   lives in the real components, not these fixtures. */

import { classifyWheelInput } from '@broadset/ui';
import { type JSX, useMemo, useState } from 'react';

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ElementNode extends Rect {
  readonly id: string;
  readonly label: string;
}

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

function clampZoom(nextZoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(nextZoom * 100) / 100));
}

const MARQUEE_ELEMENTS: readonly ElementNode[] = [
  { id: 'el-a', label: 'A', x: 40, y: 40, width: 120, height: 70 },
  { id: 'el-b', label: 'B', x: 190, y: 90, width: 120, height: 70 },
  { id: 'el-c', label: 'C', x: 420, y: 210, width: 140, height: 90 },
];

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function normalizeRect(startX: number, startY: number, endX: number, endY: number): Rect {
  return {
    height: Math.abs(endY - startY),
    width: Math.abs(endX - startX),
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
  };
}

export function MarqueeSelectionHarness(): JSX.Element {
  const [dragStart, setDragStart] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);

  const marquee =
    dragStart === null || dragCurrent === null ?
      null
    : normalizeRect(dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y);

  return (
    <div>
      <div
        data-testid="marquee-canvas"
        onPointerDown={(event) => {
          const nextPoint = { x: event.clientX, y: event.clientY };

          setDragStart(nextPoint);
          setDragCurrent(nextPoint);
          setSelectedIds([]);
        }}
        onPointerMove={(event) => {
          if (dragStart === null) {
            return;
          }

          setDragCurrent({ x: event.clientX, y: event.clientY });
        }}
        onPointerUp={(event) => {
          if (dragStart === null) {
            return;
          }

          const finalRect = normalizeRect(dragStart.x, dragStart.y, event.clientX, event.clientY);
          const nextSelection =
            finalRect.width <= 0 || finalRect.height <= 0 ?
              []
            : MARQUEE_ELEMENTS.filter((node) => intersects(node, finalRect)).map((node) => node.id);

          setSelectedIds(nextSelection);
          setDragStart(null);
          setDragCurrent(null);
        }}
        style={{
          background: '#0f172a',
          height: `${String(CANVAS_HEIGHT)}px`,
          position: 'relative',
          userSelect: 'none',
          width: `${String(CANVAS_WIDTH)}px`,
        }}
      >
        {MARQUEE_ELEMENTS.map((node) => (
          <div
            key={node.id}
            data-testid={`marquee-node-${node.id}`}
            style={{
              alignItems: 'center',
              background: selectedIds.includes(node.id) ? '#3b82f6' : '#334155',
              border: '1px solid #64748b',
              color: '#e2e8f0',
              display: 'flex',
              height: `${String(node.height)}px`,
              justifyContent: 'center',
              left: `${String(node.x)}px`,
              position: 'absolute',
              top: `${String(node.y)}px`,
              width: `${String(node.width)}px`,
            }}
          >
            {node.label}
          </div>
        ))}

        {marquee === null ? null : (
          <div
            data-testid="marquee-rect"
            style={{
              backgroundColor: 'rgba(59,130,246,0.2)',
              border: '1px dashed #3b82f6',
              height: `${String(marquee.height)}px`,
              left: `${String(marquee.x)}px`,
              position: 'absolute',
              top: `${String(marquee.y)}px`,
              width: `${String(marquee.width)}px`,
            }}
          />
        )}
      </div>
      <output data-testid="marquee-selection">{selectedIds.join(',')}</output>
    </div>
  );
}

export function GuidesHarness(): JSX.Element {
  const [guides, setGuides] = useState<readonly number[]>([]);
  const [draggingGuide, setDraggingGuide] = useState<number | null>(null);

  const toLocalY = (event: React.PointerEvent<HTMLDivElement>): number => {
    const bounds = event.currentTarget.getBoundingClientRect();

    return event.clientY - bounds.top;
  };

  return (
    <div style={{ width: `${String(CANVAS_WIDTH)}px` }}>
      <div
        data-testid="ruler-strip"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDraggingGuide(toLocalY(event));
        }}
        onPointerMove={(event) => {
          if (draggingGuide === null) {
            return;
          }

          setDraggingGuide(toLocalY(event));
        }}
        onPointerUp={(event) => {
          if (draggingGuide === null) {
            return;
          }

          const localY = toLocalY(event);

          if (localY <= 30) {
            setGuides([]);
          } else {
            setGuides([localY]);
          }

          setDraggingGuide(null);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        style={{ background: '#1e293b', color: '#cbd5e1', height: '30px' }}
      >
        Ruler
      </div>
      <div
        data-testid="guide-canvas"
        onPointerDown={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const localY = event.clientY - bounds.top;
          const activeGuide = guides[0];

          if (activeGuide === undefined || Math.abs(activeGuide - localY) > 10) {
            return;
          }

          event.currentTarget.setPointerCapture(event.pointerId);
          setDraggingGuide(activeGuide);
        }}
        onPointerMove={(event) => {
          if (draggingGuide === null) {
            return;
          }

          const bounds = event.currentTarget.getBoundingClientRect();

          setDraggingGuide(event.clientY - bounds.top + 30);
        }}
        onPointerUp={(event) => {
          if (draggingGuide === null) {
            return;
          }

          const bounds = event.currentTarget.getBoundingClientRect();
          const localY = event.clientY - bounds.top + 30;

          if (localY <= 30) {
            setGuides([]);
          } else {
            setGuides([localY]);
          }

          setDraggingGuide(null);

          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        style={{ background: '#0f172a', height: `${String(CANVAS_HEIGHT)}px`, position: 'relative' }}
      >
        {guides.map((pos) => (
          <div
            key={String(pos)}
            data-testid="guide-line"
            style={{
              background: '#22d3ee',
              height: '1px',
              left: 0,
              position: 'absolute',
              top: `${String(pos)}px`,
              width: '100%',
            }}
          />
        ))}
      </div>
      <output data-testid="guide-count">{String(guides.length)}</output>
    </div>
  );
}

export function SnapGuideHarness(): JSX.Element {
  const [movingX, setMovingX] = useState(60);
  const [isDragging, setIsDragging] = useState(false);

  const toLocalX = (event: React.PointerEvent<HTMLDivElement>): number => {
    const bounds = event.currentTarget.getBoundingClientRect();

    return event.clientX - bounds.left;
  };

  const showSnap = useMemo(() => {
    if (!isDragging) {
      return false;
    }

    return Math.abs(movingX + 80 - 320) <= 8;
  }, [isDragging, movingX]);

  return (
    <div
      data-testid="snap-canvas"
      onPointerDown={(event) => {
        const target = event.target;

        if (!(target instanceof HTMLElement) || target.dataset['testid'] !== 'moving-node') {
          return;
        }

        event.currentTarget.setPointerCapture(event.pointerId);
        setIsDragging(true);
      }}
      onPointerMove={(event) => {
        if (!isDragging) {
          return;
        }

        setMovingX(toLocalX(event) - 40);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        setIsDragging(false);
      }}
      style={{ background: '#0f172a', height: `${String(CANVAS_HEIGHT)}px`, position: 'relative', width: '640px' }}
    >
      <div
        data-testid="anchor-node"
        style={{
          background: '#64748b',
          height: '80px',
          left: '320px',
          position: 'absolute',
          top: '140px',
          width: '80px',
        }}
      />
      <div
        data-testid="moving-node"
        style={{
          background: '#3b82f6',
          cursor: 'grab',
          height: '80px',
          left: `${String(movingX)}px`,
          position: 'absolute',
          top: '140px',
          width: '80px',
        }}
      />
      {showSnap ?
        <div
          data-testid="snap-guide-line"
          style={{ background: '#22d3ee', height: '100%', left: '320px', position: 'absolute', top: 0, width: '1px' }}
        />
      : null}
      <output data-testid="snap-visible">{String(showSnap)}</output>
    </div>
  );
}

export function InlineTextHarness(): JSX.Element {
  const [text, setText] = useState('Headline');
  const [draft, setDraft] = useState('Headline');
  const [editing, setEditing] = useState(false);
  const [viewportLocked, setViewportLocked] = useState(false);

  return (
    <div>
      <div
        data-testid="inline-preview"
        onWheel={(event) => {
          if (editing) {
            event.preventDefault();
            setViewportLocked(true);
          }
        }}
        style={{ background: '#0f172a', color: '#e2e8f0', minHeight: '180px', padding: '24px', position: 'relative' }}
      >
        <div
          data-testid="inline-text-node"
          onDoubleClick={() => {
            setDraft(text);
            setEditing(true);
          }}
          style={{ display: editing ? 'none' : 'inline-block', fontSize: '28px' }}
        >
          {text}
        </div>

        {editing ?
          <div
            contentEditable
            suppressContentEditableWarning
            data-testid="inline-editor"
            onBlur={() => {
              setText(draft);
              setEditing(false);
            }}
            onInput={(event) => {
              const nextText = event.currentTarget.textContent;

              setDraft(nextText);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setDraft(text);
                setEditing(false);
              }
            }}
            style={{ border: '1px solid #22d3ee', minWidth: '140px', padding: '6px' }}
          >
            {draft}
          </div>
        : null}
      </div>
      <output data-testid="inline-text-value">{text}</output>
      <output data-testid="inline-editing">{String(editing)}</output>
      <output data-testid="inline-viewport-locked">{String(viewportLocked)}</output>
    </div>
  );
}

export function ViewportInteractionHarness(): JSX.Element {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{
    readonly originPanX: number;
    readonly originPanY: number;
    readonly startX: number;
    readonly startY: number;
  } | null>(null);

  return (
    <div>
      <div
        data-testid="viewport-canvas"
        onPointerDown={(event) => {
          if (!event.shiftKey && event.button !== 1) {
            return;
          }

          event.currentTarget.setPointerCapture(event.pointerId);
          setPanStart({
            originPanX: panX,
            originPanY: panY,
            startX: event.clientX,
            startY: event.clientY,
          });
          setIsPanning(true);
        }}
        onPointerMove={(event) => {
          if (panStart === null) {
            return;
          }

          const deltaX = event.clientX - panStart.startX;
          const deltaY = event.clientY - panStart.startY;

          setPanX(panStart.originPanX + deltaX);
          setPanY(panStart.originPanY + deltaY);
        }}
        onPointerUp={(event) => {
          setIsPanning(false);
          setPanStart(null);

          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onWheel={(event) => {
          const intent = classifyWheelInput({
            altKey: event.altKey,
            ctrlKey: event.ctrlKey || event.metaKey,
            deltaMode: event.deltaMode,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
          });

          if (intent === 'none') {
            return;
          }

          event.preventDefault();

          if (intent === 'pan') {
            setPanX((currentValue) => currentValue - event.deltaX);
            setPanY((currentValue) => currentValue - event.deltaY);

            return;
          }

          const nextZoom =
            event.deltaMode === 0 ?
              clampZoom(zoom - event.deltaY * 0.002)
            : clampZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1));

          if (nextZoom === zoom) {
            return;
          }

          const bounds = event.currentTarget.getBoundingClientRect();
          const cursorX = event.clientX - bounds.left;
          const cursorY = event.clientY - bounds.top;
          const worldX = (cursorX - panX) / zoom;
          const worldY = (cursorY - panY) / zoom;

          setZoom(nextZoom);
          setPanX(cursorX - worldX * nextZoom);
          setPanY(cursorY - worldY * nextZoom);
        }}
        style={{
          background: '#0f172a',
          cursor: isPanning ? 'grabbing' : 'default',
          height: `${String(CANVAS_HEIGHT)}px`,
          position: 'relative',
          width: `${String(CANVAS_WIDTH)}px`,
        }}
      >
        <div
          data-testid="viewport-content"
          style={{
            background: '#2563eb',
            height: '120px',
            left: '200px',
            position: 'absolute',
            top: '110px',
            transform: `translate(${String(panX)}px, ${String(panY)}px) scale(${String(zoom)})`,
            transformOrigin: 'top left',
            width: '160px',
          }}
        />
      </div>
      <output data-testid="viewport-pan">{`${String(panX)},${String(panY)}`}</output>
      <output data-testid="viewport-zoom">{String(zoom)}</output>
    </div>
  );
}
