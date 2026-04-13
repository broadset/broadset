import type { Keyframe } from '@broadset/model';
import { type JSX, useCallback, useMemo, useRef, useState } from 'react';

import { color, sp } from '../tokens';

const SNAP_INTERVAL_MS = 100;
const LANE_HEIGHT_PX = 28;

const PROPERTY_CATEGORIES: ReadonlyArray<{
  readonly name: string;
  readonly properties: ReadonlySet<string>;
}> = [
  { name: 'Geometry', properties: new Set(['x', 'y', 'width', 'height', 'rotation']) },
  { name: 'Appearance', properties: new Set(['opacity', 'backgroundColor', 'borderColor', 'borderWidth', 'shadow']) },
  { name: 'Typography', properties: new Set(['fontSize', 'color', 'fontWeight', 'lineHeight', 'letterSpacing']) },
];

function snapToGrid(ms: number): number {
  return Math.round(ms / SNAP_INTERVAL_MS) * SNAP_INTERVAL_MS;
}

function getCategoryForProperty(prop: string): string {
  for (const cat of PROPERTY_CATEGORIES) {
    if (cat.properties.has(prop)) {
      return cat.name;
    }
  }

  return 'Other';
}

function collectAnimatedProperties(keyframes: readonly Keyframe[]): readonly string[] {
  const props = new Set<string>();

  for (const kf of keyframes) {
    for (const key of Object.keys(kf.properties)) {
      props.add(key);
    }
  }

  return [...props];
}

function groupPropertiesByCategory(
  properties: readonly string[],
): ReadonlyArray<{ readonly category: string; readonly properties: readonly string[] }> {
  const groups = new Map<string, string[]>();

  for (const prop of properties) {
    const cat = getCategoryForProperty(prop);
    let arr = groups.get(cat);

    if (arr === undefined) {
      arr = [];
      groups.set(cat, arr);
    }

    arr.push(prop);
  }

  const result: Array<{ readonly category: string; readonly properties: readonly string[] }> = [];

  for (const cat of PROPERTY_CATEGORIES) {
    const arr = groups.get(cat.name);

    if (arr !== undefined && arr.length > 0) {
      result.push({ category: cat.name, properties: arr });
      groups.delete(cat.name);
    }
  }

  for (const [cat, arr] of groups) {
    if (arr.length > 0) {
      result.push({ category: cat, properties: arr });
    }
  }

  return result;
}

export interface PerPropertyLanesProps {
  readonly keyframes: readonly Keyframe[];
  readonly durationMs: number;
  readonly onAddPropertyKeyframe: (offsetMs: number, property: string) => void;
  readonly onMovePropertyKeyframe: (fromIndex: number, property: string, toOffsetMs: number) => void;
  readonly isExpanded?: boolean | undefined;
}

export function PerPropertyLanes(props: PerPropertyLanesProps): JSX.Element {
  const { keyframes, durationMs, onAddPropertyKeyframe, onMovePropertyKeyframe, isExpanded = true } = props;

  const allProperties = useMemo(() => collectAnimatedProperties(keyframes), [keyframes]);
  const groupedProperties = useMemo(() => groupPropertiesByCategory(allProperties), [allProperties]);

  const [dragState, setDragState] = useState<{
    readonly keyframeIndex: number;
    readonly property: string;
  } | null>(null);
  const laneContainerRef = useRef<HTMLDivElement | null>(null);

  const getOffsetFromClientX = useCallback(
    (clientX: number): number => {
      const container = laneContainerRef.current;

      if (container === null) {
        return 0;
      }

      const rect = container.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

      return snapToGrid(ratio * durationMs);
    },
    [durationMs],
  );

  const handleLaneDoubleClick = useCallback(
    (property: string, e: React.MouseEvent<HTMLDivElement>): void => {
      const offsetMs = getOffsetFromClientX(e.clientX);

      onAddPropertyKeyframe(offsetMs, property);
    },
    [getOffsetFromClientX, onAddPropertyKeyframe],
  );

  const handleMarkerPointerDown = useCallback(
    (keyframeIndex: number, property: string, e: React.PointerEvent<HTMLDivElement>): void => {
      e.stopPropagation();
      setDragState({ keyframeIndex, property });

      if (e.target instanceof HTMLElement && typeof e.target.setPointerCapture === 'function') {
        try {
          e.target.setPointerCapture(e.pointerId);
        } catch {
          // jsdom doesn't support setPointerCapture
        }
      }
    },
    [],
  );

  const handleContainerPointerMove = useCallback((_e: React.PointerEvent<HTMLDivElement>): void => {
    // Drag visual feedback could be added here; commit happens on pointerUp.
  }, []);

  const handleContainerPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (dragState === null) {
        return;
      }

      const offsetMs = getOffsetFromClientX(e.clientX);

      onMovePropertyKeyframe(dragState.keyframeIndex, dragState.property, offsetMs);
      setDragState(null);
    },
    [dragState, getOffsetFromClientX, onMovePropertyKeyframe],
  );

  if (!isExpanded || allProperties.length === 0) {
    return <div data-testid="per-property-lanes-collapsed" />;
  }

  return (
    <div
      ref={laneContainerRef}
      data-testid="per-property-lanes"
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01') }}
    >
      {groupedProperties.map((group) => (
        <div key={group.category}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: color('muted'),
              textTransform: 'uppercase',
              padding: `${sp('sp-01')} 0`,
            }}
          >
            {group.category}
          </div>

          {group.properties.map((prop) => (
            <div
              key={prop}
              data-testid="property-lane"
              data-property={prop}
              onDoubleClick={(e) => {
                handleLaneDoubleClick(prop, e);
              }}
              style={{
                position: 'relative',
                height: `${String(LANE_HEIGHT_PX)}px`,
                backgroundColor: color('surface-secondary'),
                borderRadius: '3px',
                marginBottom: '2px',
                cursor: 'crosshair',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: sp('sp-01'),
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '10px',
                  color: color('muted'),
                  zIndex: 1,
                  pointerEvents: 'none',
                }}
              >
                {prop}
              </span>

              {keyframes.map((kf, kfIndex) => {
                const propValue = kf.properties[prop];

                if (propValue === undefined) {
                  return null;
                }

                return (
                  <div
                    key={`${kf.name}-${String(kf.offsetMs)}-${prop}`}
                    data-testid="property-keyframe-marker"
                    data-offset-ms={String(kf.offsetMs)}
                    data-property={prop}
                    onPointerDown={(e) => {
                      handleMarkerPointerDown(kfIndex, prop, e);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${String((kf.offsetMs / durationMs) * 100)}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%) rotate(45deg)',
                      width: '8px',
                      height: '8px',
                      backgroundColor: color('accent'),
                      borderRadius: '1px',
                      cursor: 'grab',
                      zIndex: 2,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
