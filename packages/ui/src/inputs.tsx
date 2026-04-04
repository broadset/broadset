import { Button, Input, ListBox, ListBoxItem, NumberField, Select, Slider, TextField } from '@heroui/react';
import type { JSX, Key } from 'react';
import { useCallback, useId } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PX_PER_INCH = 96;
const MM_PER_INCH = 25.4;

const HUE_MAX = 360;
const ALPHA_MAX = 100;
const HUE_STEP = 1;

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------

type CssUnit = 'px' | 'mm' | 'in' | '%' | 'em' | 'rem';

const SUPPORTED_UNITS: readonly CssUnit[] = ['px', 'mm', 'in', '%', 'em', 'rem'];

function isCssUnit(value: string): value is CssUnit {
  return (SUPPORTED_UNITS as readonly string[]).includes(value);
}

/** Convert a value from one CSS length unit to px. */
function toPx(value: number, unit: CssUnit): number {
  switch (unit) {
    case 'px':
      return value;
    case 'mm':
      return (value * PX_PER_INCH) / MM_PER_INCH;
    case 'in':
      return value * PX_PER_INCH;
    case '%':
    case 'em':
    case 'rem':
      // Relative units cannot be converted without context — pass through.
      return value;
  }
}

/** Convert a px value to the given CSS length unit. */
function fromPx(px: number, unit: CssUnit): number {
  switch (unit) {
    case 'px':
      return px;
    case 'mm':
      return (px * MM_PER_INCH) / PX_PER_INCH;
    case 'in':
      return px / PX_PER_INCH;
    case '%':
    case 'em':
    case 'rem':
      return px;
  }
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

interface HslColor {
  readonly h: number;
  readonly s: number;
  readonly l: number;
  readonly a: number;
}

function hexToHsl(hex: string): HslColor {
  let cleaned = hex.replace('#', '');

  // Expand 3-digit hex to 6-digit
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split('')
      .map((c) => c + c)
      .join('');
  }

  const r = parseInt(cleaned.substring(0, 2), 16) / 255;
  const g = parseInt(cleaned.substring(2, 4), 16) / 255;
  const b = parseInt(cleaned.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l, a: 1 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6
    : max === g ? ((b - r) / d + 2) / 6
    : ((r - g) / d + 4) / 6;

  return { h: h * HUE_MAX, s, l, a: 1 };
}

const RGBA_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/;

function parseRgba(
  value: string,
): { readonly r: number; readonly g: number; readonly b: number; readonly a: number } | undefined {
  const m = RGBA_RE.exec(value);

  if (!m) return undefined;

  return {
    r: parseInt(m[1] ?? '0', 10),
    g: parseInt(m[2] ?? '0', 10),
    b: parseInt(m[3] ?? '0', 10),
    a: parseFloat(m[4] ?? '1'),
  };
}

function parseAlphaFromValue(value: string): number {
  if (value.startsWith('rgba')) {
    const parsed = parseRgba(value);

    return parsed ? parsed.a : 1;
  }

  return 1;
}

// ---------------------------------------------------------------------------
// ColorInput
// ---------------------------------------------------------------------------

export interface ColorInputProps {
  readonly value: string;
  readonly onChange: (color: string) => void;
  readonly label: string;
}

export function ColorInput({ value, onChange, label }: ColorInputProps): JSX.Element {
  const id = useId();
  const alpha = parseAlphaFromValue(value);
  const hsl = value.startsWith('#') ? hexToHsl(value) : { h: 0, s: 0, l: 0, a: alpha };

  const handleHexChange = useCallback(
    (newValue: string): void => {
      onChange(newValue);
    },
    [onChange],
  );

  const handleHueChange = useCallback(
    (hue: number | number[]): void => {
      if (Array.isArray(hue)) return;

      const c = Math.round((hue / HUE_MAX) * 255);
      const hex = `#${c.toString(16).padStart(2, '0')}0000`;

      onChange(hex);
    },
    [onChange],
  );

  const handleAlphaChange = useCallback(
    (alphaValue: number | number[]): void => {
      if (Array.isArray(alphaValue)) return;

      const a = alphaValue / ALPHA_MAX;
      const parsed = value.startsWith('rgba') ? parseRgba(value) : undefined;
      const r = parsed?.r ?? 0;
      const g = parsed?.g ?? 0;
      const b = parsed?.b ?? 0;

      onChange(`rgba(${String(r)},${String(g)},${String(b)},${String(a)})`);
    },
    [onChange, value],
  );

  return (
    <div>
      <TextField aria-label={label} value={value} onChange={handleHexChange}>
        <Input id={`${id}-hex`} />
      </TextField>
      <Slider
        aria-label="Hue"
        minValue={0}
        maxValue={HUE_MAX}
        step={HUE_STEP}
        value={Math.round(hsl.h)}
        onChange={handleHueChange}
      >
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
      </Slider>
      <Slider
        aria-label="Alpha / Opacity"
        minValue={0}
        maxValue={ALPHA_MAX}
        value={Math.round(alpha * ALPHA_MAX)}
        onChange={handleAlphaChange}
      >
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
      </Slider>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CssLengthInput
// ---------------------------------------------------------------------------

export interface CssLengthInputProps {
  readonly value: number;
  readonly unit: CssUnit;
  readonly onChange: (value: number, unit: CssUnit) => void;
  readonly label: string;
}

export function CssLengthInput({ value, unit, onChange, label }: CssLengthInputProps): JSX.Element {
  const id = useId();
  const isInvalid = Number.isNaN(value);

  const handleValueChange = useCallback(
    (num: number): void => {
      onChange(num, unit);
    },
    [onChange, unit],
  );

  const handleUnitChange = useCallback(
    (key: Key | null): void => {
      if (key === null) return;

      const raw = String(key);

      if (!isCssUnit(raw)) return;

      const px = toPx(value, unit);
      const converted = fromPx(px, raw);

      onChange(converted, raw);
    },
    [onChange, value, unit],
  );

  return (
    <div>
      <NumberField
        id={`${id}-value`}
        aria-label={label}
        isInvalid={isInvalid}
        value={isInvalid ? 0 : value}
        onChange={handleValueChange}
      >
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <Select id={`${id}-unit`} aria-label="Unit" value={unit} onChange={handleUnitChange}>
        <Select.Trigger>
          <Select.Value />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {SUPPORTED_UNITS.map((u) => (
              <ListBoxItem key={u} id={u}>
                {u}
              </ListBoxItem>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TextStrokeInput
// ---------------------------------------------------------------------------

export interface TextStrokeInputProps {
  readonly width: number;
  readonly color: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}

export function TextStrokeInput({ width, color, onChange, label }: TextStrokeInputProps): JSX.Element {
  const id = useId();

  const handleWidthChange = useCallback(
    (w: number): void => {
      onChange(`${String(w)}px ${color}`);
    },
    [onChange, color],
  );

  return (
    <fieldset aria-label={label}>
      <NumberField id={`${id}-width`} aria-label="Stroke width" value={width} onChange={handleWidthChange}>
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <TextField id={`${id}-color`} aria-label="Stroke color" value={color} isReadOnly>
        <Input />
      </TextField>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// FilterEditor
// ---------------------------------------------------------------------------

interface ParsedFilter {
  readonly name: string;
  readonly args: string;
}

const FILTER_RE = /(\w[\w-]*)\(([^)]*)\)/g;

function parseFilterString(value: string): readonly ParsedFilter[] {
  const results: ParsedFilter[] = [];
  let match: RegExpExecArray | null = FILTER_RE.exec(value);

  while (match !== null) {
    results.push({ name: match[1] ?? '', args: match[2] ?? '' });
    match = FILTER_RE.exec(value);
  }

  // Reset lastIndex for global regex
  FILTER_RE.lastIndex = 0;

  return results;
}

function buildFilterString(filters: readonly ParsedFilter[]): string {
  return filters.map((f) => `${f.name}(${f.args})`).join(' ');
}

export interface FilterEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}

export function FilterEditor({ value, onChange, label }: FilterEditorProps): JSX.Element {
  const filters = parseFilterString(value);

  const handleRemove = useCallback(
    (index: number): void => {
      const updated = filters.filter((_, i) => i !== index);

      onChange(buildFilterString(updated));
    },
    [filters, onChange],
  );

  return (
    <div aria-label={label}>
      <ul>
        {filters.map((f, i) => (
          <li key={`${f.name}-${String(i)}`}>
            <span>{f.name}</span>
            <span>({f.args})</span>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove ${f.name}`}
              onPress={() => {
                handleRemove(i);
              }}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShadowEditor
// ---------------------------------------------------------------------------

interface ParsedShadow {
  readonly offsetX: string;
  readonly offsetY: string;
  readonly blur: string;
  readonly color: string;
}

function parseShadowLayers(value: string): readonly ParsedShadow[] {
  return value.split(',').map((layer) => {
    const parts = layer.trim().split(/\s+/);

    return {
      offsetX: parts[0] ?? '0px',
      offsetY: parts[1] ?? '0px',
      blur: parts[2] ?? '0px',
      color: parts[3] ?? '#000000',
    };
  });
}

export interface ShadowEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}

export function ShadowEditor({ value, onChange, label }: ShadowEditorProps): JSX.Element {
  const layers = parseShadowLayers(value);

  const handleFieldChange = useCallback(
    (layerIndex: number, field: keyof ParsedShadow, newFieldValue: string): void => {
      const updated = layers.map((layer, i) => {
        if (i !== layerIndex) return layer;

        return { ...layer, [field]: newFieldValue };
      });

      const serialized = updated.map((l) => `${l.offsetX} ${l.offsetY} ${l.blur} ${l.color}`).join(', ');

      onChange(serialized);
    },
    [layers, onChange],
  );

  return (
    <div aria-label={label}>
      {layers.map((layer, i) => (
        <fieldset key={String(i)} role="group" aria-label={`Shadow layer ${String(i + 1)}`}>
          <TextField
            aria-label={`Offset X (layer ${String(i + 1)})`}
            value={layer.offsetX}
            onChange={(v: string) => {
              handleFieldChange(i, 'offsetX', v);
            }}
          >
            <Input />
          </TextField>
          <TextField
            aria-label={`Offset Y (layer ${String(i + 1)})`}
            value={layer.offsetY}
            onChange={(v: string) => {
              handleFieldChange(i, 'offsetY', v);
            }}
          >
            <Input />
          </TextField>
          <TextField
            aria-label={`Blur radius (layer ${String(i + 1)})`}
            value={layer.blur}
            onChange={(v: string) => {
              handleFieldChange(i, 'blur', v);
            }}
          >
            <Input />
          </TextField>
          <TextField
            aria-label={`Color (layer ${String(i + 1)})`}
            value={layer.color}
            onChange={(v: string) => {
              handleFieldChange(i, 'color', v);
            }}
          >
            <Input />
          </TextField>
        </fieldset>
      ))}
    </div>
  );
}
