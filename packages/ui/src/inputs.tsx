import {
  Button,
  ColorArea,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker,
  Input,
  ListBox,
  NumberField,
  parseColor,
  Popover,
  Select,
  Slider,
  Switch,
} from '@heroui/react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { JSX } from 'react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { Color } from 'react-aria-components';

import { color as colorToken, sp } from './tokens';
import { parseCssLength, parseFilter, parseShadow } from './utilities';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DECIMAL_DISPLAY_PRECISION = 2;
const PX_PER_INCH = 96;
const MM_PER_INCH = 25.4;
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3,8})$/;
const RGB_REGEX = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/;
const HSL_REGEX = /^hsla?\(\s*(\d+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/;
const MAX_BYTE = 255;
const HUE_MAX = 360;
const PERCENT_100 = 100;
const DEFAULT_PALETTE_COLORS: readonly string[] = [
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#000000',
  '#ffffff',
];

const CSS_LENGTH_UNITS = ['px', 'mm', 'in', '%', 'em', 'rem'] as const;

type CssUnit = (typeof CSS_LENGTH_UNITS)[number];

function isCssUnit(u: string): u is CssUnit {
  return (CSS_LENGTH_UNITS as readonly string[]).includes(u);
}

function toCssUnit(u: string): CssUnit {
  return isCssUnit(u) ? u : 'px';
}

const FILTER_FUNCTIONS = [
  { fn: 'blur', min: 0, max: 100, unit: 'px', defaultValue: 0, step: 1 },
  { fn: 'brightness', min: 0, max: 3, unit: '', defaultValue: 1, step: 0.01 },
  { fn: 'contrast', min: 0, max: 3, unit: '', defaultValue: 1, step: 0.01 },
  { fn: 'grayscale', min: 0, max: 1, unit: '', defaultValue: 0, step: 0.01 },
  { fn: 'hue-rotate', min: 0, max: 360, unit: 'deg', defaultValue: 0, step: 1 },
  { fn: 'invert', min: 0, max: 1, unit: '', defaultValue: 0, step: 0.01 },
  { fn: 'opacity', min: 0, max: 1, unit: '', defaultValue: 1, step: 0.01 },
  { fn: 'saturate', min: 0, max: 3, unit: '', defaultValue: 1, step: 0.01 },
  { fn: 'sepia', min: 0, max: 1, unit: '', defaultValue: 0, step: 0.01 },
] as const;

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

function clampByte(n: number): number {
  return Math.max(0, Math.min(MAX_BYTE, Math.round(n)));
}

function byteToHex(b: number): string {
  return clampByte(b).toString(16).padStart(2, '0');
}

function parseColorToRgba(
  css: string,
): { readonly r: number; readonly g: number; readonly b: number; readonly a: number } | null {
  const trimmed = css.trim().toLowerCase();

  const hexMatch = HEX_COLOR_REGEX.exec(trimmed);

  if (hexMatch) {
    const hex = hexMatch[1] ?? '';

    if (hex.length === 3) {
      const c0 = hex.charAt(0);
      const c1 = hex.charAt(1);
      const c2 = hex.charAt(2);

      return { r: parseInt(c0 + c0, 16), g: parseInt(c1 + c1, 16), b: parseInt(c2 + c2, 16), a: 1 };
    }

    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }

    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / MAX_BYTE,
      };
    }

    return null;
  }

  const rgbMatch = RGB_REGEX.exec(trimmed);

  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
      a: rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1,
    };
  }

  const hslMatch = HSL_REGEX.exec(trimmed);

  if (hslMatch) {
    const h = Number(hslMatch[1]) / HUE_MAX;
    const s = Number(hslMatch[2]) / PERCENT_100;
    const l = Number(hslMatch[3]) / PERCENT_100;
    const a = hslMatch[4] !== undefined ? Number(hslMatch[4]) : 1;

    return { ...hslToRgb(h, s, l), a };
  }

  return null;
}

function hslToRgb(h: number, s: number, l: number): { readonly r: number; readonly g: number; readonly b: number } {
  if (s === 0) {
    const val = Math.round(l * MAX_BYTE);

    return { r: val, g: val, b: val };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * MAX_BYTE),
    g: Math.round(hue2rgb(p, q, h) * MAX_BYTE),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * MAX_BYTE),
  };
}

function hue2rgb(p: number, q: number, rawT: number): number {
  let t = rawT;

  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;

  return p;
}

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const base = `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;

  if (a < 1) {
    return `${base}${byteToHex(Math.round(a * MAX_BYTE))}`;
  }

  return base;
}

function rgbaToRgbString(r: number, g: number, b: number, a: number): string {
  if (a < 1) {
    return `rgba(${String(clampByte(r))}, ${String(clampByte(g))}, ${String(clampByte(b))}, ${String(Number(a.toFixed(DECIMAL_DISPLAY_PRECISION)))})`;
  }

  return `rgb(${String(clampByte(r))}, ${String(clampByte(g))}, ${String(clampByte(b))})`;
}

function rgbToHsl(r: number, g: number, b: number): { readonly h: number; readonly s: number; readonly l: number } {
  const rn = r / MAX_BYTE;
  const gn = g / MAX_BYTE;
  const bn = b / MAX_BYTE;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;

  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return { h, s, l };
}

function rgbaToHslString(r: number, g: number, b: number, a: number): string {
  const { h, s, l } = rgbToHsl(r, g, b);
  const hDeg = Math.round(h * HUE_MAX);
  const sPct = Math.round(s * PERCENT_100);
  const lPct = Math.round(l * PERCENT_100);

  if (a < 1) {
    return `hsla(${String(hDeg)}, ${String(sPct)}%, ${String(lPct)}%, ${String(Number(a.toFixed(DECIMAL_DISPLAY_PRECISION)))})`;
  }

  return `hsl(${String(hDeg)}, ${String(sPct)}%, ${String(lPct)}%)`;
}

type ColorFormat = 'hex' | 'rgb' | 'hsl';

function formatColor(r: number, g: number, b: number, a: number, format: ColorFormat): string {
  switch (format) {
    case 'hex':
      return rgbaToHex(r, g, b, a);
    case 'rgb':
      return rgbaToRgbString(r, g, b, a);
    case 'hsl':
      return rgbaToHslString(r, g, b, a);
  }
}

/**
 * Try to build a react-aria Color from a CSS string. Returns null on failure
 * so callers can fall back to a default.
 */
function tryParseColor(css: string): Color | null {
  try {
    return parseColor(css);
  } catch {
    return null;
  }
}

/**
 * Convert an rgba tuple to a hex string that react-aria's parseColor can always
 * understand, then parse it. Falls back to opaque black.
 */
function toAriaColor(r: number, g: number, b: number, a: number): Color {
  const hex = rgbaToHex(r, g, b, a);

  return tryParseColor(hex) ?? parseColor('#000000');
}

/* ------------------------------------------------------------------ */
/*  Unit conversion                                                    */
/* ------------------------------------------------------------------ */

function convertLength(value: number, fromUnit: CssUnit, toUnit: CssUnit): number {
  if (fromUnit === toUnit) return value;

  // Convert to px first
  let px = value;

  switch (fromUnit) {
    case 'mm':
      px = value * (PX_PER_INCH / MM_PER_INCH);
      break;
    case 'in':
      px = value * PX_PER_INCH;
      break;
    case 'px':
      break;
    default:
      return value; // %, em, rem — no auto-conversion
  }

  // Convert from px to target
  switch (toUnit) {
    case 'mm':
      return px * (MM_PER_INCH / PX_PER_INCH);
    case 'in':
      return px / PX_PER_INCH;
    case 'px':
      return px;
    default:
      return value; // %, em, rem — no auto-conversion
  }
}

/* ================================================================= */
/*  ColorInput                                                        */
/* ================================================================= */

export interface ColorInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}

export function ColorInput({ value, onChange, label }: ColorInputProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [format, setFormat] = useState<ColorFormat>('hex');
  const [palette, setPalette] = useState<readonly string[]>([]);
  const lastValidRef = useRef(value);
  const errorId = useId();

  const parsed = useMemo(() => parseColorToRgba(value), [value]);
  const isTransparent = parsed !== null && parsed.a === 0;

  /** react-aria Color for the area/slider components. */
  const ariaColor = useMemo(
    () => (parsed !== null ? toAriaColor(parsed.r, parsed.g, parsed.b, parsed.a) : parseColor('#000000')),
    [parsed],
  );

  const displayValue = useMemo(() => {
    if (isDrafting) return draft;
    if (parsed === null) return value;

    return formatColor(parsed.r, parsed.g, parsed.b, parsed.a, format);
  }, [isDrafting, draft, parsed, value, format]);

  /** Whether the current draft text is an invalid color string. */
  const draftInvalid = useMemo(() => isDrafting && parseColorToRgba(draft) === null, [isDrafting, draft]);

  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(event.currentTarget.value);
    setIsDrafting(true);
  }, []);

  const handleTextBlur = useCallback(() => {
    if (!isDrafting) return;

    const result = parseColorToRgba(draft);

    if (result !== null) {
      const hex = rgbaToHex(result.r, result.g, result.b, result.a);

      lastValidRef.current = hex;
      onChange(hex);
    }

    // Revert to last valid on invalid
    setIsDrafting(false);
  }, [isDrafting, draft, onChange]);

  const handleTextKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        handleTextBlur();
      }
    },
    [handleTextBlur],
  );

  /** Handle color change from ColorArea or ColorSlider. */
  const handleColorChange = useCallback(
    (color: Color) => {
      const hex = color.toString('hexa');

      lastValidRef.current = hex;
      onChange(hex);
    },
    [onChange],
  );

  const handleSwatchSelect = useCallback(
    (color: Color) => {
      const hex = color.toString('hexa');

      lastValidRef.current = hex;
      onChange(hex);
    },
    [onChange],
  );

  const handleFormatChange = useCallback((key: string | number | null) => {
    if (key === 'hex' || key === 'rgb' || key === 'hsl') {
      setFormat(key);
    }
  }, []);

  const handleAddPalette = useCallback(() => {
    setPalette((prev) => (prev.includes(value) ? prev : [...prev, value]));
  }, [value]);

  const handleRemovePalette = useCallback((c: string) => {
    setPalette((prev) => prev.filter((x) => x !== c));
  }, []);

  const allPaletteColors = useMemo(
    () => [...DEFAULT_PALETTE_COLORS, ...palette.filter((c) => !DEFAULT_PALETTE_COLORS.includes(c))],
    [palette],
  );

  return (
    <div data-testid="color-input" style={{ display: 'flex', gap: sp('sp-02'), alignItems: 'center' }}>
      <Popover>
        <Popover.Trigger>
          <Button
            data-testid="color-swatch"
            data-transparent={isTransparent ? 'true' : 'false'}
            aria-label={`${label} color swatch`}
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              border: `1px solid ${colorToken('border')}`,
              backgroundColor: isTransparent ? 'transparent' : value,
              backgroundImage:
                isTransparent ?
                  'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)'
                : undefined,
              backgroundSize: isTransparent ? '8px 8px' : undefined,
              backgroundPosition: isTransparent ? '0 0, 4px 4px' : undefined,
              padding: 0,
              minWidth: 28,
            }}
          />
        </Popover.Trigger>
        <Popover.Content>
          <Popover.Dialog>
            <div
              data-testid="color-picker-popover"
              style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-03'), padding: sp('sp-03') }}
            >
              <ColorArea
                data-testid="color-area"
                aria-label="Saturation and brightness"
                value={ariaColor}
                onChange={handleColorChange}
                xChannel="saturation"
                yChannel="brightness"
                colorSpace="hsb"
              >
                <ColorArea.Thumb />
              </ColorArea>

              <ColorSlider
                aria-label="Hue"
                channel="hue"
                colorSpace="hsb"
                value={ariaColor}
                onChange={handleColorChange}
              >
                <ColorSlider.Track>
                  <ColorSlider.Thumb />
                </ColorSlider.Track>
              </ColorSlider>

              <ColorSlider aria-label="Alpha" channel="alpha" value={ariaColor} onChange={handleColorChange}>
                <ColorSlider.Track>
                  <ColorSlider.Thumb />
                </ColorSlider.Track>
              </ColorSlider>

              <Select aria-label="Color format" value={format} onChange={handleFormatChange}>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="hex" textValue="HEX">
                      HEX
                    </ListBox.Item>
                    <ListBox.Item id="rgb" textValue="RGB">
                      RGB
                    </ListBox.Item>
                    <ListBox.Item id="hsl" textValue="HSL">
                      HSL
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>

              <div data-testid="palette" style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
                <ColorSwatchPicker aria-label="Color palette" value={ariaColor} onChange={handleSwatchSelect}>
                  {allPaletteColors.map((c) => (
                    <ColorSwatchPicker.Item key={c} color={c}>
                      <ColorSwatchPicker.Swatch />
                    </ColorSwatchPicker.Item>
                  ))}
                </ColorSwatchPicker>

                {palette.length > 0 && (
                  <div style={{ display: 'flex', gap: sp('sp-01'), flexWrap: 'wrap' }}>
                    {palette.map((c) => (
                      <div key={`remove-${c}`} style={{ position: 'relative' }}>
                        <ColorSwatch color={c} aria-label={c} style={{ width: 16, height: 16 }} />
                        <Button
                          aria-label="Remove from palette"
                          onPress={() => {
                            handleRemovePalette(c);
                          }}
                          style={{
                            position: 'absolute',
                            top: -4,
                            right: -4,
                            width: 12,
                            height: 12,
                            minWidth: 12,
                            padding: 0,
                          }}
                        >
                          <X size={8} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Button aria-label="Add to palette" onPress={handleAddPalette}>
                  Add
                </Button>
              </div>
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>

      <Input
        aria-label={`${label} color text`}
        aria-invalid={draftInvalid || undefined}
        aria-describedby={draftInvalid ? errorId : undefined}
        value={displayValue}
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        onKeyDown={handleTextKeyDown}
      />
      {draftInvalid && (
        <span
          id={errorId}
          role="alert"
          style={{
            clip: 'rect(0 0 0 0)',
            clipPath: 'inset(50%)',
            height: 1,
            overflow: 'hidden',
            position: 'absolute',
            whiteSpace: 'nowrap',
            width: 1,
          }}
        >
          Invalid color format
        </span>
      )}
    </div>
  );
}

/* ================================================================= */
/*  NumField                                                           */
/* ================================================================= */

export interface NumFieldProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly label: string;
  readonly step?: number | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}

export function NumField({ value, onChange, label, step = 1, min, max }: NumFieldProps): JSX.Element {
  const [localValue, setLocalValue] = useState(value);
  const [isDirty, setIsDirty] = useState(false);
  const lastValid = useRef(value);

  // Sync external value changes
  if (!isDirty && value !== localValue) {
    setLocalValue(value);
    lastValid.current = value;
  }

  const displayValue = Number(localValue.toFixed(DECIMAL_DISPLAY_PRECISION));

  const clamp = useCallback(
    (n: number): number => {
      let result = n;

      if (min !== undefined) result = Math.max(min, result);
      if (max !== undefined) result = Math.min(max, result);

      return result;
    },
    [min, max],
  );

  const handleChange = useCallback((newVal: number) => {
    if (Number.isNaN(newVal)) {
      setIsDirty(true);

      return;
    }

    setLocalValue(newVal);
    setIsDirty(true);
  }, []);

  const commitValue = useCallback(
    (val: number) => {
      if (Number.isNaN(val)) {
        setLocalValue(lastValid.current);
        setIsDirty(false);

        return;
      }

      const clamped = clamp(val);

      lastValid.current = clamped;
      setLocalValue(clamped);
      setIsDirty(false);
      onChange(clamped);
    },
    [clamp, onChange],
  );

  const handleBlur = useCallback(() => {
    commitValue(localValue);
  }, [commitValue, localValue]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        commitValue(localValue);

        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();

        const newVal = clamp(localValue + step);

        setLocalValue(newVal);
        lastValid.current = newVal;
        setIsDirty(false);
        onChange(newVal);

        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();

        const newVal = clamp(localValue - step);

        setLocalValue(newVal);
        lastValid.current = newVal;
        setIsDirty(false);
        onChange(newVal);
      }
    },
    [commitValue, localValue, step, clamp, onChange],
  );

  return (
    <NumberField
      aria-label={label}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      {...(min !== undefined ? { minValue: min } : {})}
      {...(max !== undefined ? { maxValue: max } : {})}
      step={step}
    >
      <NumberField.Group>
        <NumberField.DecrementButton />
        <NumberField.Input />
        <NumberField.IncrementButton />
      </NumberField.Group>
    </NumberField>
  );
}

/* ================================================================= */
/*  CssLengthInput                                                     */
/* ================================================================= */

export interface CssLengthInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}

export function CssLengthInput({ value, onChange, label }: CssLengthInputProps): JSX.Element {
  const parsed = useMemo(() => parseCssLength(value), [value]);
  const [localNum, setLocalNum] = useState(parsed.value);
  const [unit, setUnit] = useState<CssUnit>(toCssUnit(parsed.unit));

  // Sync external value changes
  const prevValueRef = useRef(value);

  if (value !== prevValueRef.current) {
    prevValueRef.current = value;

    const newParsed = parseCssLength(value);

    setLocalNum(newParsed.value);
    setUnit(toCssUnit(newParsed.unit));
  }

  const handleNumChange = useCallback((newNum: number) => {
    setLocalNum(newNum);
  }, []);

  const handleCommit = useCallback(() => {
    onChange(`${String(localNum)}${unit}`);
  }, [localNum, unit, onChange]);

  const handleNumKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        handleCommit();
      }
    },
    [handleCommit],
  );

  const handleUnitChange = useCallback(
    (key: string | number | null) => {
      if (key === null) return;

      const raw = String(key);

      if (!isCssUnit(raw)) return;

      const newUnit = raw;

      const converted = convertLength(localNum, unit, newUnit);
      const rounded = Number(converted.toFixed(DECIMAL_DISPLAY_PRECISION));

      setUnit(newUnit);
      setLocalNum(rounded);
      onChange(`${String(rounded)}${newUnit}`);
    },
    [localNum, unit, onChange],
  );

  return (
    <div style={{ display: 'flex', gap: sp('sp-02'), alignItems: 'center' }}>
      <NumberField
        aria-label={`${label} value`}
        value={Number(localNum.toFixed(DECIMAL_DISPLAY_PRECISION))}
        onChange={handleNumChange}
        onBlur={handleCommit}
        onKeyDown={handleNumKeyDown}
      >
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <Select aria-label="Unit" value={unit} onChange={handleUnitChange}>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {CSS_LENGTH_UNITS.map((u) => (
              <ListBox.Item key={u} id={u} textValue={u}>
                {u}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}

/* ================================================================= */
/*  TextStrokeInput                                                    */
/* ================================================================= */

export interface TextStrokeInputProps {
  readonly width: number;
  readonly color: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}

export function TextStrokeInput({ width, color, onChange, label }: TextStrokeInputProps): JSX.Element {
  const [localWidth, setLocalWidth] = useState(width);
  const [localColor, setLocalColor] = useState(color);

  const emit = useCallback(
    (w: number, c: string) => {
      onChange(`${String(w)}px ${c}`);
    },
    [onChange],
  );

  const handleWidthChange = useCallback((newWidth: number) => {
    setLocalWidth(newWidth);
  }, []);

  const handleWidthBlur = useCallback(() => {
    emit(localWidth, localColor);
  }, [localWidth, localColor, emit]);

  const handleColorChange = useCallback(
    (newColor: string) => {
      setLocalColor(newColor);
      emit(localWidth, newColor);
    },
    [localWidth, emit],
  );

  return (
    <fieldset aria-label={label} style={{ border: 'none', padding: 0, margin: 0 }}>
      <NumberField
        aria-label="Stroke width"
        value={localWidth}
        onChange={handleWidthChange}
        onBlur={handleWidthBlur}
        minValue={0}
        step={1}
      >
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <ColorInput value={localColor} onChange={handleColorChange} label="Stroke color" />
    </fieldset>
  );
}

/* ================================================================= */
/*  FilterEditor                                                       */
/* ================================================================= */

interface FilterEntry {
  readonly fn: string;
  readonly value: number;
  readonly unit: string;
}

export interface FilterEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}

function buildFilterString(entries: readonly FilterEntry[]): string {
  return entries.map((e) => `${e.fn}(${String(e.value)}${e.unit})`).join(' ');
}

export function FilterEditor({ value, onChange, label }: FilterEditorProps): JSX.Element {
  const [entries, setEntries] = useState<readonly FilterEntry[]>(() => {
    const parsed = parseFilter(value);

    return parsed.map((p) => ({ fn: p.fn, value: p.value, unit: p.unit }));
  });

  const usedFunctions = useMemo(() => new Set(entries.map((e) => e.fn)), [entries]);
  const availableFunctions = useMemo(() => FILTER_FUNCTIONS.filter((f) => !usedFunctions.has(f.fn)), [usedFunctions]);

  const handleAdd = useCallback(
    (fnName: string) => {
      const def = FILTER_FUNCTIONS.find((f) => f.fn === fnName);

      if (def === undefined) return;

      const newEntries = [...entries, { fn: def.fn, value: def.defaultValue, unit: def.unit }];

      setEntries(newEntries);
      onChange(buildFilterString(newEntries));
    },
    [entries, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      const newEntries = entries.filter((_, i) => i !== index);

      setEntries(newEntries);
      onChange(buildFilterString(newEntries));
    },
    [entries, onChange],
  );

  const handleValueChange = useCallback(
    (index: number, newValue: number) => {
      const newEntries = entries.map((e, i) => (i === index ? { ...e, value: newValue } : e));

      setEntries(newEntries);
      onChange(buildFilterString(newEntries));
    },
    [entries, onChange],
  );

  const handleAddSelection = useCallback(
    (key: string | number | null) => {
      if (key !== null && key !== '') {
        handleAdd(String(key));
      }
    },
    [handleAdd],
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;

      const newEntries = [...entries];
      const item = newEntries[index];
      const prev = newEntries[index - 1];

      if (item === undefined || prev === undefined) return;

      newEntries[index - 1] = item;
      newEntries[index] = prev;
      setEntries(newEntries);
      onChange(buildFilterString(newEntries));
    },
    [entries, onChange],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= entries.length - 1) return;

      const newEntries = [...entries];
      const item = newEntries[index];
      const next = newEntries[index + 1];

      if (item === undefined || next === undefined) return;

      newEntries[index + 1] = item;
      newEntries[index] = next;
      setEntries(newEntries);
      onChange(buildFilterString(newEntries));
    },
    [entries, onChange],
  );

  return (
    <fieldset aria-label={label} style={{ border: 'none', padding: 0, margin: 0 }}>
      {entries.map((entry, index) => {
        const def = FILTER_FUNCTIONS.find((f) => f.fn === entry.fn);

        return (
          <div
            key={entry.fn}
            data-testid="filter-row"
            style={{ display: 'flex', alignItems: 'center', gap: sp('sp-02') }}
          >
            <span>{entry.fn}</span>
            <Slider
              aria-label={`${entry.fn} value`}
              minValue={def?.min ?? 0}
              maxValue={def?.max ?? 100}
              step={def?.step ?? 1}
              value={entry.value}
              onChange={(newVal: number | readonly number[]) => {
                handleValueChange(index, typeof newVal === 'number' ? newVal : Number(newVal));
              }}
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            <span>{entry.value}</span>
            <Button
              aria-label={`Move ${entry.fn} up`}
              isDisabled={index === 0}
              onPress={() => {
                handleMoveUp(index);
              }}
            >
              <ChevronUp size={12} />
            </Button>
            <Button
              aria-label={`Move ${entry.fn} down`}
              isDisabled={index === entries.length - 1}
              onPress={() => {
                handleMoveDown(index);
              }}
            >
              <ChevronDown size={12} />
            </Button>
            <Button
              aria-label={`Remove ${entry.fn}`}
              onPress={() => {
                handleRemove(index);
              }}
            >
              <X size={12} />
            </Button>
          </div>
        );
      })}
      {availableFunctions.length > 0 && (
        <Select aria-label="Add filter" value={null} onChange={handleAddSelection}>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {availableFunctions.map((f) => (
                <ListBox.Item key={f.fn} id={f.fn} textValue={f.fn}>
                  {f.fn}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      )}
    </fieldset>
  );
}

/* ================================================================= */
/*  ShadowEditor                                                       */
/* ================================================================= */

interface ShadowLayer {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly spread: number;
  readonly color: string;
  readonly inset: boolean;
}

export interface ShadowEditorProps {
  readonly value: string;
  readonly mode: 'box' | 'text';
  readonly onChange: (value: string) => void;
  readonly label: string;
}

const DEFAULT_SHADOW_LAYER: Readonly<ShadowLayer> = {
  offsetX: 0,
  offsetY: 0,
  blur: 4,
  spread: 0,
  color: '#000000',
  inset: false,
};

function parseShadowLayers(value: string): readonly ShadowLayer[] {
  if (value === 'none' || value.trim() === '') return [];

  const parts = value.split(',').map((s) => s.trim());

  return parts.map((part) => {
    const parsed = parseShadow(part);

    return {
      offsetX: parsed.offsetX,
      offsetY: parsed.offsetY,
      blur: parsed.blur,
      spread: parsed.spread,
      color: parsed.color,
      inset: parsed.inset,
    };
  });
}

function buildShadowString(layers: readonly ShadowLayer[], mode: 'box' | 'text'): string {
  if (layers.length === 0) return 'none';

  return layers
    .map((l) => {
      const parts = [
        ...(l.inset && mode === 'box' ? ['inset'] : []),
        `${String(l.offsetX)}px`,
        `${String(l.offsetY)}px`,
        `${String(l.blur)}px`,
        ...(mode === 'box' ? [`${String(l.spread)}px`] : []),
        l.color,
      ];

      return parts.join(' ');
    })
    .join(', ');
}

export function ShadowEditor({ value, mode, onChange, label }: ShadowEditorProps): JSX.Element {
  const [layers, setLayers] = useState<readonly ShadowLayer[]>(() => parseShadowLayers(value));
  const [enabled, setEnabled] = useState(value !== 'none' && value.trim() !== '');
  const stashedRef = useRef(layers);

  const handleToggle = useCallback(() => {
    if (enabled) {
      stashedRef.current = layers;
      setEnabled(false);
      onChange('none');
    } else {
      const restored = stashedRef.current.length > 0 ? stashedRef.current : [DEFAULT_SHADOW_LAYER];

      setLayers(restored);
      setEnabled(true);
      onChange(buildShadowString(restored, mode));
    }
  }, [enabled, layers, mode, onChange]);

  const handleAddLayer = useCallback(() => {
    const newLayers = [...layers, DEFAULT_SHADOW_LAYER];

    setLayers(newLayers);
    onChange(buildShadowString(newLayers, mode));
  }, [layers, mode, onChange]);

  const handleRemoveLayer = useCallback(
    (index: number) => {
      const newLayers = layers.filter((_, i) => i !== index);

      setLayers(newLayers);
      onChange(buildShadowString(newLayers, mode));
    },
    [layers, mode, onChange],
  );

  const handleUpdateLayer = useCallback(
    (index: number, updates: Partial<ShadowLayer>) => {
      const newLayers = layers.map((l, i) => (i === index ? { ...l, ...updates } : l));

      setLayers(newLayers);
      onChange(buildShadowString(newLayers, mode));
    },
    [layers, mode, onChange],
  );

  const handleMoveLayerUp = useCallback(
    (index: number) => {
      if (index === 0) return;

      const newLayers = [...layers];
      const item = newLayers[index];
      const prev = newLayers[index - 1];

      if (item === undefined || prev === undefined) return;

      newLayers[index - 1] = item;
      newLayers[index] = prev;
      setLayers(newLayers);
      onChange(buildShadowString(newLayers, mode));
    },
    [layers, mode, onChange],
  );

  const handleMoveLayerDown = useCallback(
    (index: number) => {
      if (index >= layers.length - 1) return;

      const newLayers = [...layers];
      const item = newLayers[index];
      const next = newLayers[index + 1];

      if (item === undefined || next === undefined) return;

      newLayers[index + 1] = item;
      newLayers[index] = next;
      setLayers(newLayers);
      onChange(buildShadowString(newLayers, mode));
    },
    [layers, mode, onChange],
  );

  return (
    <fieldset aria-label={label} style={{ border: 'none', padding: 0, margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: sp('sp-03') }}>
        <span>{label}</span>
        <Switch
          isSelected={enabled}
          onChange={() => {
            handleToggle();
          }}
          aria-label="Enable shadow"
        />
      </div>
      {enabled &&
        layers.map((layer, index) => (
          <div
            key={index}
            data-testid="shadow-layer"
            style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}
          >
            <NumberField
              aria-label="Offset X"
              value={layer.offsetX}
              onChange={(val) => {
                handleUpdateLayer(index, { offsetX: typeof val === 'number' ? val : Number(val) });
              }}
            >
              <NumberField.Group>
                <NumberField.Input />
              </NumberField.Group>
            </NumberField>
            <NumberField
              aria-label="Offset Y"
              value={layer.offsetY}
              onChange={(val) => {
                handleUpdateLayer(index, { offsetY: typeof val === 'number' ? val : Number(val) });
              }}
            >
              <NumberField.Group>
                <NumberField.Input />
              </NumberField.Group>
            </NumberField>
            <Slider
              aria-label="Blur"
              minValue={0}
              maxValue={100}
              value={layer.blur}
              onChange={(val: number | readonly number[]) => {
                handleUpdateLayer(index, { blur: typeof val === 'number' ? val : Number(val) });
              }}
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            {mode === 'box' && (
              <Slider
                aria-label="Spread"
                minValue={-50}
                maxValue={50}
                value={layer.spread}
                onChange={(val: number | readonly number[]) => {
                  handleUpdateLayer(index, { spread: typeof val === 'number' ? val : Number(val) });
                }}
              >
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
            )}
            <ColorInput
              value={layer.color}
              onChange={(c) => {
                handleUpdateLayer(index, { color: c });
              }}
              label={`Layer ${String(index + 1)} color`}
            />
            {mode === 'box' && (
              <Switch
                isSelected={layer.inset}
                onChange={() => {
                  handleUpdateLayer(index, { inset: !layer.inset });
                }}
                aria-label="Inset"
              >
                Inset
              </Switch>
            )}
            <Button
              aria-label={`Move layer ${String(index + 1)} up`}
              isDisabled={index === 0}
              onPress={() => {
                handleMoveLayerUp(index);
              }}
            >
              <ChevronUp size={12} />
            </Button>
            <Button
              aria-label={`Move layer ${String(index + 1)} down`}
              isDisabled={index === layers.length - 1}
              onPress={() => {
                handleMoveLayerDown(index);
              }}
            >
              <ChevronDown size={12} />
            </Button>
            <Button
              aria-label={`Remove layer ${String(index + 1)}`}
              onPress={() => {
                handleRemoveLayer(index);
              }}
            >
              <X size={12} />
            </Button>
          </div>
        ))}
      {enabled && (
        <Button aria-label="Add shadow layer" onPress={handleAddLayer}>
          <Plus size={12} /> Add layer
        </Button>
      )}
    </fieldset>
  );
}
