import { Button, ListBox, Select, Slider } from '@heroui/react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';

import { sp } from '../tokens';
import { parseFilter } from '../utilities';

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

interface FilterEntry {
  readonly fn: string;
  readonly value: number;
  readonly unit: string;
}

function buildFilterString(entries: readonly FilterEntry[]): string {
  return entries.map((entry) => `${entry.fn}(${String(entry.value)}${entry.unit})`).join(' ');
}

export interface FilterEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}

export function FilterEditor({ value, onChange, label }: FilterEditorProps): JSX.Element {
  const [entries, setEntries] = useState<readonly FilterEntry[]>(() => {
    const parsed = parseFilter(value);

    return parsed.map((item) => ({ fn: item.fn, value: item.value, unit: item.unit }));
  });
  const usedFunctions = useMemo(() => new Set(entries.map((entry) => entry.fn)), [entries]);
  const availableFunctions = useMemo(
    () => FILTER_FUNCTIONS.filter((filterFunction) => !usedFunctions.has(filterFunction.fn)),
    [usedFunctions],
  );

  const handleAdd = useCallback(
    (fnName: string): void => {
      const definition = FILTER_FUNCTIONS.find((filterFunction) => filterFunction.fn === fnName);

      if (definition === undefined) {
        return;
      }

      const nextEntries = [...entries, { fn: definition.fn, value: definition.defaultValue, unit: definition.unit }];

      setEntries(nextEntries);
      onChange(buildFilterString(nextEntries));
    },
    [entries, onChange],
  );

  const handleValueChange = useCallback(
    (index: number, nextValue: number): void => {
      const nextEntries = entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, value: nextValue } : entry,
      );

      setEntries(nextEntries);
      onChange(buildFilterString(nextEntries));
    },
    [entries, onChange],
  );

  const handleRemove = useCallback(
    (index: number): void => {
      const nextEntries = entries.filter((_entry, entryIndex) => entryIndex !== index);

      setEntries(nextEntries);
      onChange(buildFilterString(nextEntries));
    },
    [entries, onChange],
  );

  const handleMoveUp = useCallback(
    (index: number): void => {
      if (index === 0) {
        return;
      }

      const nextEntries = [...entries];
      const item = nextEntries[index];
      const previous = nextEntries[index - 1];

      if (item === undefined || previous === undefined) {
        return;
      }

      nextEntries[index - 1] = item;
      nextEntries[index] = previous;
      setEntries(nextEntries);
      onChange(buildFilterString(nextEntries));
    },
    [entries, onChange],
  );

  const handleMoveDown = useCallback(
    (index: number): void => {
      if (index >= entries.length - 1) {
        return;
      }

      const nextEntries = [...entries];
      const item = nextEntries[index];
      const following = nextEntries[index + 1];

      if (item === undefined || following === undefined) {
        return;
      }

      nextEntries[index + 1] = item;
      nextEntries[index] = following;
      setEntries(nextEntries);
      onChange(buildFilterString(nextEntries));
    },
    [entries, onChange],
  );

  return (
    <fieldset aria-label={label} style={{ border: 'none', margin: 0, padding: 0 }}>
      {entries.map((entry, index) => {
        const definition = FILTER_FUNCTIONS.find((filterFunction) => filterFunction.fn === entry.fn);

        return (
          <div
            key={entry.fn}
            data-testid="filter-row"
            style={{ alignItems: 'center', display: 'flex', gap: sp('sp-02') }}
          >
            <span>{entry.fn}</span>
            <Slider
              aria-label={`${entry.fn} value`}
              minValue={definition?.min ?? 0}
              maxValue={definition?.max ?? 100}
              step={definition?.step ?? 1}
              value={entry.value}
              onChange={(sliderValue: number | readonly number[]) => {
                handleValueChange(index, typeof sliderValue === 'number' ? sliderValue : Number(sliderValue));
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

      {availableFunctions.length > 0 ?
        <Select
          aria-label="Add filter"
          value={null}
          onChange={(key) => {
            if (key !== null && key !== '') {
              handleAdd(String(key));
            }
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {availableFunctions.map((filterFunction) => (
                <ListBox.Item key={filterFunction.fn} id={filterFunction.fn} textValue={filterFunction.fn}>
                  {filterFunction.fn}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      : null}
    </fieldset>
  );
}
