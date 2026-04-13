import { Button, NumberField, Slider, Switch } from '@heroui/react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { JSX } from 'react';
import { useCallback, useRef, useState } from 'react';

import { sp } from '../tokens';
import { parseShadow } from '../utilities';
import { ColorInput } from './color-input';

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

function parseShadowLayers(value: string): readonly ShadowLayer[] {
  if (value === 'none' || value.trim() === '') {
    return [];
  }

  return value
    .split(',')
    .map((segment) => segment.trim())
    .map((segment) => {
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

export function ShadowEditor({ value, mode, onChange, label }: ShadowEditorProps): JSX.Element {
  const [layers, setLayers] = useState<readonly ShadowLayer[]>(() => parseShadowLayers(value));
  const [enabled, setEnabled] = useState(value !== 'none' && value.trim() !== '');
  const stashedRef = useRef(layers);

  const applyLayers = useCallback(
    (nextLayers: readonly ShadowLayer[]): void => {
      setLayers(nextLayers);
      onChange(buildShadowString(nextLayers, mode));
    },
    [mode, onChange],
  );

  const handleToggle = useCallback((): void => {
    if (enabled) {
      stashedRef.current = layers;
      setEnabled(false);
      onChange('none');

      return;
    }

    const restored = stashedRef.current.length > 0 ? stashedRef.current : [DEFAULT_SHADOW_LAYER];

    setEnabled(true);
    applyLayers(restored);
  }, [applyLayers, enabled, layers, onChange]);

  return (
    <fieldset aria-label={label} style={{ border: 'none', margin: 0, padding: 0 }}>
      <div style={{ alignItems: 'center', display: 'flex', gap: sp('sp-03') }}>
        <span>{label}</span>
        <Switch
          aria-label="Enable shadow"
          isSelected={enabled}
          onChange={() => {
            handleToggle();
          }}
        />
      </div>

      {enabled ?
        layers.map((layer, index) => (
          <div
            key={[layer.offsetX, layer.offsetY, index].map((value) => String(value)).join('-')}
            data-testid="shadow-layer"
            style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}
          >
            <NumberField
              aria-label="Offset X"
              value={layer.offsetX}
              onChange={(numberValue) => {
                applyLayers(
                  layers.map((entry, entryIndex) =>
                    entryIndex === index ?
                      { ...entry, offsetX: typeof numberValue === 'number' ? numberValue : Number(numberValue) }
                    : entry,
                  ),
                );
              }}
            >
              <NumberField.Group>
                <NumberField.Input />
              </NumberField.Group>
            </NumberField>

            <NumberField
              aria-label="Offset Y"
              value={layer.offsetY}
              onChange={(numberValue) => {
                applyLayers(
                  layers.map((entry, entryIndex) =>
                    entryIndex === index ?
                      { ...entry, offsetY: typeof numberValue === 'number' ? numberValue : Number(numberValue) }
                    : entry,
                  ),
                );
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
              onChange={(sliderValue: number | readonly number[]) => {
                applyLayers(
                  layers.map((entry, entryIndex) =>
                    entryIndex === index ?
                      { ...entry, blur: typeof sliderValue === 'number' ? sliderValue : Number(sliderValue) }
                    : entry,
                  ),
                );
              }}
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>

            {mode === 'box' ?
              <Slider
                aria-label="Spread"
                minValue={-50}
                maxValue={50}
                value={layer.spread}
                onChange={(sliderValue: number | readonly number[]) => {
                  applyLayers(
                    layers.map((entry, entryIndex) =>
                      entryIndex === index ?
                        { ...entry, spread: typeof sliderValue === 'number' ? sliderValue : Number(sliderValue) }
                      : entry,
                    ),
                  );
                }}
              >
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
            : null}

            <ColorInput
              label={`Layer ${String(index + 1)} color`}
              value={layer.color}
              onChange={(nextColor) => {
                applyLayers(
                  layers.map((entry, entryIndex) => (entryIndex === index ? { ...entry, color: nextColor } : entry)),
                );
              }}
            />

            {mode === 'box' ?
              <Switch
                aria-label="Inset"
                isSelected={layer.inset}
                onChange={() => {
                  applyLayers(
                    layers.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, inset: !entry.inset } : entry,
                    ),
                  );
                }}
              >
                Inset
              </Switch>
            : null}

            <Button
              aria-label={`Move layer ${String(index + 1)} up`}
              isDisabled={index === 0}
              onPress={() => {
                const nextLayers = [...layers];
                const current = nextLayers[index];
                const previous = nextLayers[index - 1];

                if (current === undefined || previous === undefined) {
                  return;
                }

                nextLayers[index - 1] = current;
                nextLayers[index] = previous;
                applyLayers(nextLayers);
              }}
            >
              <ChevronUp size={12} />
            </Button>

            <Button
              aria-label={`Move layer ${String(index + 1)} down`}
              isDisabled={index === layers.length - 1}
              onPress={() => {
                const nextLayers = [...layers];
                const current = nextLayers[index];
                const following = nextLayers[index + 1];

                if (current === undefined || following === undefined) {
                  return;
                }

                nextLayers[index + 1] = current;
                nextLayers[index] = following;
                applyLayers(nextLayers);
              }}
            >
              <ChevronDown size={12} />
            </Button>

            <Button
              aria-label={`Remove layer ${String(index + 1)}`}
              onPress={() => {
                applyLayers(layers.filter((_entry, entryIndex) => entryIndex !== index));
              }}
            >
              <X size={12} />
            </Button>
          </div>
        ))
      : null}

      {enabled ?
        <Button
          aria-label="Add shadow layer"
          onPress={() => {
            applyLayers([...layers, DEFAULT_SHADOW_LAYER]);
          }}
        >
          <Plus size={12} /> Add layer
        </Button>
      : null}
    </fieldset>
  );
}
