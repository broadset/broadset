import { ListBox, NumberField, Select } from '@heroui/react';
import type { FocusEvent, JSX, KeyboardEvent } from 'react';
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
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
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

  const stringValue = String(rawValue).replace(/,/g, '').trim();
  const parsed = Number(stringValue);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return evaluateExpression(stringValue);
}

export interface NumFieldProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly label: string;
  readonly onCommit?: ((value: number) => void) | undefined;
  readonly step?: number | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  /** When true, renders without inc/dec buttons and with tighter padding. Designed for dense grids. */
  readonly compact?: boolean | undefined;
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
  isDisabled,
}: NumFieldProps): JSX.Element {
  const [localValue, setLocalValue] = useState(value);
  const [isDirty, setIsDirty] = useState(false);
  const lastValid = useRef(value);
  const skipNextBlurCommit = useRef(false);

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

  const handleBlur = useCallback(
    (event: FocusEvent) => {
      const emitCommit = !skipNextBlurCommit.current;
      const keySource = event.currentTarget as { readonly value?: unknown };
      const parsedDraft = parseRawNumber(keySource.value);

      skipNextBlurCommit.current = false;
      commitValue(parsedDraft ?? localValue, { emitCommit });
    },
    [commitValue, localValue],
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

  if (isCompact) {
    return (
      <input
        type="text"
        inputMode="decimal"
        role="textbox"
        aria-label={label}
        value={String(displayValue)}
        disabled={isDisabled === true}
        onChange={(event) => {
          const parsed = Number(event.currentTarget.value);

          if (Number.isFinite(parsed)) {
            handleChange(parsed);
          } else {
            // still store as dirty; commit will re-parse expression later
            handleChange(Number.NaN);
          }
        }}
        onBlur={(event) => {
          const parsedDraft = parseRawNumber(event.currentTarget.value);
          const emitCommit = !skipNextBlurCommit.current;

          skipNextBlurCommit.current = false;
          commitValue(parsedDraft ?? lastValid.current, { emitCommit });
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            const parsedDraft = parseRawNumber(event.currentTarget.value);

            commitValue(parsedDraft ?? lastValid.current);
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

            commitValue(lastValid.current + direction * step * multiplier);
            skipNextBlurCommit.current = true;
          }
        }}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          flex: 1,
          fontFamily: 'inherit',
          fontSize: '0.8125rem',
          height: '100%',
          minWidth: 0,
          outline: 'none',
          padding: '0 0.5rem',
          textAlign: 'right',
          width: '100%',
        }}
      />
    );
  }

  return (
    <NumberField
      aria-label={label}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      {...(min !== undefined ? { minValue: min } : {})}
      {...(max !== undefined ? { maxValue: max } : {})}
      {...(isDisabled === true ? { isDisabled: true } : {})}
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

        return;
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
