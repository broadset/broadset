import { ListBox, NumberField, Select } from '@heroui/react';
import type { ChangeEvent, FocusEvent, JSX, KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { sp } from '../tokens';
import { parseCssLength } from '../utilities';
import { convertLength, CSS_LENGTH_UNITS, type CssUnit, isCssUnit, toCssUnit } from './css-length';

const DECIMAL_DISPLAY_PRECISION = 2;
const UNITLESS_MARKER = '—' as const;

type DisplayCssUnit = CssUnit | typeof UNITLESS_MARKER;

const EXPRESSION_RE = /^[\d+\-*/.() \t]+$/;

/** Evaluate arithmetic expression like "200+50" or "(100+20)*2". Returns null for anything unsafe or unparseable. */
function evaluateExpression(raw: string): number | null {
  const trimmed = raw.trim();

  if (trimmed === '' || !EXPRESSION_RE.test(trimmed) || /[+\-*/]{2,}/.test(trimmed)) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, sonarjs/code-eval -- `trimmed` has already been regex-gated to numeric expressions with single operators; evaluator is confined to returning a number
    const evaluator = new Function(`"use strict"; return (${trimmed});`) as () => unknown;
    const result: unknown = evaluator();

    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function parseRawNumber(rawValue: unknown): number | null {
  if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
    return null;
  }

  // Treat comma as the decimal separator (European/locale input) rather than a
  // thousands separator. Design-tool inputs are small numbers (0–10k) where
  // thousands grouping is rare, but decimals like `100,1` are typed regularly.
  // Previous behavior stripped commas entirely, so `100,1` became `1001`.
  const stringValue = String(rawValue).replace(/,/g, '.').trim();
  const parsed = Number(stringValue);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return evaluateExpression(stringValue);
}

const COMPACT_BUTTON_STYLE = {
  borderRadius: 0,
  height: '100%',
  minWidth: 0,
  padding: 0,
  width: '1.25rem',
} as const;

const EMBEDDED_GROUP_STYLE = {
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  boxShadow: 'none',
  gridTemplateColumns: 'minmax(0, 1fr)',
  height: '100%',
  minWidth: 0,
} as const;

const COMPACT_GROUP_STYLE = {
  gridTemplateColumns: '1.25rem 1fr 1.25rem',
  height: '1.75rem',
  minWidth: 0,
} as const;

const EMBEDDED_INPUT_STYLE = {
  background: 'transparent',
  fontSize: '0.8125rem',
  fontVariantNumeric: 'tabular-nums',
  height: '100%',
  minWidth: 0,
  padding: '0 0.375rem',
  textAlign: 'right' as const,
  width: '100%',
};

const COMPACT_INPUT_STYLE = {
  background: 'transparent',
  fontSize: '0.8125rem',
  fontVariantNumeric: 'tabular-nums',
  height: '100%',
  padding: '0 0.25rem',
  textAlign: 'center' as const,
};

function pickGroupStyle(isEmbedded: boolean, isCompact: boolean): { readonly style?: Record<string, unknown> } {
  if (isEmbedded) return { style: EMBEDDED_GROUP_STYLE };
  if (isCompact) return { style: COMPACT_GROUP_STYLE };

  return {};
}

function pickInputStyle(isEmbedded: boolean, isCompact: boolean): { readonly style?: Record<string, unknown> } {
  if (isEmbedded) return { style: EMBEDDED_INPUT_STYLE };
  if (isCompact) return { style: COMPACT_INPUT_STYLE };

  return {};
}

export interface NumFieldProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly label: string;
  readonly onCommit?: ((value: number) => void) | undefined;
  readonly step?: number | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  /** Dense grid mode: 28px tall, tight padding. Still renders HeroUI chrome (border + bg). */
  readonly compact?: boolean | undefined;
  /** Strips the HeroUI NumberField frame (border, background, radius, shadow, inc/dec buttons) so a parent cell can provide the visible frame. Only meaningful when `compact` is also true. */
  readonly embedded?: boolean | undefined;
  readonly isDisabled?: boolean | undefined;
}

export function NumField({
  value,
  onChange,
  label,
  onCommit,
  step = 1,
  min,
  max,
  compact,
  embedded,
  isDisabled,
}: NumFieldProps): JSX.Element {
  const [localValue, setLocalValue] = useState(value);
  const [isDirty, setIsDirty] = useState(false);
  const lastValid = useRef(value);
  const skipNextBlurCommit = useRef(false);
  // Tracks the most recent raw text the user typed into the inner input so the
  // blur/enter handlers can parse it with locale-aware rules (decimal commas,
  // arithmetic expressions). Without this, a controlled `value` prop snaps the
  // DOM input back to the committed value before blur ever reads it.
  const draftTextRef = useRef<string | null>(null);

  if (!isDirty && value !== localValue) {
    setLocalValue(value);
  }

  useEffect(() => {
    if (!isDirty) {
      lastValid.current = value;
    }
  }, [isDirty, value]);

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
    skipNextBlurCommit.current = false;

    if (Number.isNaN(newVal)) {
      setIsDirty(true);

      return;
    }

    setLocalValue(newVal);
    setIsDirty(true);
  }, []);

  const commitValue = useCallback(
    (val: number, options?: { readonly emitCommit?: boolean }) => {
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

      if (options?.emitCommit ?? true) {
        onCommit?.(clamped);
      }
    },
    [clamp, onChange, onCommit],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        const keySource = event.currentTarget as { readonly value?: unknown };
        const parsedDraft = parseRawNumber(keySource.value);

        commitValue(parsedDraft ?? localValue);
        skipNextBlurCommit.current = true;

        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();

        const direction = event.key === 'ArrowUp' ? 1 : -1;
        const multiplier =
          event.shiftKey ? 10
          : event.altKey ? 0.1
          : 1;

        commitValue(localValue + direction * step * multiplier);
        skipNextBlurCommit.current = true;
      }
    },
    [commitValue, localValue, step],
  );

  const isCompact = compact === true;
  const isEmbedded = isCompact && embedded === true;

  // HeroUI's NumberField root element has no `.value`, and the inner controlled
  // input snaps back to the committed value on re-render. Capture every raw
  // keystroke via onInput into a ref, then re-parse that draft on blur/enter
  // with locale-aware rules (decimal commas, arithmetic expressions).
  const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    draftTextRef.current = event.currentTarget.value;
  }, []);

  const handleInputBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      const emitCommit = !skipNextBlurCommit.current;
      const rawDraft = draftTextRef.current ?? event.currentTarget.value;
      const parsedDraft = parseRawNumber(rawDraft);

      skipNextBlurCommit.current = false;
      draftTextRef.current = null;
      commitValue(parsedDraft ?? localValue, { emitCommit });
    },
    [commitValue, localValue],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        const rawDraft = draftTextRef.current ?? event.currentTarget.value;
        const parsedDraft = parseRawNumber(rawDraft);

        draftTextRef.current = null;
        commitValue(parsedDraft ?? localValue);
        skipNextBlurCommit.current = true;

        return;
      }

      handleKeyDown(event as KeyboardEvent);
    },
    [commitValue, handleKeyDown, localValue],
  );

  return (
    <NumberField
      aria-label={label}
      value={displayValue}
      onChange={handleChange}
      {...(min !== undefined ? { minValue: min } : {})}
      {...(max !== undefined ? { maxValue: max } : {})}
      {...(isDisabled === true ? { isDisabled: true } : {})}
      step={step}
      data-compact={isCompact ? 'true' : undefined}
      data-embedded={isEmbedded ? 'true' : undefined}
    >
      <NumberField.Group {...pickGroupStyle(isEmbedded, isCompact)}>
        {isEmbedded ? null : (
          <NumberField.DecrementButton
            {...(isCompact ? { 'aria-label': `Decrement ${label}`, style: COMPACT_BUTTON_STYLE } : {})}
          />
        )}
        <NumberField.Input
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          {...pickInputStyle(isEmbedded, isCompact)}
        />
        {isEmbedded ? null : (
          <NumberField.IncrementButton
            {...(isCompact ? { 'aria-label': `Increment ${label}`, style: COMPACT_BUTTON_STYLE } : {})}
          />
        )}
      </NumberField.Group>
    </NumberField>
  );
}

export interface CssLengthInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}

function parseDisplayUnit(rawValue: string, parsedUnit: string): DisplayCssUnit {
  const trimmed = rawValue.trim();

  if (trimmed === '') {
    return UNITLESS_MARKER;
  }

  const explicitUnitMatch = /[a-z%]+$/i.exec(trimmed);

  if (explicitUnitMatch === null) {
    return UNITLESS_MARKER;
  }

  const explicitUnit = explicitUnitMatch[0].toLowerCase();

  return isCssUnit(explicitUnit) ? explicitUnit : toCssUnit(parsedUnit);
}

function formatCssLength(value: number, unit: DisplayCssUnit): string {
  return unit === UNITLESS_MARKER ? String(value) : `${String(value)}${unit}`;
}

export function CssLengthInput({ value, onChange, label }: CssLengthInputProps): JSX.Element {
  const parsed = useMemo(() => parseCssLength(value), [value]);
  const [localNum, setLocalNum] = useState(parsed.value);
  const [unit, setUnit] = useState<DisplayCssUnit>(parseDisplayUnit(value, parsed.unit));

  useEffect(() => {
    const nextParsed = parseCssLength(value);

    setLocalNum(nextParsed.value);
    setUnit(parseDisplayUnit(value, nextParsed.unit));
  }, [value]);

  const handleNumChange = useCallback((newNum: number) => {
    setLocalNum(newNum);
  }, []);

  const handleCommit = useCallback(() => {
    onChange(formatCssLength(localNum, unit));
  }, [localNum, unit, onChange]);

  const handleNumKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        const keySource = event.currentTarget as { readonly value?: unknown };
        const parsedDraft = parseRawNumber(keySource.value);

        if (parsedDraft === null) {
          handleCommit();

          return;
        }

        setLocalNum(parsedDraft);
        onChange(formatCssLength(parsedDraft, unit));
      }
    },
    [handleCommit, onChange, unit],
  );

  const handleUnitChange = useCallback(
    (key: unknown) => {
      if (key === null) return;

      let raw = '';

      if (typeof key === 'string' || typeof key === 'number') {
        raw = String(key);
      } else if (typeof key === 'object' && 'target' in key) {
        const eventTarget = (key as { readonly target?: { readonly value?: unknown } }).target;

        if (typeof eventTarget?.value === 'string' || typeof eventTarget?.value === 'number') {
          raw = String(eventTarget.value);
        }
      }

      if (raw === '') return;

      if (raw === UNITLESS_MARKER) {
        setUnit(UNITLESS_MARKER);
        onChange(formatCssLength(localNum, UNITLESS_MARKER));

        return;
      }

      if (!isCssUnit(raw)) return;

      const newUnit = raw;
      const converted = unit === UNITLESS_MARKER ? localNum : convertLength(localNum, unit, newUnit);
      const rounded = Number(converted.toFixed(DECIMAL_DISPLAY_PRECISION));

      setUnit(newUnit);
      setLocalNum(rounded);
      onChange(formatCssLength(rounded, newUnit));
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
            <ListBox.Item key={UNITLESS_MARKER} id={UNITLESS_MARKER} textValue={UNITLESS_MARKER}>
              {UNITLESS_MARKER}
            </ListBox.Item>
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
