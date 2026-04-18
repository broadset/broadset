import { Button, ButtonGroup, Input, Slider } from '@heroui/react';
import { ArrowDownUp, Circle, Lock, Minimize2, PenTool, Square, Star, Triangle, Unlink2 } from 'lucide-react';
import type { CSSProperties, JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AxisCell } from '../inputs';
import {
  AnchorPad,
  AxisTriplet,
  ColorInput,
  FieldRow,
  FilterEditor,
  GradientEditor,
  NumField,
  PairInput,
  QuadInput,
  SegmentedSwitcher,
  ShadowEditor,
} from '../inputs';
import {
  BORDER_STYLE_OPTIONS,
  CLIP_PATH_PRESETS,
  FieldShell,
  ICON_SIZE,
  ISOLATION_OPTIONS,
  isValidClipPathCss,
  MIX_BLEND_MODE_OPTIONS,
  SelectField,
} from '../panel-types';
import { color, font, sp } from '../tokens';
import { PropertyField } from './property-editing-context';

const CLIP_PATH_ERROR_MESSAGE = "This shape can't be read. Try a preset, or reset.";
const CLIP_PATH_NONE = 'None';
const CLIP_PATH_CUSTOM = 'Custom';

function borderRowLabelStyle(): CSSProperties {
  return {
    alignSelf: 'center',
    color: color('muted'),
    fontSize: font('label'),
    letterSpacing: '0.02em',
    minWidth: 0,
  };
}

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
  const [activeAnchorX, setActiveAnchorX] = useState<'left' | 'right'>(anchorX);
  const [activeAnchorY, setActiveAnchorY] = useState<'top' | 'bottom'>(anchorY);
  const [isAspectLinked, setIsAspectLinked] = useState(false);
  const aspectRatioRef = useRef<number | null>(null);

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
  const has3DValues =
    rotateX !== undefined || rotateY !== undefined || rotateZ !== undefined || translateZ !== undefined;
  // 3D axes are screen-only (print has no perspective). When in screen mode we
  // always expose X/Y/Z side-by-side; print mode collapses Z cells via isHidden.
  const showZAxes = isScreenMode;

  const showAutoSize = elementType === 'text';
  const isAutoHeight = autoSize === 'auto-height';

  // Rotation Z maps to `rotation` for 2D-only elements; when the element already
  // has any 3D rotation authored we keep Z on `rotateZ` so the two stay in sync.
  const rotationZKey = has3DValues && rotateZ !== undefined ? 'rotateZ' : 'rotation';
  const rotationZValue = rotationZKey === 'rotateZ' ? (rotateZ ?? 0) : rotation;

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

  const handleAspectToggle = useCallback(
    (nextLinked: boolean) => {
      aspectRatioRef.current = nextLinked && width > 0 ? height / width : null;
      setIsAspectLinked(nextLinked);
    },
    [height, width],
  );

  const positionAxes = useMemo<readonly AxisCell[]>(
    () => [
      {
        chip: 'X',
        color: 'x',
        ariaLabel: activeAnchorX === 'right' ? `Position X (Right ${documentUnit})` : `Position X (${documentUnit})`,
        value: displayX,
        onChange: handleXChange,
      },
      {
        chip: 'Y',
        color: 'y',
        ariaLabel: activeAnchorY === 'bottom' ? `Position Y (Bottom ${documentUnit})` : `Position Y (${documentUnit})`,
        value: displayY,
        onChange: handleYChange,
      },
      {
        chip: 'Z',
        color: 'z',
        ariaLabel: `Position Z (${documentUnit})`,
        value: translateZ ?? 0,
        onChange: (nextZ: number) => {
          onUpdate('translateZ', nextZ);
        },
        isHidden: !showZAxes,
      },
    ],
    [
      activeAnchorX,
      activeAnchorY,
      displayX,
      displayY,
      documentUnit,
      handleXChange,
      handleYChange,
      onUpdate,
      showZAxes,
      translateZ,
    ],
  );

  const rotationAxes = useMemo<readonly AxisCell[]>(
    () => [
      {
        chip: 'X',
        color: 'x',
        ariaLabel: 'Rotation X',
        value: rotateX ?? 0,
        onChange: (nextRotX: number) => {
          onUpdate('rotateX', nextRotX);
        },
        isHidden: !showZAxes,
      },
      {
        chip: 'Y',
        color: 'y',
        ariaLabel: 'Rotation Y',
        value: rotateY ?? 0,
        onChange: (nextRotY: number) => {
          onUpdate('rotateY', nextRotY);
        },
        isHidden: !showZAxes,
      },
      {
        chip: 'Z',
        color: 'z',
        ariaLabel: 'Rotation Z',
        value: rotationZValue,
        onChange: (nextRotZ: number) => {
          onUpdate(rotationZKey, nextRotZ);
        },
      },
    ],
    [onUpdate, rotateX, rotateY, rotationZKey, rotationZValue, showZAxes],
  );

  const anchorLabel = `${activeAnchorY === 'top' ? 'Top' : 'Bottom'} ${activeAnchorX === 'left' ? 'left' : 'right'}`;

  return (
    <section
      aria-label="Geometry"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: sp('sp-04'),
        minWidth: 0,
        width: '100%',
      }}
    >
      <PropertyField propertyKey="x" defaultValue={x}>
        <AxisTriplet label="Position" unit={documentUnit} axes={positionAxes} />
      </PropertyField>

      <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), minWidth: 0, width: '100%' }}>
        <PropertyField propertyKey="width" defaultValue={width}>
          <PairInput
            label="Size"
            unit={documentUnit}
            axes={[
              {
                chip: 'W',
                color: 'neutral',
                ariaLabel: `Size W (${documentUnit})`,
                value: displayWidth,
                min: 0.1,
                onChange: (nextWidth: number) => {
                  onUpdate('width', nextWidth);

                  if (isAspectLinked && aspectRatioRef.current !== null) {
                    onUpdate('height', nextWidth * aspectRatioRef.current);
                  }
                },
              },
              {
                chip: 'H',
                color: 'neutral',
                ariaLabel: `Size H (${documentUnit})`,
                value: displayHeight,
                min: 0.1,
                isDisabled: isAutoHeight,
                onChange: (nextHeight: number) => {
                  onUpdate('height', nextHeight);

                  if (isAspectLinked && aspectRatioRef.current !== null && aspectRatioRef.current !== 0) {
                    onUpdate('width', nextHeight / aspectRatioRef.current);
                  }
                },
              },
            ]}
            linkToggle={{ isLinked: isAspectLinked, onToggle: handleAspectToggle, ariaLabel: 'Link aspect ratio' }}
          />
        </PropertyField>
        {showAutoSize ?
          <FieldRow
            label="Text fit"
            trailing={
              <ButtonGroup aria-label="Auto-size mode">
                <Button
                  aria-label="Fixed"
                  size="sm"
                  variant={autoSize === 'fixed' || autoSize === undefined ? 'secondary' : 'ghost'}
                  style={{ height: '1.75rem', minWidth: '2rem', padding: '0 0.5rem' }}
                  onPress={() => {
                    onUpdate('autoSize', 'fixed');
                  }}
                >
                  <Lock size={12} />
                </Button>
                <Button
                  aria-label="Auto Height"
                  size="sm"
                  variant={autoSize === 'auto-height' ? 'secondary' : 'ghost'}
                  style={{ height: '1.75rem', minWidth: '2rem', padding: '0 0.5rem' }}
                  onPress={() => {
                    onUpdate('autoSize', 'auto-height');
                  }}
                >
                  <ArrowDownUp size={12} />
                </Button>
                <Button
                  aria-label="Shrink to Fit"
                  size="sm"
                  variant={autoSize === 'shrink-to-fit' ? 'secondary' : 'ghost'}
                  style={{ height: '1.75rem', minWidth: '2rem', padding: '0 0.5rem' }}
                  onPress={() => {
                    onUpdate('autoSize', 'shrink-to-fit');
                  }}
                >
                  <Minimize2 size={12} />
                </Button>
              </ButtonGroup>
            }
          />
        : null}
      </div>

      <PropertyField propertyKey="rotation" defaultValue={rotation}>
        <AxisTriplet label="Rotation" unit="°" axes={rotationAxes} />
      </PropertyField>

      <FieldRow
        label="Anchor"
      >
        <div style={{ alignItems: 'center', display: 'flex', gap: sp('sp-02'), minWidth: 0 }}>
          <AnchorPad
            anchorX={activeAnchorX}
            anchorY={activeAnchorY}
            onChange={({ x: nextAx, y: nextAy }) => {
              if (nextAx !== activeAnchorX) {
                setActiveAnchorX(nextAx);
                onUpdate('anchorX', nextAx);
              }

              if (nextAy !== activeAnchorY) {
                setActiveAnchorY(nextAy);
                onUpdate('anchorY', nextAy);
              }
            }}
          />
          <span style={{ color: color('foreground'), fontSize: font('label'), textTransform: 'capitalize' }}>
            {anchorLabel.toLowerCase()}
          </span>
        </div>
      </FieldRow>
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

  return (
    <section
      aria-label="Appearance"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04'), minWidth: 0, width: '100%' }}
    >
      <FieldRow
        label="Fill"
        trailing={
          showGradient === true ?
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
          : undefined
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), minWidth: 0, width: '100%' }}>
          {fillMode === 'solid' ?
            <PropertyField propertyKey="backgroundColor" defaultValue={backgroundColor}>
              <ColorInput
                label="Fill color"
                value={backgroundColor}
                onChange={(v) => {
                  onUpdate('backgroundColor', v);
                }}
              />
            </PropertyField>
          : null}
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
        </div>
      </FieldRow>

      <FieldRow
        label="Opacity"
        trailing={<span style={{ color: color('muted'), fontSize: font('label') }}>{opacityPercent}</span>}
      >
        <PropertyField propertyKey="opacity" defaultValue={opacity}>
          <Slider
            aria-label="Opacity"
            maxValue={100}
            minValue={0}
            step={1}
            value={Math.round(opacity * 100)}
            onChange={(v: number | readonly number[]) => {
              const percent = typeof v === 'number' ? v : (v[0] ?? 0);

              onUpdate('opacity', percent / 100);
            }}
            style={{ width: '100%' }}
          >
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
        </PropertyField>
      </FieldRow>

      <FieldRow label="Border">
        <div
          style={{
            background: color('field-background'),
            border: `1px solid ${color('border')}`,
            borderRadius: '0.375rem',
            display: 'grid',
            gap: sp('sp-02'),
            gridTemplateColumns: '4.25rem minmax(0, 1fr)',
            minWidth: 0,
            padding: sp('sp-02'),
            rowGap: sp('sp-02'),
          }}
        >
          <span style={borderRowLabelStyle()}>Width</span>
          <PropertyField propertyKey="borderWidth" defaultValue={borderWidth}>
            <NumField
              compact
              label="Border width"
              value={borderWidth}
              min={0}
              onChange={(v) => {
                onUpdate('borderWidth', v);
              }}
            />
          </PropertyField>
          <span style={borderRowLabelStyle()}>Color</span>
          <PropertyField propertyKey="borderColor" defaultValue={borderColor}>
            <ColorInput
              compact
              label="Border color"
              value={borderColor}
              onChange={(v) => {
                onUpdate('borderColor', v);
              }}
            />
          </PropertyField>
          <span style={borderRowLabelStyle()}>Style</span>
          <PropertyField propertyKey="borderStyle" defaultValue={borderStyle}>
            <SelectField
              hideLabel
              label="Border style"
              value={borderStyle}
              options={[...BORDER_STYLE_OPTIONS]}
              onUpdate={onUpdate}
              updateKey="borderStyle"
            />
          </PropertyField>
        </div>
      </FieldRow>

      <PropertyField propertyKey="borderRadius" defaultValue={borderRadius}>
        <QuadInput
          label="Corner radius"
          mode="corners"
          value={borderRadius}
          min={0}
          onChange={(next) => {
            onUpdate('borderRadius', next);
          }}
          linkToggle={{ isLinked: linkedCorners, onToggle: setLinkedCorners, ariaLabel: 'Link corners' }}
          cellAriaLabels={['Border radius TL', 'Border radius TR', 'Border radius BR', 'Border radius BL']}
        />
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

  return (
    <section
      aria-label="Spacing"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), minWidth: 0, width: '100%' }}
    >
      <QuadInput
        label="Padding"
        mode="TRBL"
        value={padding}
        min={0}
        onChange={(next) => {
          onUpdate('padding', next);
        }}
        linkToggle={{ isLinked: linked, onToggle: setLinked }}
      />
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
    <section
      aria-label="Box Effects"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04'), minWidth: 0, width: '100%' }}
    >
      <FieldRow label="Shadow">
        <ShadowEditor
          label="Box shadow"
          mode="box"
          value={boxShadow}
          onChange={(v) => {
            onUpdate('boxShadow', v);
          }}
        />
      </FieldRow>

      <FieldRow label="Effects">
        <FilterEditor
          label="Filter"
          value={filter}
          onChange={(v) => {
            onUpdate('filter', v);
          }}
        />
      </FieldRow>

      <FieldRow label="Background effects">
        <FilterEditor
          label="Backdrop filter"
          value={backdropFilter}
          onChange={(v) => {
            onUpdate('backdropFilter', v);
          }}
        />
      </FieldRow>

      {documentMode === 'screen' ?
        <FieldRow label="Compositing">
          <div
            style={{
              display: 'grid',
              gap: sp('sp-02'),
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              minWidth: 0,
            }}
          >
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
          </div>
        </FieldRow>
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
    <section
      aria-label="Clip Path"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), minWidth: 0, width: '100%' }}
    >
      <FieldRow label="Mask">
        <div
          style={{
            display: 'grid',
            gap: sp('sp-01'),
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            minWidth: 0,
            width: '100%',
          }}
        >
          {MASK_SHAPE_CHOICES.map((choice) => (
            <Button
              key={choice}
              aria-label={choice}
              aria-pressed={selectedChoice === choice}
              size="sm"
              variant={selectedChoice === choice ? 'secondary' : 'ghost'}
              style={{ height: '2.25rem', minWidth: 0, padding: '0 0.25rem' }}
              onPress={() => {
                applyMaskChoice(choice);
              }}
            >
              <span
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  fontSize: '0.625rem',
                  gap: 2,
                  lineHeight: 1.1,
                }}
              >
                {getMaskIcon(choice)}
                {choice}
              </span>
            </Button>
          ))}
        </div>
      </FieldRow>

      {isCustomChoice ?
        <div style={{ display: 'flex', gap: sp('sp-02'), minWidth: 0 }}>
          <Button
            aria-label="Start editing clip path"
            size="sm"
            variant="primary"
            onPress={() => {
              onStartEditingClipPath?.();
            }}
          >
            Start editing
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
        style={{ alignSelf: 'flex-start' }}
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
