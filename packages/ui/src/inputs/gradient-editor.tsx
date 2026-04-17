import { Button, NumberField, Slider } from '@heroui/react';
import type { JSX, PointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { color, radius, sp } from '../tokens';
import { ColorInput } from './color-input';

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

  useEffect(() => {
    setAngle(parsed.angle);
    setStops(parsed.stops);
    setSelectedIndex(0);
    draggingIndexRef.current = null;
  }, [parsed.angle, parsed.stops]);

  const selected = stops[selectedIndex] ?? stops[0] ?? { color: '#000000', position: 0 };

  const emit = (nextAngle: number, nextStops: readonly GradientStop[]): void => {
    onChange(buildGradient(nextAngle, nextStops));
  };

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

  const updateStopPositionFromClientX = (index: number, clientX: number): void => {
    const rect = gradientBarRef.current?.getBoundingClientRect();
    const stop = stops[index];

    if (rect === undefined || rect.width <= 0 || stop === undefined || !Number.isFinite(clientX)) {
      return;
    }

    const nextPosition = clamp(Math.round(((clientX - rect.left) / rect.width) * 100), 0, 100);

    updateStop(index, { ...stop, position: nextPosition });
  };

  const releasePointer = (event: PointerEvent<HTMLButtonElement>): void => {
    if (
      typeof event.currentTarget.hasPointerCapture === 'function' &&
      typeof event.currentTarget.releasePointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    draggingIndexRef.current = null;
  };

  const dragActiveStop = (clientX: number): void => {
    const activeIndex = draggingIndexRef.current;

    if (activeIndex === null) {
      return;
    }

    updateStopPositionFromClientX(activeIndex, clientX);
  };

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
          }}
          onPointerMove={(event) => {
            dragActiveStop(event.clientX);
          }}
          onPointerUp={() => {
            draggingIndexRef.current = null;
          }}
          onMouseMove={(event) => {
            dragActiveStop(event.clientX);
          }}
          onMouseUp={() => {
            draggingIndexRef.current = null;
          }}
        >
          {stops.map((stop, index) => (
            <Button
              key={String(index)}
              aria-label={`Stop ${String(index + 1)} handle`}
              variant={index === selectedIndex ? 'secondary' : 'ghost'}
              style={{
                height: STOP_HANDLE_SIZE,
                left: `${String(stop.position)}%`,
                minWidth: STOP_HANDLE_SIZE,
                padding: 0,
                position: 'absolute',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: STOP_HANDLE_SIZE,
              }}
              onPointerDown={(event) => {
                if (typeof event.currentTarget.setPointerCapture === 'function') {
                  event.currentTarget.setPointerCapture(event.pointerId);
                }

                startDrag(index, event.clientX);
              }}
              onMouseDown={(event) => {
                startDrag(index, event.clientX);
              }}
              onPointerUp={releasePointer}
              onPointerCancel={releasePointer}
              onPress={() => {
                setSelectedIndex(index);
              }}
            >
              {Math.round(stop.position)}%
            </Button>
          ))}
        </div>

        <Slider
          aria-label="Gradient angle"
          minValue={0}
          maxValue={360}
          step={1}
          value={angle}
          onChange={(sliderValue: number | readonly number[]) => {
            const nextAngle = typeof sliderValue === 'number' ? sliderValue : (sliderValue[0] ?? 0);

            setAngle(nextAngle);
            emit(nextAngle, stops);
          }}
        >
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sp('sp-02') }}>
          <NumberField
            aria-label="Stop position"
            value={selected.position}
            minValue={0}
            maxValue={100}
            step={1}
            onChange={(numberValue) => {
              const nextPosition = typeof numberValue === 'number' ? numberValue : Number(numberValue);

              updateStop(selectedIndex, { ...selected, position: clamp(nextPosition, 0, 100) });
            }}
          >
            <NumberField.Group>
              <NumberField.Input />
            </NumberField.Group>
          </NumberField>
          <ColorInput
            label="Stop color"
            value={selected.color}
            onChange={(nextColor) => {
              updateStop(selectedIndex, { ...selected, color: nextColor });
            }}
          />
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
