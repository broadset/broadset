import {
  Button,
  ColorArea,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker,
  Input,
  ListBox,
  parseColor,
  Popover,
  Select,
} from '@heroui/react';
import { X } from 'lucide-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Color } from 'react-aria-components';

import { color as colorToken, sp } from '../tokens';

const DECIMAL_DISPLAY_PRECISION = 2;
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

type ColorFormat = 'hex' | 'rgb' | 'hsl';

function clampByte(n: number): number {
  return Math.max(0, Math.min(MAX_BYTE, Math.round(n)));
}

function byteToHex(b: number): string {
  return clampByte(b).toString(16).padStart(2, '0');
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

function tryParseColor(css: string): Color | null {
  try {
    return parseColor(css);
  } catch {
    return null;
  }
}

function toAriaColor(r: number, g: number, b: number, a: number): Color {
  const hex = rgbaToHex(r, g, b, a);

  return tryParseColor(hex) ?? parseColor('#000000');
}

export interface ColorInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  /** When true, renders a 28px-tall row that aligns with compact NumField in dense grids. */
  readonly compact?: boolean | undefined;
  /**
   * When `false`, the picker emits only solid colors (6-digit hex) and strips any
   * alpha channel on input — use this for fields that have a separate opacity
   * control (e.g. stroke/fill on path elements) so picking a color does not
   * silently override the opacity slider.
   */
  readonly allowAlpha?: boolean | undefined;
}

export function ColorInput({ value, onChange, label, compact, allowAlpha = true }: ColorInputProps): JSX.Element {
  const isCompact = compact === true;
  const swatchSize = isCompact ? 22 : 28;
  const [draft, setDraft] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [format, setFormat] = useState<ColorFormat>('hex');
  const [palette, setPalette] = useState<readonly string[]>([]);
  const lastValidRef = useRef(value);
  const errorId = useId();

  // Discard any in-progress draft when the incoming `value` prop changes to
  // something the user didn't just commit — e.g. selection switch, undo/redo,
  // or remote collaboration apply. Without this, a mid-edit draft on element
  // A would silently carry over onto element B and could commit the wrong
  // color on blur.
  useEffect(() => {
    if (value === lastValidRef.current) {
      return;
    }

    lastValidRef.current = value;
    setIsDrafting(false);
    setDraft('');
  }, [value]);

  const parsed = useMemo(() => parseColorToRgba(value), [value]);
  const isEmpty = value.trim() === '';
  const isTransparent = isEmpty || (parsed !== null && parsed.a === 0);

  const ariaColor = useMemo(
    () => (parsed !== null ? toAriaColor(parsed.r, parsed.g, parsed.b, parsed.a) : parseColor('#000000')),
    [parsed],
  );

  const displayValue = useMemo(() => {
    if (isDrafting) return draft;
    if (parsed === null) return value;

    return formatColor(parsed.r, parsed.g, parsed.b, parsed.a, format);
  }, [isDrafting, draft, parsed, value, format]);

  const draftInvalid = useMemo(() => isDrafting && parseColorToRgba(draft) === null, [isDrafting, draft]);

  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(event.currentTarget.value);
    setIsDrafting(true);
  }, []);

  const handleTextBlur = useCallback(() => {
    if (!isDrafting) return;

    const result = parseColorToRgba(draft);

    if (result !== null) {
      const alpha = allowAlpha ? result.a : 1;
      const hex = rgbaToHex(result.r, result.g, result.b, alpha);

      lastValidRef.current = hex;
      onChange(hex);
    }

    setIsDrafting(false);
  }, [isDrafting, draft, onChange, allowAlpha]);

  const handleTextKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        handleTextBlur();
      }
    },
    [handleTextBlur],
  );

  const handleColorChange = useCallback(
    (color: Color) => {
      const hex = allowAlpha ? color.toString('hexa') : color.toString('hex');

      lastValidRef.current = hex;
      onChange(hex);
    },
    [onChange, allowAlpha],
  );

  const handleSwatchSelect = useCallback(
    (color: Color) => {
      const hex = allowAlpha ? color.toString('hexa') : color.toString('hex');

      lastValidRef.current = hex;
      onChange(hex);
    },
    [onChange, allowAlpha],
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
    <div
      data-testid="color-input"
      style={{
        alignItems: 'center',
        display: 'flex',
        gap: sp('sp-02'),
        minWidth: 0,
        width: '100%',
      }}
    >
      <Popover>
        {/*
          HeroUI's `Popover.Trigger` wraps its `children` in
          `<div role="button">` inside React Aria's `<Pressable>`. The
          div has no native focusability and does not forward
          `tabIndex={0}`, which makes `<Pressable>` log "child must be
          focusable" warnings on every test render. Forwarding
          `tabIndex={0}` through the trigger props makes the inner
          `<div role="button">` focusable and silences the noise. Closes
          the 2026-04-28 audit follow-up "Clear UI/a11y warning noise".
        */}
        <Popover.Trigger tabIndex={0}>
          <Button
            data-testid="color-swatch"
            data-transparent={isTransparent ? 'true' : 'false'}
            aria-label={`${label} color swatch`}
            style={{
              alignSelf: 'center',
              width: swatchSize,
              height: swatchSize,
              borderRadius: '50%',
              border: `1px solid ${colorToken('border')}`,
              backgroundColor: isTransparent ? 'transparent' : value,
              backgroundImage:
                isTransparent ?
                  'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)'
                : undefined,
              backgroundSize: isTransparent ? '8px 8px' : undefined,
              backgroundPosition: isTransparent ? '0 0, 4px 4px' : undefined,
              padding: 0,
              minWidth: swatchSize,
              flexShrink: 0,
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

              {allowAlpha ?
                <ColorSlider aria-label="Alpha" channel="alpha" value={ariaColor} onChange={handleColorChange}>
                  <ColorSlider.Track>
                    <ColorSlider.Thumb />
                  </ColorSlider.Track>
                </ColorSlider>
              : null}

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
        {...(isCompact ?
          {
            style: {
              fontSize: '0.75rem',
              height: '1.75rem',
              minWidth: 0,
              padding: '0 0.5rem',
            },
          }
        : {})}
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
