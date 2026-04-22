import { Button, Slider } from '@heroui/react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type { CSSProperties, JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { color, sp } from '../tokens';
import { parseShadow } from '../utilities';
import { ColorInput } from './color-input';
import { NumField } from './number-inputs';
import { ToggleSwitch } from './toggle-switch';

interface ShadowLayer {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly spread: number;
  readonly color: string;
  readonly inset: boolean;
}

const DEFAULT_SHADOW_LAYER: Readonly<ShadowLayer> = {
  offsetX: 0,
  offsetY: 0,
  blur: 4,
  spread: 0,
  color: '#000000',
  inset: false,
};

/**
 * Split a CSS shadow list on top-level commas only. A plain `.split(',')` also
 * cuts inside `rgba(r, g, b, a)` — e.g. a 2-shadow string containing two
 * `rgba()` colors splits into 8 fragments, and the UI used to render that as
 * 8 garbled "shadows". Tracks paren depth to keep function-arg commas intact.
 */
function splitShadowList(value: string): readonly string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];

    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
    } else if (char === ',' && depth === 0) {
      result.push(value.slice(start, i));
      start = i + 1;
    }
  }

  result.push(value.slice(start));

  return result.map((segment) => segment.trim()).filter((segment) => segment !== '');
}

function parseShadowLayers(value: string): readonly ShadowLayer[] {
  if (value === 'none' || value.trim() === '') {
    return [];
  }

  return splitShadowList(value).map((segment) => {
    const parsed = parseShadow(segment);

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
  if (layers.length === 0) {
    return 'none';
  }

  return layers
    .map((layer) => {
      const parts = [
        ...(layer.inset && mode === 'box' ? ['inset'] : []),
        `${String(layer.offsetX)}px`,
        `${String(layer.offsetY)}px`,
        `${String(layer.blur)}px`,
        ...(mode === 'box' ? [`${String(layer.spread)}px`] : []),
        layer.color,
      ];

      return parts.join(' ');
    })
    .join(', ');
}

export interface ShadowEditorProps {
  readonly value: string;
  readonly mode: 'box' | 'text';
  readonly onChange: (value: string) => void;
  readonly label: string;
}

function layerFrameStyle(): CSSProperties {
  return {
    background: color('field-background'),
    border: `1px solid ${color('border')}`,
    borderRadius: '0.375rem',
    display: 'flex',
    flexDirection: 'column',
    gap: sp('sp-02'),
    minWidth: 0,
    padding: sp('sp-02'),
    width: '100%',
  };
}

function subheadStyle(): CSSProperties {
  return {
    color: color('muted'),
    fontSize: '0.625rem',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };
}

function iconButtonStyle(): CSSProperties {
  return {
    height: '1.5rem',
    minWidth: '1.5rem',
    padding: '0 0.25rem',
  };
}

export function ShadowEditor({ value, mode, onChange, label }: ShadowEditorProps): JSX.Element {
  const [layers, setLayers] = useState<readonly ShadowLayer[]>(() => parseShadowLayers(value));
  const [enabled, setEnabled] = useState(value !== 'none' && value.trim() !== '');
  const stashedRef = useRef(layers);
  // Track the serialized value we last emitted so an external `value` change
  // (selection switch, undo/redo, remote apply) can be distinguished from our
  // own onChange round-trip and resynced without feedback looping.
  const lastEmittedRef = useRef(value);

  useEffect(() => {
    if (value === lastEmittedRef.current) {
      return;
    }

    lastEmittedRef.current = value;

    const nextEnabled = value !== 'none' && value.trim() !== '';
    const nextLayers = parseShadowLayers(value);

    setEnabled(nextEnabled);
    setLayers(nextLayers);

    if (nextLayers.length > 0) {
      stashedRef.current = nextLayers;
    }
  }, [value]);

  const applyLayers = useCallback(
    (nextLayers: readonly ShadowLayer[]): void => {
      setLayers(nextLayers);

      const serialized = buildShadowString(nextLayers, mode);

      lastEmittedRef.current = serialized;
      onChange(serialized);
    },
    [mode, onChange],
  );

  const handleToggle = useCallback((): void => {
    if (enabled) {
      stashedRef.current = layers;
      setEnabled(false);
      lastEmittedRef.current = 'none';
      onChange('none');

      return;
    }

    const restored = stashedRef.current.length > 0 ? stashedRef.current : [DEFAULT_SHADOW_LAYER];

    setEnabled(true);
    applyLayers(restored);
  }, [applyLayers, enabled, layers, onChange]);

  const updateLayer = useCallback(
    (index: number, patch: Partial<ShadowLayer>): void => {
      applyLayers(layers.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
    },
    [applyLayers, layers],
  );

  const moveLayer = useCallback(
    (index: number, direction: -1 | 1): void => {
      const target = index + direction;

      if (target < 0 || target >= layers.length) return;

      const next = [...layers];
      const a = next[index];
      const b = next[target];

      if (a === undefined || b === undefined) return;

      next[index] = b;
      next[target] = a;
      applyLayers(next);
    },
    [applyLayers, layers],
  );

  const removeLayer = useCallback(
    (index: number): void => {
      applyLayers(layers.filter((_entry, entryIndex) => entryIndex !== index));
    },
    [applyLayers, layers],
  );

  return (
    <fieldset
      aria-label={label}
      style={{ border: 'none', display: 'flex', flexDirection: 'column', gap: sp('sp-02'), margin: 0, minWidth: 0, padding: 0, width: '100%' }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: sp('sp-02'),
          justifyContent: 'space-between',
          minWidth: 0,
        }}
      >
        <span style={{ color: color('muted'), fontSize: '0.75rem' }}>{label}</span>
        <div style={{ alignItems: 'center', display: 'flex', gap: sp('sp-02') }}>
          <ToggleSwitch
            ariaLabel="Enable shadow"
            isSelected={enabled}
            onChange={() => {
              handleToggle();
            }}
          />
          {enabled ?
            <Button
              aria-label="Add shadow layer"
              size="sm"
              variant="ghost"
              style={iconButtonStyle()}
              onPress={() => {
                applyLayers([...layers, DEFAULT_SHADOW_LAYER]);
              }}
            >
              <Plus size={12} />
            </Button>
          : null}
        </div>
      </div>

      {enabled ?
        layers.map((layer, index) => {
          const key = `shadow-layer-${String(index)}`;

          return (
            <div key={key} data-testid="shadow-layer" style={layerFrameStyle()}>
              <div
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  gap: sp('sp-02'),
                  justifyContent: 'space-between',
                  minWidth: 0,
                }}
              >
                <span style={subheadStyle()}>Layer {String(index + 1)}</span>
                <div style={{ alignItems: 'center', display: 'flex', gap: sp('sp-01') }}>
                  <Button
                    aria-label={`Move layer ${String(index + 1)} up`}
                    isDisabled={index === 0}
                    size="sm"
                    variant="ghost"
                    style={iconButtonStyle()}
                    onPress={() => {
                      moveLayer(index, -1);
                    }}
                  >
                    <ArrowUp size={12} />
                  </Button>
                  <Button
                    aria-label={`Move layer ${String(index + 1)} down`}
                    isDisabled={index === layers.length - 1}
                    size="sm"
                    variant="ghost"
                    style={iconButtonStyle()}
                    onPress={() => {
                      moveLayer(index, 1);
                    }}
                  >
                    <ArrowDown size={12} />
                  </Button>
                  <Button
                    aria-label={`Remove layer ${String(index + 1)}`}
                    size="sm"
                    variant="ghost"
                    style={iconButtonStyle()}
                    onPress={() => {
                      removeLayer(index);
                    }}
                  >
                    <X size={12} />
                  </Button>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: sp('sp-02'),
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01'), minWidth: 0 }}>
                  <span style={subheadStyle()}>Offset X</span>
                  <NumField
                    compact
                    label={`Layer ${String(index + 1)} offset X`}
                    value={layer.offsetX}
                    onChange={(next) => {
                      updateLayer(index, { offsetX: next });
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01'), minWidth: 0 }}>
                  <span style={subheadStyle()}>Offset Y</span>
                  <NumField
                    compact
                    label={`Layer ${String(index + 1)} offset Y`}
                    value={layer.offsetY}
                    onChange={(next) => {
                      updateLayer(index, { offsetY: next });
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01'), minWidth: 0 }}>
                <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={subheadStyle()}>Blur</span>
                  <span style={{ color: color('muted'), fontSize: '0.6875rem' }}>{String(layer.blur)}px</span>
                </div>
                <Slider
                  aria-label={`Layer ${String(index + 1)} blur`}
                  minValue={0}
                  maxValue={100}
                  value={layer.blur}
                  onChange={(sliderValue: number | readonly number[]) => {
                    updateLayer(index, {
                      blur: typeof sliderValue === 'number' ? sliderValue : (sliderValue[0] ?? 0),
                    });
                  }}
                >
                  <Slider.Track>
                    <Slider.Fill />
                    <Slider.Thumb />
                  </Slider.Track>
                </Slider>
              </div>

              {mode === 'box' ?
                <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01'), minWidth: 0 }}>
                  <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={subheadStyle()}>Spread</span>
                    <span style={{ color: color('muted'), fontSize: '0.6875rem' }}>{String(layer.spread)}px</span>
                  </div>
                  <Slider
                    aria-label={`Layer ${String(index + 1)} spread`}
                    minValue={-50}
                    maxValue={50}
                    value={layer.spread}
                    onChange={(sliderValue: number | readonly number[]) => {
                      updateLayer(index, {
                        spread: typeof sliderValue === 'number' ? sliderValue : (sliderValue[0] ?? 0),
                      });
                    }}
                  >
                    <Slider.Track>
                      <Slider.Fill />
                      <Slider.Thumb />
                    </Slider.Track>
                  </Slider>
                </div>
              : null}

              <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01'), minWidth: 0 }}>
                <span style={subheadStyle()}>Color</span>
                <ColorInput
                  compact
                  label={`Layer ${String(index + 1)} color`}
                  value={layer.color}
                  onChange={(nextColor) => {
                    updateLayer(index, { color: nextColor });
                  }}
                />
              </div>

              {mode === 'box' ?
                <ToggleSwitch
                  ariaLabel={`Layer ${String(index + 1)} inner shadow`}
                  isSelected={layer.inset}
                  onChange={(nextValue) => {
                    updateLayer(index, { inset: nextValue });
                  }}
                >
                  Inner shadow
                </ToggleSwitch>
              : null}
            </div>
          );
        })
      : null}
    </fieldset>
  );
}
