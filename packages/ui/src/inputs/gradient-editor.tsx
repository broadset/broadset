import { colorToCss, migrateLegacyColor } from '@broadset/model';
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
  readonly positionText?: string;
}

interface GradientHint {
  readonly position: number;
  readonly text: string;
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
const DEFAULT_CENTER: readonly [number, number] = [50, 50];

type GradientType = 'linear' | 'radial' | 'conic';

interface ParsedGradient {
  readonly type: GradientType;
  readonly angle: number;
  readonly center: readonly [number, number];
  readonly hints: readonly GradientHint[];
  readonly isEditable: boolean;
  readonly radialDescriptor?: string;
  readonly rawValue?: string;
  readonly stops: readonly GradientStop[];
}

interface ParsedStop {
  readonly color: string;
  readonly position?: number;
  readonly positionText?: string;
}

interface ParsedStopList {
  readonly hints: readonly GradientHint[];
  readonly stops: readonly GradientStop[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(value: number): number {
  return ((value % 360) + 360) % 360;
}

function parseCenter(value: string): readonly [number, number] {
  const centerMatch = /\bat\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/iu.exec(value);

  if (centerMatch === null) {
    return DEFAULT_CENTER;
  }

  const x = Number.parseFloat(centerMatch[1] ?? String(DEFAULT_CENTER[0]));
  const y = Number.parseFloat(centerMatch[2] ?? String(DEFAULT_CENTER[1]));

  return [
    Number.isFinite(x) ? clamp(x, 0, 100) : DEFAULT_CENTER[0],
    Number.isFinite(y) ? clamp(y, 0, 100) : DEFAULT_CENTER[1],
  ];
}

function splitTopLevelCommas(value: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth = Math.max(0, depth - 1);
    } else if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(value.slice(start).trim());

  return parts.filter((part) => part !== '');
}

function findFunctionEnd(value: string, openParenIndex: number): number {
  let depth = 0;

  for (let index = openParenIndex; index < value.length; index += 1) {
    const character = value[index];

    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function parseColorToken(colorText: string): string | null {
  try {
    const colorValue = migrateLegacyColor(colorText);

    return colorValue === undefined ? null : colorToCss(colorValue);
  } catch {
    return null;
  }
}

function extractColorToken(value: string): { readonly color: string; readonly rest: string } | null {
  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  const hexMatch = /^#[0-9a-f]{3,8}\b/iu.exec(trimmed);

  if (hexMatch !== null) {
    const colorText = hexMatch[0];
    const color = parseColorToken(colorText);

    return color === null ? null : { color, rest: trimmed.slice(colorText.length).trim() };
  }

  const functionStart = /^[a-z][\w-]*\(/iu.exec(trimmed);

  if (functionStart !== null) {
    const openParenIndex = functionStart[0].length - 1;
    const functionEnd = findFunctionEnd(trimmed, openParenIndex);

    if (functionEnd >= 0) {
      const colorText = trimmed.slice(0, functionEnd + 1);
      const color = parseColorToken(colorText);

      return color === null ? null : { color, rest: trimmed.slice(functionEnd + 1).trim() };
    }
  }

  const keywordMatch = /^[a-z]+/iu.exec(trimmed);

  if (keywordMatch === null) {
    return null;
  }

  const colorText = keywordMatch[0];
  const color = parseColorToken(colorText);

  return color === null ? null : { color, rest: trimmed.slice(colorText.length).trim() };
}

function parsePositionToken(
  value: string,
  type: GradientType,
): { readonly position: number; readonly text: string } | null {
  const positionMatch = /^(-?\d+(?:\.\d+)?)(%|deg)(?=\s|$)(.*)$/iu.exec(value.trim());

  if (positionMatch === null) {
    return null;
  }

  const rawPosition = Number.parseFloat(positionMatch[1] ?? '0');
  const unit = positionMatch[2]?.toLowerCase();
  const rest = positionMatch[3]?.trim() ?? '';

  if (!Number.isFinite(rawPosition) || rest !== '') {
    return null;
  }

  if (unit === '%') {
    const position = clamp(rawPosition, 0, 100);

    return { position, text: `${String(position)}%` };
  }

  if (unit === 'deg' && type === 'conic') {
    const angle = normalizeAngle(rawPosition);

    return { position: (angle / 360) * 100, text: `${String(angle)}deg` };
  }

  return null;
}

function parseStopPart(value: string, type: GradientType): ParsedStop | null {
  const colorToken = extractColorToken(value);

  if (colorToken === null) {
    return null;
  }

  if (colorToken.rest === '') {
    return { color: colorToken.color };
  }

  const position = parsePositionToken(colorToken.rest, type);

  if (position === null) {
    return null;
  }

  return {
    color: colorToken.color,
    position: position.position,
    positionText: position.text,
  };
}

function withResolvedStopPositions(parsedStops: readonly ParsedStop[]): readonly GradientStop[] {
  const lastIndex = Math.max(parsedStops.length - 1, 1);

  return parsedStops
    .map((stop, index) => ({
      color: stop.color,
      position: stop.position ?? (index / lastIndex) * 100,
      ...(stop.positionText === undefined ? {} : { positionText: stop.positionText }),
    }))
    .sort((left, right) => left.position - right.position);
}

function parseHintPart(value: string, type: GradientType): GradientHint | null {
  return parsePositionToken(value, type);
}

function parseStops(parts: readonly string[], type: GradientType): ParsedStopList | null {
  const parsedStops: ParsedStop[] = [];
  const parsedHints: GradientHint[] = [];

  for (const part of parts) {
    const stop = parseStopPart(part, type);

    if (stop !== null) {
      parsedStops.push(stop);

      continue;
    }

    const hint = parseHintPart(part, type);

    if (hint === null) {
      return null;
    }

    parsedHints.push(hint);
  }

  const stops = withResolvedStopPositions(parsedStops);

  return stops.length < MIN_STOPS ? null : { hints: parsedHints, stops };
}

function parseLinearDirectionAngle(value: string): number | undefined {
  const normalized = value.trim().toLowerCase();

  if (!normalized.startsWith('to ')) {
    return undefined;
  }

  const directions = new Set(normalized.slice(3).split(/\s+/u));
  const hasTop = directions.has('top');
  const hasRight = directions.has('right');
  const hasBottom = directions.has('bottom');
  const hasLeft = directions.has('left');

  if (hasTop && hasRight) return 45;
  if (hasBottom && hasRight) return 135;
  if (hasBottom && hasLeft) return 225;
  if (hasTop && hasLeft) return 315;
  if (hasTop) return 0;
  if (hasRight) return 90;
  if (hasBottom) return 180;
  if (hasLeft) return 270;

  return undefined;
}

function parseGradientDescriptorAngle(value: string): number | undefined {
  const angleMatch = /(?:^|\bfrom\s+)(-?\d+(?:\.\d+)?)deg\b/iu.exec(value);

  if (angleMatch === null) {
    return undefined;
  }

  const angle = Number.parseFloat(angleMatch[1] ?? '0');

  return Number.isFinite(angle) ? normalizeAngle(angle) : undefined;
}

function fallbackGradient(type: GradientType, angle = DEFAULT_ANGLE, center = DEFAULT_CENTER): ParsedGradient {
  return { type, angle, center, hints: [], isEditable: true, stops: DEFAULT_STOPS };
}

function unsupportedGradient(
  type: GradientType,
  rawValue: string,
  angle = DEFAULT_ANGLE,
  center = DEFAULT_CENTER,
): ParsedGradient {
  return {
    type,
    angle,
    center,
    hints: [],
    isEditable: false,
    rawValue,
    stops: DEFAULT_STOPS,
  };
}

function parseLinearGradientParts(parts: readonly string[]): ParsedGradient | null {
  const firstPart = parts[0] ?? '';
  const angleMatch = /^(-?\d+(?:\.\d+)?)deg$/iu.exec(firstPart);
  const directionAngle = parseLinearDirectionAngle(firstPart);
  const hasDescriptor = angleMatch !== null || directionAngle !== undefined;
  const angle =
    angleMatch === null ?
      (directionAngle ?? DEFAULT_ANGLE)
    : normalizeAngle(Number.parseFloat(angleMatch[1] ?? '0'));
  const stopList = parseStops(hasDescriptor ? parts.slice(1) : parts, 'linear');

  return stopList === null ?
      null
    : { type: 'linear', angle, center: DEFAULT_CENTER, hints: stopList.hints, isEditable: true, stops: stopList.stops };
}

function parseRadialGradientParts(parts: readonly string[]): ParsedGradient | null {
  const firstStop = parseStopPart(parts[0] ?? '', 'radial');
  const radialDescriptor = firstStop === null ? (parts[0] ?? '').trim() : undefined;
  const stopList = parseStops(firstStop === null ? parts.slice(1) : parts, 'radial');

  if (stopList === null) {
    return null;
  }

  const center = radialDescriptor === undefined ? DEFAULT_CENTER : parseCenter(radialDescriptor);

  return {
    type: 'radial',
    angle: DEFAULT_ANGLE,
    center,
    hints: stopList.hints,
    isEditable: true,
    ...(radialDescriptor === undefined ? {} : { radialDescriptor }),
    stops: stopList.stops,
  };
}

function parseConicGradientParts(parts: readonly string[]): ParsedGradient | null {
  const firstStop = parseStopPart(parts[0] ?? '', 'conic');
  const descriptor = firstStop === null ? (parts[0] ?? '') : '';
  const stopList = parseStops(firstStop === null ? parts.slice(1) : parts, 'conic');

  if (stopList === null) {
    return null;
  }

  return {
    type: 'conic',
    angle: parseGradientDescriptorAngle(descriptor) ?? 0,
    center: parseCenter(descriptor),
    hints: stopList.hints,
    isEditable: true,
    stops: stopList.stops,
  };
}

function parseGradient(value: string): ParsedGradient {
  const gradientMatch = /^(linear|radial|conic)-gradient\((.*)\)$/isu.exec(value.trim());

  if (gradientMatch === null) {
    const unsupportedMatch = /^(repeating-linear|repeating-radial|repeating-conic)-gradient\(/iu.exec(value.trim());
    const unsupportedType = unsupportedMatch?.[1]?.replace('repeating-', '') as GradientType | undefined;

    if (unsupportedType !== undefined) {
      return unsupportedGradient(unsupportedType, value, unsupportedType === 'conic' ? 0 : DEFAULT_ANGLE, parseCenter(value));
    }

    return fallbackGradient('linear');
  }

  const type = (gradientMatch[1]?.toLowerCase() as GradientType | undefined) ?? 'linear';
  const parts = splitTopLevelCommas(gradientMatch[2] ?? '');

  switch (type) {
    case 'linear':
      return parseLinearGradientParts(parts) ?? unsupportedGradient(type, value);

    case 'radial':
      return parseRadialGradientParts(parts) ?? unsupportedGradient(type, value, DEFAULT_ANGLE, parseCenter(value));

    case 'conic':
      return parseConicGradientParts(parts) ?? unsupportedGradient(type, value, 0, parseCenter(value));
  }
}

function formatStop(stop: GradientStop): string {
  return `${stop.color} ${stop.positionText ?? `${String(stop.position)}%`}`;
}

function formatGradientItems(stops: readonly GradientStop[], hints: readonly GradientHint[]): string {
  const stopItems = stops.map((stop, index) => ({
    order: index * 2,
    position: stop.position,
    text: formatStop(stop),
  }));
  const hintItems = hints.map((hint, index) => ({
    order: index * 2 + 1,
    position: hint.position,
    text: hint.text,
  }));

  return [...stopItems, ...hintItems]
    .sort((left, right) => left.position - right.position || left.order - right.order)
    .map((item) => item.text)
    .join(', ');
}

function buildGradient(
  type: GradientType,
  angle: number,
  center: readonly [number, number],
  stops: readonly GradientStop[],
  hints: readonly GradientHint[],
  radialDescriptor?: string,
): string {
  const stopText = formatGradientItems(stops, hints);

  if (type === 'radial') {
    const descriptor = radialDescriptor ?? `circle at ${String(center[0])}% ${String(center[1])}%`;

    return `radial-gradient(${descriptor}, ${stopText})`;
  }

  if (type === 'conic') {
    return `conic-gradient(from ${String(Math.round(angle))}deg at ${String(center[0])}% ${String(center[1])}%, ${stopText})`;
  }

  return `linear-gradient(${String(Math.round(angle))}deg, ${stopText})`;
}

export interface GradientEditorProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function GradientEditor({ label, value, onChange }: GradientEditorProps): JSX.Element {
  const parsed = useMemo(() => parseGradient(value), [value]);
  const [gradientType, setGradientType] = useState(parsed.type);
  const [angle, setAngle] = useState(parsed.angle);
  const [center, setCenter] = useState(parsed.center);
  const [hints, setHints] = useState(parsed.hints);
  const [isEditable, setIsEditable] = useState(parsed.isEditable);
  const [radialDescriptor, setRadialDescriptor] = useState(parsed.radialDescriptor);
  const [rawValue, setRawValue] = useState(parsed.rawValue);
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

    setGradientType(parsed.type);
    setAngle(parsed.angle);
    setCenter(parsed.center);
    setHints(parsed.hints);
    setIsEditable(parsed.isEditable);
    setRadialDescriptor(parsed.radialDescriptor);
    setRawValue(parsed.rawValue);
    setStops(parsed.stops);
    setSelectedIndex((current) => (current < parsed.stops.length ? current : 0));
    draggingIndexRef.current = null;
  }, [
    parsed.angle,
    parsed.center,
    parsed.hints,
    parsed.isEditable,
    parsed.radialDescriptor,
    parsed.rawValue,
    parsed.stops,
    parsed.type,
    value,
  ]);

  const selected = stops[selectedIndex] ?? stops[0] ?? { color: '#000000', position: 0 };

  const emit = useCallback(
    (nextAngle: number, nextStops: readonly GradientStop[]): void => {
      if (!isEditable) {
        return;
      }

      const nextValue = buildGradient(gradientType, nextAngle, center, nextStops, hints, radialDescriptor);

      lastEmittedRef.current = nextValue;
      onChange(nextValue);
    },
    [center, gradientType, hints, isEditable, onChange, radialDescriptor],
  );

  const updateStop = (index: number, nextStop: GradientStop): void => {
    if (!isEditable) {
      return;
    }

    const nextStops = stops.map((stop, i) => (i === index ? nextStop : stop));

    setStops(nextStops);
    emit(angle, nextStops);
  };

  const removeSelected = (): void => {
    if (!isEditable || stops.length <= MIN_STOPS) {
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

      if (!isEditable || rect === undefined || rect.width <= 0 || stop === undefined || !Number.isFinite(clientX)) {
        return;
      }

      const nextPosition = clamp(Math.round(((clientX - rect.left) / rect.width) * 100), 0, 100);

      if (nextPosition === stop.position) {
        return;
      }

      const nextStops = stopsRef.current.map((entry, entryIndex) =>
        entryIndex === index ? { color: entry.color, position: nextPosition } : entry,
      );

      stopsRef.current = nextStops;
      setStops(nextStops);
      emit(angle, nextStops);
    },
    [angle, emit, isEditable],
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
    if (!isEditable) {
      return;
    }

    draggingIndexRef.current = index;
    setSelectedIndex(index);
    updateStopPositionFromClientX(index, clientX);
  };

  const addStop = (): void => {
    if (!isEditable || stops.length >= MAX_STOPS) {
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
  const previewGradient = isEditable ? buildGradient(gradientType, angle, center, stops, hints, radialDescriptor) : rawValue;

  return (
    <fieldset aria-label={label} style={{ border: 'none', margin: 0, padding: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
        <div
          ref={gradientBarRef}
          aria-label={`${label} stops`}
          role="group"
          style={{
            background: previewGradient,
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
              isDisabled={!isEditable}
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
            isDisabled={!isEditable}
            onChange={(nextValue) => {
              updateStop(selectedIndex, { color: selected.color, position: clamp(nextValue, 0, 100) });
            }}
          />
          <ColorInput
            compact
            label="Stop color"
            isDisabled={!isEditable}
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
            isDisabled={!isEditable}
            value={angle}
            onChange={(nextAngle) => {
              if (!isEditable) {
                return;
              }

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
              isDisabled={!isEditable}
              onChange={(nextAngle) => {
                if (!isEditable) {
                  return;
                }

                const normalized = ((nextAngle % 360) + 360) % 360;

                setAngle(normalized);
                emit(normalized, stops);
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: sp('sp-02') }}>
          <Button aria-label="Add stop" isDisabled={!isEditable || stops.length >= MAX_STOPS} onPress={addStop}>
            Add stop
          </Button>
          <Button
            aria-label="Remove selected stop"
            isDisabled={!isEditable || stops.length <= MIN_STOPS}
            onPress={removeSelected}
          >
            Remove stop
          </Button>
        </div>
      </div>
    </fieldset>
  );
}
