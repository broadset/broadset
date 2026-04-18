import { Button } from '@heroui/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { color, radius, sp } from '../tokens';
import { AngleDial } from './angle-dial';
import { ColorInput } from './color-input';
import { NumField } from './number-inputs';

interface GradientStop {
  readonly color: string;
  readonly position: number;
}

const DEFAULT_STOPS: readonly GradientStop[] = [
  { color: '#ff0000', position: 0 },
  { color: '#0000ff', position: 100 },
];

const DEFAULT_ANGLE = 90;
const MIN_STOPS = 2;
const MAX_STOPS = 8;
const GRADIENT_BAR_HEIGHT = sp('sp-07');
const STOP_HANDLE_SIZE = sp('sp-05');

interface ParsedGradient {
  readonly angle: number;
  readonly stops: readonly GradientStop[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseGradient(value: string): ParsedGradient {
  const angleMatch = /linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg/i.exec(value);
  const angle = Number.parseFloat(angleMatch?.[1] ?? String(DEFAULT_ANGLE));

  const stopRegex = /(#[0-9a-fA-F]{3,8})\s+(\d+(?:\.\d+)?)%/g;
  const parsedStops: GradientStop[] = [];
  let match: RegExpExecArray | null = stopRegex.exec(value);

  while (match !== null) {
    const color = match[1] ?? '#000000';
    const positionRaw = Number.parseFloat(match[2] ?? '0');

    parsedStops.push({ color, position: clamp(positionRaw, 0, 100) });
    match = stopRegex.exec(value);
  }

  if (parsedStops.length < MIN_STOPS) {
    return { angle: Number.isFinite(angle) ? angle : DEFAULT_ANGLE, stops: DEFAULT_STOPS };
  }

  return {
    angle: Number.isFinite(angle) ? clamp(angle, 0, 360) : DEFAULT_ANGLE,
    stops: parsedStops,
  };
}

function buildGradient(angle: number, stops: readonly GradientStop[]): string {
  const ordered = [...stops].sort((left, right) => left.position - right.position);
  const stopText = ordered.map((stop) => `${stop.color} ${String(stop.position)}%`).join(', ');

  return `linear-gradient(${String(Math.round(angle))}deg, ${stopText})`;
}

export interface GradientEditorProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function GradientEditor({ label, value, onChange }: GradientEditorProps): JSX.Element {
  const parsed = useMemo(() => parseGradient(value), [value]);
  const [angle, setAngle] = useState(parsed.angle);
  const [stops, setStops] = useState(parsed.stops);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const gradientBarRef = useRef<HTMLDivElement | null>(null);
  const draggingIndexRef = useRef<number | null>(null);
  // Remember the last gradient string we emitted so we don't reset our own
  // drag/editing state when the value prop re-enters on the next render.
  const lastEmittedRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastEmittedRef.current === value) {
      // The incoming value is one we just emitted; don't stomp local state.
      return;
    }

    setAngle(parsed.angle);
    setStops(parsed.stops);
    setSelectedIndex((current) => (current < parsed.stops.length ? current : 0));
    draggingIndexRef.current = null;
  }, [parsed.angle, parsed.stops, value]);

  const selected = stops[selectedIndex] ?? stops[0] ?? { color: '#000000', position: 0 };

  const emit = useCallback(
    (nextAngle: number, nextStops: readonly GradientStop[]): void => {
      const nextValue = buildGradient(nextAngle, nextStops);

      lastEmittedRef.current = nextValue;
      onChange(nextValue);
    },
    [onChange],
  );

  const updateStop = (index: number, nextStop: GradientStop): void => {
    const nextStops = stops.map((stop, i) => (i === index ? nextStop : stop));

    setStops(nextStops);
    emit(angle, nextStops);
  };

  const removeSelected = (): void => {
    if (stops.length <= MIN_STOPS) {
      return;
    }

    const nextStops = stops.filter((_stop, index) => index !== selectedIndex);
    const nextSelected = Math.max(0, Math.min(selectedIndex, nextStops.length - 1));

    setStops(nextStops);
    setSelectedIndex(nextSelected);
    emit(angle, nextStops);
  };

  const stopsRef = useRef(stops);

  useEffect(() => {
    stopsRef.current = stops;
  }, [stops]);

  const updateStopPositionFromClientX = useCallback(
    (index: number, clientX: number): void => {
      const rect = gradientBarRef.current?.getBoundingClientRect();
      const stop = stopsRef.current[index];

      if (rect === undefined || rect.width <= 0 || stop === undefined || !Number.isFinite(clientX)) {
        return;
      }

      const nextPosition = clamp(Math.round(((clientX - rect.left) / rect.width) * 100), 0, 100);

      if (nextPosition === stop.position) {
        return;
      }

      const nextStops = stopsRef.current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, position: nextPosition } : entry,
      );

      stopsRef.current = nextStops;
      setStops(nextStops);
      emit(angle, nextStops);
    },
    [angle, emit],
  );

  // Window-level drag listeners: once HeroUI's Button captures the pointer on
  // press, the parent track no longer receives pointermove events. Binding on
  // window sidesteps that so we get every move regardless of which element is
  // the pointer target while a drag is in flight. Both pointer* and mouse*
  // are listened to because jsdom in tests only fires the mouse variants.
  useEffect(() => {
    const handleMove = (event: MouseEvent): void => {
      const activeIndex = draggingIndexRef.current;

      if (activeIndex === null) {
        return;
      }

      event.preventDefault();
      updateStopPositionFromClientX(activeIndex, event.clientX);
    };

    const handleUp = (): void => {
      draggingIndexRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [updateStopPositionFromClientX]);

  const startDrag = (index: number, clientX: number): void => {
    draggingIndexRef.current = index;
    setSelectedIndex(index);
    updateStopPositionFromClientX(index, clientX);
  };

  const addStop = (): void => {
    if (stops.length >= MAX_STOPS) {
      return;
    }

    const nextStop: GradientStop = {
      color: selected.color,
      position: 50,
    };
    const nextStops = [...stops, nextStop];

    setStops(nextStops);
    setSelectedIndex(nextStops.length - 1);
    emit(angle, nextStops);
  };

  return (
    <fieldset aria-label={label} style={{ border: 'none', margin: 0, padding: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
        <div
          ref={gradientBarRef}
          aria-label={`${label} stops`}
          role="group"
          style={{
            background: buildGradient(angle, stops),
            border: `1px solid ${color('border')}`,
            borderRadius: radius('md'),
            height: GRADIENT_BAR_HEIGHT,
            position: 'relative',
            touchAction: 'none',
          }}
        >
          {stops.map((stop, index) => (
            <Button
              key={String(index)}
              aria-label={`Stop ${String(index + 1)} handle`}
              variant={index === selectedIndex ? 'secondary' : 'ghost'}
              style={{
                cursor: 'ew-resize',
                height: STOP_HANDLE_SIZE,
                left: `${String(stop.position)}%`,
                minWidth: STOP_HANDLE_SIZE,
                padding: 0,
                position: 'absolute',
                top: '50%',
                touchAction: 'none',
                transform: 'translate(-50%, -50%)',
                width: STOP_HANDLE_SIZE,
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                startDrag(index, event.clientX);
              }}
              onPress={() => {
                setSelectedIndex(index);
              }}
            >
              {Math.round(stop.position)}%
            </Button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sp('sp-02') }}>
          <NumField
            compact
            label="Stop position"
            value={selected.position}
            min={0}
            max={100}
            step={1}
            onChange={(nextValue) => {
              updateStop(selectedIndex, { ...selected, position: clamp(nextValue, 0, 100) });
            }}
          />
          <ColorInput
            compact
            label="Stop color"
            value={selected.color}
            onChange={(nextColor) => {
              updateStop(selectedIndex, { ...selected, color: nextColor });
            }}
          />
        </div>

        <div
          style={{
            alignItems: 'center',
            display: 'grid',
            gap: sp('sp-03'),
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            minWidth: 0,
          }}
        >
          <AngleDial
            ariaLabel="Gradient angle"
            value={angle}
            onChange={(nextAngle) => {
              setAngle(nextAngle);
              emit(nextAngle, stops);
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01'), minWidth: 0 }}>
            <span
              style={{
                color: color('muted'),
                fontSize: '0.6875rem',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Angle · °
            </span>
            <NumField
              compact
              label="Gradient angle"
              value={angle}
              min={0}
              max={360}
              step={1}
              onChange={(nextAngle) => {
                const normalized = ((nextAngle % 360) + 360) % 360;

                setAngle(normalized);
                emit(normalized, stops);
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: sp('sp-02') }}>
          <Button aria-label="Add stop" onPress={addStop}>
            Add stop
          </Button>
          <Button aria-label="Remove selected stop" isDisabled={stops.length <= MIN_STOPS} onPress={removeSelected}>
            Remove stop
          </Button>
        </div>
      </div>
    </fieldset>
  );
}
