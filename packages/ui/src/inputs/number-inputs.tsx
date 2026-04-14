import { ListBox, NumberField, Select } from '@heroui/react';
import type { JSX } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { sp } from '../tokens';
import { parseCssLength } from '../utilities';

const DECIMAL_DISPLAY_PRECISION = 2;
const PX_PER_INCH = 96;
const MM_PER_INCH = 25.4;
const CSS_LENGTH_UNITS = ['px', 'mm', 'in', '%', 'em', 'rem'] as const;

type CssUnit = (typeof CSS_LENGTH_UNITS)[number];

function isCssUnit(u: string): u is CssUnit {
  return (CSS_LENGTH_UNITS as readonly string[]).includes(u);
}

function toCssUnit(u: string): CssUnit {
  return isCssUnit(u) ? u : 'px';
}

function convertLength(value: number, fromUnit: CssUnit, toUnit: CssUnit): number {
  if (fromUnit === toUnit) return value;

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
      return value;
  }

  switch (toUnit) {
    case 'mm':
      return px * (MM_PER_INCH / PX_PER_INCH);
    case 'in':
      return px / PX_PER_INCH;
    case 'px':
      return px;
    default:
      return value;
  }
}

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

export function CssLengthInput({ value, onChange, label }: CssLengthInputProps): JSX.Element {
  const parsed = useMemo(() => parseCssLength(value), [value]);
  const [localNum, setLocalNum] = useState(parsed.value);
  const [unit, setUnit] = useState<CssUnit>(toCssUnit(parsed.unit));
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
