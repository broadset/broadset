import { ListBox, NumberField, Select } from '@heroui/react';
import type { JSX } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { sp } from '../tokens';
import { parseCssLength } from '../utilities';
import { convertLength, CSS_LENGTH_UNITS, type CssUnit, isCssUnit, toCssUnit } from './css-length';

const DECIMAL_DISPLAY_PRECISION = 2;
const UNITLESS_MARKER = '—' as const;

type DisplayCssUnit = CssUnit | typeof UNITLESS_MARKER;

export interface NumFieldProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly label: string;
  readonly onCommit?: ((value: number) => void) | undefined;
  readonly step?: number | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}

export function NumField({ value, onChange, label, onCommit, step = 1, min, max }: NumFieldProps): JSX.Element {
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

  const handleBlur = useCallback(() => {
    const emitCommit = !skipNextBlurCommit.current;

    skipNextBlurCommit.current = false;
    commitValue(localValue, { emitCommit });
  }, [commitValue, localValue]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        commitValue(localValue);
        skipNextBlurCommit.current = true;

        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        commitValue(localValue + step);
        skipNextBlurCommit.current = true;

        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        commitValue(localValue - step);
        skipNextBlurCommit.current = true;
      }
    },
    [commitValue, localValue, step],
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
  const prevValueRef = useRef(value);

  if (value !== prevValueRef.current) {
    prevValueRef.current = value;

    const newParsed = parseCssLength(value);

    setLocalNum(newParsed.value);
    setUnit(parseDisplayUnit(value, newParsed.unit));
  }

  const handleNumChange = useCallback((newNum: number) => {
    setLocalNum(newNum);
  }, []);

  const handleCommit = useCallback(() => {
    onChange(formatCssLength(localNum, unit));
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
