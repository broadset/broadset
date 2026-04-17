import { Button, ButtonGroup, Input, ListBox, Select, Slider } from '@heroui/react';
import { ArrowDownUp, Circle, Link2, Lock, Minimize2, PenTool, Square, Star, Triangle, Unlink2 } from 'lucide-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { ColorInput, FilterEditor, GradientEditor, NumField, SegmentedSwitcher, ShadowEditor } from '../inputs';
import {
  BORDER_STYLE_OPTIONS,
  CLIP_PATH_PRESETS,
  FieldShell,
  ICON_SIZE,
  ISOLATION_OPTIONS,
  isValidClipPathCss,
  MIX_BLEND_MODE_OPTIONS,
  NumericField,
  SelectField,
} from '../panel-types';
import { color, font, sp } from '../tokens';
import { PropertyField } from './property-editing-context';

const CLIP_PATH_ERROR_MESSAGE = "This shape can't be read. Try a preset, or reset.";
const CLIP_PATH_NONE = 'None';
const CLIP_PATH_CUSTOM = 'Custom';

const MASK_SHAPE_CHOICES = [CLIP_PATH_NONE, 'Circle', 'Squircle', 'Triangle', 'Star', CLIP_PATH_CUSTOM] as const;

export interface GeometryPanelProps {
  readonly name?: string | undefined;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly rotateX?: number | undefined;
  readonly rotateY?: number | undefined;
  readonly rotateZ?: number | undefined;
  readonly translateZ?: number | undefined;
  readonly anchorX?: 'left' | 'right' | undefined;
  readonly anchorY?: 'top' | 'bottom' | undefined;
  readonly canvasWidth?: number | undefined;
  readonly canvasHeight?: number | undefined;
  readonly autoSize?: string | undefined;
  readonly elementType?: string | undefined;
  readonly documentUnit?: 'px' | 'mm' | 'in' | undefined;
  readonly onUpdate: (key: string, value: string | number) => void;
  readonly documentMode: 'screen' | 'print';
}

export function GeometryPanel({
  name,
  x,
  y,
  width,
  height,
  rotation,
  rotateX,
  rotateY,
  rotateZ,
  translateZ,
  anchorX = 'left',
  anchorY = 'top',
  canvasWidth = 1920,
  canvasHeight = 1080,
  autoSize,
  elementType,
  documentUnit = 'px',
  onUpdate,
  documentMode,
}: GeometryPanelProps): JSX.Element {
  const [nameDraft, setNameDraft] = useState(name ?? '');
  const [is3DOpen, setIs3DOpen] = useState(false);
  const [activeAnchorX, setActiveAnchorX] = useState<'left' | 'right'>(anchorX);
  const [activeAnchorY, setActiveAnchorY] = useState<'top' | 'bottom'>(anchorY);

  useEffect(() => {
    setActiveAnchorX(anchorX);
  }, [anchorX]);

  useEffect(() => {
    setActiveAnchorY(anchorY);
  }, [anchorY]);

  const displayX = activeAnchorX === 'right' ? canvasWidth - x - width : x;
  const displayY = activeAnchorY === 'bottom' ? canvasHeight - y - height : y;
  const displayWidth = Math.max(0.1, width);
  const displayHeight = Math.max(0.1, height);
  const isScreenMode = documentMode === 'screen';
  const show3D =
    isScreenMode &&
    (rotateX !== undefined || rotateY !== undefined || rotateZ !== undefined || translateZ !== undefined);

  const showAutoSize = elementType === 'text';
  const isAutoHeight = autoSize === 'auto-height';

  const xLabel = activeAnchorX === 'right' ? `X (Right ${documentUnit})` : `X (${documentUnit})`;
  const yLabel = activeAnchorY === 'bottom' ? `Y (Bottom ${documentUnit})` : `Y (${documentUnit})`;
  const widthLabel = `Width (${documentUnit})`;
  const heightLabel = `Height (${documentUnit})`;

  const commitNameDraft = useCallback(() => {
    onUpdate('name', nameDraft);
  }, [nameDraft, onUpdate]);

  const handleXChange = useCallback(
    (nextDisplayX: number) => {
      const modelX = activeAnchorX === 'right' ? canvasWidth - nextDisplayX - width : nextDisplayX;

      onUpdate('x', modelX);
    },
    [activeAnchorX, canvasWidth, onUpdate, width],
  );

  const handleYChange = useCallback(
    (nextDisplayY: number) => {
      const modelY = activeAnchorY === 'bottom' ? canvasHeight - nextDisplayY - height : nextDisplayY;

      onUpdate('y', modelY);
    },
    [activeAnchorY, canvasHeight, height, onUpdate],
  );

  return (
    <section aria-label="Geometry" role="region" className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <PropertyField propertyKey="name" defaultValue={nameDraft}>
        <FieldShell label="Element name">
          <Input
            aria-label="Element name"
            value={nameDraft}
            onChange={(event) => {
              setNameDraft(event.currentTarget.value);
            }}
            onBlur={commitNameDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitNameDraft();
              }
            }}
          />
        </FieldShell>
      </PropertyField>

      <FieldShell label="Anchor X">
        <ButtonGroup aria-label="Anchor X">
          <Button
            aria-label="Anchor X Left"
            size="sm"
            variant={activeAnchorX === 'left' ? 'secondary' : 'ghost'}
            onPress={() => {
              setActiveAnchorX('left');
              onUpdate('anchorX', 'left');
            }}
          >
            Left
          </Button>
          <Button
            aria-label="Anchor X Right"
            size="sm"
            variant={activeAnchorX === 'right' ? 'secondary' : 'ghost'}
            onPress={() => {
              setActiveAnchorX('right');
              onUpdate('anchorX', 'right');
            }}
          >
            Right
          </Button>
        </ButtonGroup>
      </FieldShell>

      <FieldShell label="Anchor Y">
        <ButtonGroup aria-label="Anchor Y">
          <Button
            aria-label="Anchor Y Top"
            size="sm"
            variant={activeAnchorY === 'top' ? 'secondary' : 'ghost'}
            onPress={() => {
              setActiveAnchorY('top');
              onUpdate('anchorY', 'top');
            }}
          >
            Top
          </Button>
          <Button
            aria-label="Anchor Y Bottom"
            size="sm"
            variant={activeAnchorY === 'bottom' ? 'secondary' : 'ghost'}
            onPress={() => {
              setActiveAnchorY('bottom');
              onUpdate('anchorY', 'bottom');
            }}
          >
            Bottom
          </Button>
        </ButtonGroup>
      </FieldShell>

      <PropertyField propertyKey="x" defaultValue={x}>
        <NumericField label={xLabel} value={displayX} onValueChange={handleXChange} />
      </PropertyField>
      <PropertyField propertyKey="y" defaultValue={y}>
        <NumericField label={yLabel} value={displayY} onValueChange={handleYChange} />
      </PropertyField>
      <PropertyField propertyKey="width" defaultValue={width}>
        <NumericField
          label={widthLabel}
          value={displayWidth}
          minValue={0.1}
          onValueChange={(v) => {
            onUpdate('width', v);
          }}
        />
      </PropertyField>
      <PropertyField propertyKey="height" defaultValue={height}>
        <NumericField
          isDisabled={isAutoHeight}
          label={heightLabel}
          value={displayHeight}
          minValue={0.1}
          onValueChange={(v) => {
            onUpdate('height', v);
          }}
        />
      </PropertyField>
      <PropertyField propertyKey="rotation" defaultValue={rotation}>
        <NumericField
          label="Rotation"
          value={rotation}
          onValueChange={(v) => {
            onUpdate('rotation', v);
          }}
        />
      </PropertyField>
      {showAutoSize ?
        <div className="col-span-full" style={{ marginTop: sp('sp-02') }}>
          <ButtonGroup aria-label="Auto-size mode">
            <Button
              aria-label="Fixed"
              size="sm"
              variant={autoSize === 'fixed' || autoSize === undefined ? 'secondary' : 'ghost'}
              onPress={() => {
                onUpdate('autoSize', 'fixed');
              }}
            >
              <Lock size={ICON_SIZE} /> Fixed
            </Button>
            <Button
              aria-label="Auto Height"
              size="sm"
              variant={autoSize === 'auto-height' ? 'secondary' : 'ghost'}
              onPress={() => {
                onUpdate('autoSize', 'auto-height');
              }}
            >
              <ArrowDownUp size={ICON_SIZE} /> Auto Height
            </Button>
            <Button
              aria-label="Shrink to Fit"
              size="sm"
              variant={autoSize === 'shrink-to-fit' ? 'secondary' : 'ghost'}
              onPress={() => {
                onUpdate('autoSize', 'shrink-to-fit');
              }}
            >
              <Minimize2 size={ICON_SIZE} /> Shrink to Fit
            </Button>
          </ButtonGroup>
        </div>
      : null}
      {show3D ?
        <>
          <div className="col-span-full">
            <Button
              aria-label="3D transform"
              size="sm"
              variant={is3DOpen ? 'secondary' : 'ghost'}
              onPress={() => {
                setIs3DOpen((current) => !current);
              }}
            >
              3D transform
            </Button>
          </div>
          {is3DOpen ?
            <>
              <NumericField
                label="Rotate X"
                value={rotateX ?? 0}
                onValueChange={(v) => {
                  onUpdate('rotateX', v);
                }}
              />
              <NumericField
                label="Rotate Y"
                value={rotateY ?? 0}
                onValueChange={(v) => {
                  onUpdate('rotateY', v);
                }}
              />
              <NumericField
                label="Rotate Z"
                value={rotateZ ?? 0}
                onValueChange={(v) => {
                  onUpdate('rotateZ', v);
                }}
              />
              <NumericField
                label="Translate Z"
                value={translateZ ?? 0}
                onValueChange={(v) => {
                  onUpdate('translateZ', v);
                }}
              />
            </>
          : null}
        </>
      : null}
    </section>
  );
}

export interface AppearancePanelProps {
  readonly backgroundColor: string;
  readonly backgroundGradient?: string | undefined;
  readonly showGradient?: boolean | undefined;
  readonly borderWidth: number;
  readonly borderColor: string;
  readonly borderStyle: string;
  readonly borderRadius: readonly [number, number, number, number];
  readonly opacity: number;
  readonly blendMode: string;
  readonly onUpdate: (key: string, value: string | number | readonly [number, number, number, number]) => void;
}

export function AppearancePanel({
  backgroundColor,
  backgroundGradient,
  showGradient,
  borderWidth,
  borderColor,
  borderStyle,
  borderRadius,
  opacity,
  blendMode,
  onUpdate,
}: AppearancePanelProps): JSX.Element {
  const [fillMode, setFillMode] = useState<'solid' | 'gradient'>(
    showGradient === true && backgroundGradient !== undefined && backgroundGradient.trim() !== '' ?
      'gradient'
    : 'solid',
  );
  const [draftGradient, setDraftGradient] = useState(backgroundGradient?.trim() ?? '');
  const [linkedCorners, setLinkedCorners] = useState(false);

  useEffect(() => {
    if (backgroundGradient !== undefined && backgroundGradient.trim() !== '') {
      setDraftGradient(backgroundGradient);
    }
  }, [backgroundGradient]);

  const effectiveGradient = draftGradient;
  const opacityPercent = `${String(Math.round(opacity * 100))}%`;

  const updateBorderRadius = (index: number, value: number): void => {
    if (linkedCorners) {
      onUpdate('borderRadius', [value, value, value, value]);

      return;
    }

    const next: [number, number, number, number] = [...borderRadius] as [number, number, number, number];

    next[index] = value;
    onUpdate('borderRadius', next);
  };

  return (
    <section aria-label="Appearance" role="region" className="flex flex-col gap-2">
      {showGradient === true ?
        <PropertyField propertyKey="backgroundGradient" defaultValue={draftGradient}>
          <SegmentedSwitcher
            ariaLabel="Fill mode"
            value={fillMode}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'gradient', label: 'Gradient' },
            ]}
            onChange={(nextFillMode) => {
              setFillMode(nextFillMode);

              if (nextFillMode === 'gradient') {
                onUpdate('backgroundGradient', draftGradient);

                return;
              }

              onUpdate('backgroundGradient', '');
            }}
          />
        </PropertyField>
      : null}

      <PropertyField propertyKey="backgroundColor" defaultValue={backgroundColor}>
        <ColorInput
          label="Fill color"
          value={backgroundColor}
          onChange={(v) => {
            onUpdate('backgroundColor', v);
          }}
        />
      </PropertyField>
      {showGradient === true && fillMode === 'gradient' ?
        <PropertyField propertyKey="backgroundGradient" defaultValue={effectiveGradient}>
          <GradientEditor
            label="Gradient"
            value={effectiveGradient}
            onChange={(nextGradient) => {
              setDraftGradient(nextGradient);
              onUpdate('backgroundGradient', nextGradient);
            }}
          />
        </PropertyField>
      : null}

      <PropertyField propertyKey="opacity" defaultValue={opacity}>
        <div className="flex flex-col gap-1">
          <Slider
            aria-label="Opacity"
            maxValue={1}
            minValue={0}
            step={0.01}
            value={opacity}
            onChange={(v: number | readonly number[]) => {
              onUpdate('opacity', typeof v === 'number' ? v : Number(v));
            }}
          >
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
          <p style={{ color: color('muted'), fontSize: font('label'), margin: 0 }}>{opacityPercent}</p>
        </div>
      </PropertyField>

      <PropertyField propertyKey="borderWidth" defaultValue={borderWidth}>
        <NumField
          label="Border width"
          value={borderWidth}
          min={0}
          onChange={(v) => {
            onUpdate('borderWidth', v);
          }}
        />
      </PropertyField>
      <PropertyField propertyKey="borderColor" defaultValue={borderColor}>
        <ColorInput
          label="Border color"
          value={borderColor}
          onChange={(v) => {
            onUpdate('borderColor', v);
          }}
        />
      </PropertyField>

      <PropertyField propertyKey="borderStyle" defaultValue={borderStyle}>
        <SelectField
          label="Border style"
          value={borderStyle}
          options={[...BORDER_STYLE_OPTIONS]}
          onUpdate={onUpdate}
          updateKey="borderStyle"
        />
      </PropertyField>
      <PropertyField propertyKey="blendMode" defaultValue={blendMode}>
        <SelectField
          label="Blend mode"
          value={blendMode}
          options={[...MIX_BLEND_MODE_OPTIONS]}
          onUpdate={onUpdate}
          updateKey="blendMode"
        />
      </PropertyField>

      <PropertyField propertyKey="borderRadius" defaultValue={borderRadius}>
        <div className="flex flex-col gap-2">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sp('sp-02') }}>
            <NumField
              label="Border radius TL"
              value={borderRadius[0]}
              min={0}
              onChange={(v) => {
                updateBorderRadius(0, v);
              }}
            />
            <NumField
              label="Border radius TR"
              value={borderRadius[1]}
              min={0}
              onChange={(v) => {
                updateBorderRadius(1, v);
              }}
            />
            <NumField
              label="Border radius BR"
              value={borderRadius[2]}
              min={0}
              onChange={(v) => {
                updateBorderRadius(2, v);
              }}
            />
            <NumField
              label="Border radius BL"
              value={borderRadius[3]}
              min={0}
              onChange={(v) => {
                updateBorderRadius(3, v);
              }}
            />
          </div>
          <Button
            aria-label="Link corners"
            size="sm"
            variant="ghost"
            onPress={() => {
              setLinkedCorners((current) => !current);
            }}
          >
            {linkedCorners ?
              <Link2 size={ICON_SIZE} />
            : <Unlink2 size={ICON_SIZE} />}
          </Button>
        </div>
      </PropertyField>
    </section>
  );
}

export interface SpacingPanelProps {
  readonly padding: readonly [number, number, number, number];
  readonly onUpdate: (key: string, value: string | number | readonly [number, number, number, number]) => void;
}

export function SpacingPanel({ padding, onUpdate }: SpacingPanelProps): JSX.Element {
  const [linked, setLinked] = useState(false);
  const labels = ['Padding top', 'Padding right', 'Padding bottom', 'Padding left'] as const;

  const handlePaddingChange = useCallback(
    (index: number, value: number) => {
      if (linked) {
        onUpdate('padding', [value, value, value, value]);
      } else {
        const next: [number, number, number, number] = [...padding] as [number, number, number, number];

        next[index] = value;
        onUpdate('padding', next);
      }
    },
    [linked, onUpdate, padding],
  );

  return (
    <section aria-label="Spacing" role="region" className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {labels.map((label, idx) => (
          <NumField
            key={label}
            label={label}
            value={padding[idx] ?? 0}
            min={0}
            onChange={(v) => {
              handlePaddingChange(idx, v);
            }}
          />
        ))}
      </div>
      <Button
        aria-label="Link padding"
        size="sm"
        variant="ghost"
        onPress={() => {
          setLinked((s) => !s);
        }}
      >
        {linked ?
          <Link2 size={ICON_SIZE} />
        : <Unlink2 size={ICON_SIZE} />}
      </Button>
    </section>
  );
}

export interface BoxEffectsPanelProps {
  readonly boxShadow: string;
  readonly filter: string;
  readonly backdropFilter: string;
  readonly mixBlendMode: string;
  readonly isolation: string;
  readonly documentMode: 'screen' | 'print';
  readonly onUpdate: (key: string, value: string | number) => void;
}

export function BoxEffectsPanel({
  boxShadow,
  filter,
  backdropFilter,
  mixBlendMode,
  isolation,
  documentMode,
  onUpdate,
}: BoxEffectsPanelProps): JSX.Element {
  return (
    <section aria-label="Box Effects" role="region" className="flex flex-col gap-2">
      <ShadowEditor
        label="Box shadow"
        mode="box"
        value={boxShadow}
        onChange={(v) => {
          onUpdate('boxShadow', v);
        }}
      />
      <FilterEditor
        label="Filter"
        value={filter}
        onChange={(v) => {
          onUpdate('filter', v);
        }}
      />
      <FilterEditor
        label="Backdrop filter"
        value={backdropFilter}
        onChange={(v) => {
          onUpdate('backdropFilter', v);
        }}
      />
      {documentMode === 'screen' ?
        <>
          <SelectField
            label="Mix blend mode"
            value={mixBlendMode}
            options={[...MIX_BLEND_MODE_OPTIONS]}
            onUpdate={onUpdate}
            updateKey="mixBlendMode"
          />
          <SelectField
            label="Isolation"
            value={isolation}
            options={[...ISOLATION_OPTIONS]}
            onUpdate={onUpdate}
            updateKey="isolation"
          />
        </>
      : null}
    </section>
  );
}

export interface ClipPathPanelProps {
  readonly maskType: string;
  readonly customClipPath: string;
  readonly onStartEditingClipPath?: (() => void) | undefined;
  readonly onUpdate: (key: string, value: string | number) => void;
}

function resolveMaskChoice(maskType: string, customClipPath: string): string {
  if (maskType === 'custom' || maskType === 'url') {
    return CLIP_PATH_CUSTOM;
  }

  const matchedPreset = CLIP_PATH_PRESETS.find((preset) => preset.value === customClipPath);

  if (matchedPreset !== undefined) {
    return matchedPreset.label;
  }

  if (maskType === 'none' || customClipPath.trim() === '') {
    return CLIP_PATH_NONE;
  }

  return CLIP_PATH_CUSTOM;
}

function getMaskIcon(choice: string): JSX.Element {
  if (choice === 'Circle') {
    return <Circle size={ICON_SIZE} />;
  }

  if (choice === 'Squircle') {
    return <Square size={ICON_SIZE} />;
  }

  if (choice === 'Triangle') {
    return <Triangle size={ICON_SIZE} />;
  }

  if (choice === 'Star') {
    return <Star size={ICON_SIZE} />;
  }

  if (choice === CLIP_PATH_CUSTOM) {
    return <PenTool size={ICON_SIZE} />;
  }

  return <Unlink2 size={ICON_SIZE} />;
}

export function ClipPathPanel({
  maskType,
  customClipPath,
  onStartEditingClipPath,
  onUpdate,
}: ClipPathPanelProps): JSX.Element {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [rawValue, setRawValue] = useState(customClipPath);
  const [error, setError] = useState('');
  const selectedChoice = resolveMaskChoice(maskType, customClipPath);
  const isCustomChoice = selectedChoice === CLIP_PATH_CUSTOM;

  useEffect(() => {
    setRawValue(customClipPath);
  }, [customClipPath]);

  const applyMaskChoice = (choice: string): void => {
    if (choice === CLIP_PATH_CUSTOM) {
      onUpdate('maskType', 'custom');
      onStartEditingClipPath?.();
      setError('');

      return;
    }

    const matchedPreset = CLIP_PATH_PRESETS.find((preset) => preset.label === choice);

    if (matchedPreset === undefined) {
      return;
    }

    onUpdate('customClipPath', matchedPreset.value);
    onUpdate('maskType', matchedPreset.maskType);
    setRawValue(matchedPreset.value);
    setError('');
  };

  return (
    <section aria-label="Clip Path" role="region" className="flex flex-col gap-2">
      <div
        style={{
          display: 'grid',
          gap: sp('sp-02'),
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        }}
      >
        {MASK_SHAPE_CHOICES.map((choice) => (
          <Button
            key={choice}
            aria-label={choice}
            size="sm"
            variant={selectedChoice === choice ? 'primary' : 'ghost'}
            {...(selectedChoice === choice ?
              {
                style: {
                  borderColor: color('accent'),
                  boxShadow: `0 0 0 1px ${color('accent')}`,
                },
              }
            : {})}
            onPress={() => {
              applyMaskChoice(choice);
            }}
          >
            <span style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
              {getMaskIcon(choice)}
              {choice}
            </span>
          </Button>
        ))}
      </div>

      <FieldShell label="Mask shape">
        <Select
          aria-label="Mask shape"
          value={selectedChoice}
          onChange={(selection) => {
            if (selection !== null) {
              applyMaskChoice(String(selection));
            }
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {MASK_SHAPE_CHOICES.map((choice) => (
                <ListBox.Item id={choice} key={choice} textValue={choice}>
                  {choice}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </FieldShell>

      {isCustomChoice ?
        <div className="flex gap-2">
          <Button
            aria-label="Start editing clip path"
            size="sm"
            variant="primary"
            onPress={() => {
              onStartEditingClipPath?.();
            }}
          >
            Start editing clip path
          </Button>
          <Button
            aria-label="Reset shape"
            size="sm"
            variant="ghost"
            onPress={() => {
              onUpdate('customClipPath', '');
              onUpdate('maskType', 'none');
              setRawValue('');
              setError('');
            }}
          >
            Reset shape
          </Button>
        </div>
      : null}

      <Button
        aria-label="Advanced"
        size="sm"
        variant="ghost"
        onPress={() => {
          setIsAdvancedOpen((current) => !current);
        }}
      >
        Advanced
      </Button>

      {isAdvancedOpen ?
        <FieldShell label="Custom shape value">
          <Input
            aria-invalid={error !== '' ? 'true' : 'false'}
            aria-label="Custom shape value"
            value={rawValue}
            onChange={(e) => {
              setRawValue(e.currentTarget.value);
              setError('');
            }}
            onBlur={() => {
              const trimmed = rawValue.trim();

              if (trimmed === '') {
                onUpdate('customClipPath', '');
                onUpdate('maskType', 'none');
                setError('');

                return;
              }

              if (isValidClipPathCss(trimmed)) {
                onUpdate('customClipPath', trimmed);

                if (maskType === 'none') {
                  onUpdate('maskType', 'custom');
                }

                setError('');

                return;
              }

              setError(CLIP_PATH_ERROR_MESSAGE);
            }}
          />
        </FieldShell>
      : null}

      {error !== '' ?
        <p role="alert" style={{ color: color('danger'), fontSize: font('body-compact'), margin: 0 }}>
          {error}
        </p>
      : null}
    </section>
  );
}
