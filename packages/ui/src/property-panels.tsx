import type { BooleanOperation, VerticalAlignment } from '@broadset/model';
import { getCapabilityProfile } from '@broadset/model';
import { Accordion, Button, ButtonGroup, Input, Slider, Switch } from '@heroui/react';
import { ArrowDownUp, GripVertical, Link2, Lock, Minimize2, Plus, Trash2, Unlink2 } from 'lucide-react';
import type { DragEvent as ReactDragEvent, JSX, ReactNode } from 'react';
import { useCallback, useContext, useState } from 'react';

import { ColorInput, CssLengthInput, FilterEditor, NumField, ShadowEditor, TextStrokeInput } from './inputs';
import type { PanelElement, PropertyFieldAdapter, PropertyValue } from './panel-types';
import {
  AdapterContext,
  BOOLEAN_OPERATION_OPTIONS,
  BORDER_STYLE_OPTIONS,
  CLIP_PATH_PRESETS,
  CLOCK_MODES,
  ERROR_CORRECTION_OPTIONS,
  FieldShell,
  FILL_RULE_OPTIONS,
  FONT_STYLE_OPTIONS,
  ICON_SIZE,
  ISOLATION_OPTIONS,
  isValidClipPathCss,
  LINECAP_OPTIONS,
  LINEJOIN_OPTIONS,
  MIX_BLEND_MODE_OPTIONS,
  NumericField,
  OBJECT_FIT_OPTIONS,
  SelectField,
  TEXT_ALIGNMENT_OPTIONS,
  TEXT_DECORATION_OPTIONS,
  TEXT_TRANSFORM_OPTIONS,
  TICKER_DIRECTIONS,
  VERTICAL_ALIGNMENT_OPTIONS,
} from './panel-types';
import { color, font, glassPanelStyle, sp } from './tokens';

/* ------------------------------------------------------------------ */
/*  GeometryPanel                                                      */
/* ------------------------------------------------------------------ */

export interface GeometryPanelProps {
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
  onUpdate,
  documentMode,
}: GeometryPanelProps): JSX.Element {
  const displayX = anchorX === 'right' ? canvasWidth - x - width : x;
  const displayY = anchorY === 'bottom' ? canvasHeight - y - height : y;
  const displayWidth = Math.max(0.1, width);
  const displayHeight = Math.max(0.1, height);
  const isScreenMode = documentMode === 'screen';
  const show3D =
    isScreenMode &&
    (rotateX !== undefined || rotateY !== undefined || rotateZ !== undefined || translateZ !== undefined);

  const showAutoSize = elementType === 'text';
  const isAutoHeight = autoSize === 'auto-height';

  return (
    <section aria-label="Geometry" role="region" className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <NumericField
        label="X"
        value={displayX}
        onValueChange={(v) => {
          onUpdate('x', v);
        }}
      />
      <NumericField
        label="Y"
        value={displayY}
        onValueChange={(v) => {
          onUpdate('y', v);
        }}
      />
      <NumericField
        label="Width"
        value={displayWidth}
        minValue={0.1}
        onValueChange={(v) => {
          onUpdate('width', v);
        }}
      />
      <NumericField
        isDisabled={isAutoHeight}
        label="Height"
        value={displayHeight}
        minValue={0.1}
        onValueChange={(v) => {
          onUpdate('height', v);
        }}
      />
      <NumericField
        label="Rotation"
        value={rotation}
        onValueChange={(v) => {
          onUpdate('rotation', v);
        }}
      />
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
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  AppearancePanel                                                    */
/* ------------------------------------------------------------------ */

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
  readonly onUpdate: (key: string, value: string | number) => void;
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
  return (
    <section aria-label="Appearance" role="region" className="flex flex-col gap-2">
      <ColorInput
        label="Fill color"
        value={backgroundColor}
        onChange={(v) => {
          onUpdate('backgroundColor', v);
        }}
      />
      {showGradient === true ?
        <FieldShell label="CSS Gradient">
          <Input
            aria-label="CSS Gradient"
            value={backgroundGradient ?? ''}
            onChange={(event) => {
              onUpdate('backgroundGradient', event.currentTarget.value);
            }}
          />
        </FieldShell>
      : null}

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

      <NumField
        label="Border width"
        value={borderWidth}
        min={0}
        onChange={(v) => {
          onUpdate('borderWidth', v);
        }}
      />
      <ColorInput
        label="Border color"
        value={borderColor}
        onChange={(v) => {
          onUpdate('borderColor', v);
        }}
      />

      <SelectField
        label="Border style"
        value={borderStyle}
        options={[...BORDER_STYLE_OPTIONS]}
        onUpdate={onUpdate}
        updateKey="borderStyle"
      />
      <SelectField
        label="Blend mode"
        value={blendMode}
        options={[...MIX_BLEND_MODE_OPTIONS]}
        onUpdate={onUpdate}
        updateKey="blendMode"
      />

      <NumField
        label="Border radius TL"
        value={borderRadius[0]}
        min={0}
        onChange={(v) => {
          onUpdate('borderRadius', v);
        }}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  TypographyPanel                                                    */
/* ------------------------------------------------------------------ */

export interface TypographyPanelProps {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontColor: string;
  readonly fontWeight: number;
  readonly fontStyle: string;
  readonly textAlignment: string;
  readonly verticalAlignment: VerticalAlignment;
  readonly textDecoration: string;
  readonly textTransform: string;
  readonly onUpdate: (key: string, value: string | number) => void;
}

export function TypographyPanel({
  fontFamily,
  fontSize,
  fontColor,
  fontWeight,
  fontStyle,
  textAlignment,
  verticalAlignment,
  textDecoration,
  textTransform,
  onUpdate,
}: TypographyPanelProps): JSX.Element {
  return (
    <section aria-label="Typography" role="region" className="flex flex-col gap-2">
      <FieldShell label="Font family">
        <Input
          aria-label="Font family"
          value={fontFamily}
          onChange={(e) => {
            onUpdate('fontFamily', e.currentTarget.value);
          }}
        />
      </FieldShell>
      <NumField
        label="Font size"
        value={fontSize}
        min={1}
        onChange={(v) => {
          onUpdate('fontSize', v);
        }}
      />
      <ColorInput
        label="Font color"
        value={fontColor}
        onChange={(v) => {
          onUpdate('fontColor', v);
        }}
      />
      <NumField
        label="Font weight"
        value={fontWeight}
        min={100}
        max={900}
        step={100}
        onChange={(v) => {
          onUpdate('fontWeight', v);
        }}
      />
      <SelectField
        label="Font style"
        value={fontStyle}
        options={[...FONT_STYLE_OPTIONS]}
        onUpdate={onUpdate}
        updateKey="fontStyle"
      />
      <SelectField
        label="Text alignment"
        value={textAlignment}
        options={[...TEXT_ALIGNMENT_OPTIONS]}
        onUpdate={onUpdate}
        updateKey="textAlignment"
      />
      <SelectField
        label="Vertical alignment"
        value={verticalAlignment}
        options={[...VERTICAL_ALIGNMENT_OPTIONS]}
        onUpdate={onUpdate}
        updateKey="verticalAlignment"
      />
      <SelectField
        label="Text decoration"
        value={textDecoration || 'none'}
        options={['none', ...TEXT_DECORATION_OPTIONS.filter((d) => d !== '')]}
        onUpdate={onUpdate}
        updateKey="textDecoration"
      />
      <SelectField
        label="Text transform"
        value={textTransform}
        options={[...TEXT_TRANSFORM_OPTIONS]}
        onUpdate={onUpdate}
        updateKey="textTransform"
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  TextEffectsPanel                                                   */
/* ------------------------------------------------------------------ */

export interface TextEffectsPanelProps {
  readonly letterSpacing: number;
  readonly lineHeight: string;
  readonly wordSpacing: number;
  readonly textStroke: string;
  readonly textShadow: string;
  readonly textTransform: string;
  readonly onUpdate: (key: string, value: string | number) => void;
}

export function TextEffectsPanel({
  letterSpacing,
  lineHeight,
  wordSpacing,
  textStroke,
  textShadow,
  onUpdate,
}: TextEffectsPanelProps): JSX.Element {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <section aria-label="Text Effects" role="region" className="flex flex-col gap-2">
      <CssLengthInput
        label="Letter spacing"
        value={String(letterSpacing)}
        onChange={(v) => {
          onUpdate('letterSpacing', v);
        }}
      />
      <CssLengthInput
        label="Line height"
        value={lineHeight}
        onChange={(v) => {
          onUpdate('lineHeight', v);
        }}
      />
      <CssLengthInput
        label="Word spacing"
        value={String(wordSpacing)}
        onChange={(v) => {
          onUpdate('wordSpacing', v);
        }}
      />

      <Button
        aria-label="Advanced"
        size="sm"
        variant="ghost"
        onPress={() => {
          setShowAdvanced((s) => !s);
        }}
      >
        Advanced
      </Button>

      {showAdvanced ?
        <>
          <TextStrokeInput
            label="Text stroke"
            width={textStroke ? parseInt(textStroke, 10) : 0}
            color={textStroke.split(' ')[1] ?? '#000000'}
            onChange={(v) => {
              onUpdate('textStroke', v);
            }}
          />
          <ShadowEditor
            label="Text shadow"
            mode="text"
            value={textShadow}
            onChange={(v) => {
              onUpdate('textShadow', v);
            }}
          />
        </>
      : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  SpacingPanel                                                       */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  BoxEffectsPanel                                                    */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  ClipPathPanel                                                      */
/* ------------------------------------------------------------------ */

export interface ClipPathPanelProps {
  readonly maskType: string;
  readonly customClipPath: string;
  readonly onUpdate: (key: string, value: string | number) => void;
}

export function ClipPathPanel({ maskType, customClipPath, onUpdate }: ClipPathPanelProps): JSX.Element {
  const [rawValue, setRawValue] = useState(customClipPath);
  const [error, setError] = useState('');

  return (
    <section aria-label="Clip Path" role="region" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {CLIP_PATH_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            aria-label={preset.label}
            size="sm"
            variant={maskType === preset.maskType && customClipPath === preset.value ? 'primary' : 'ghost'}
            onPress={() => {
              onUpdate('customClipPath', preset.value);
              onUpdate('maskType', preset.maskType);
              setRawValue(preset.value);
              setError('');
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <FieldShell label="Clip path CSS">
        <Input
          aria-label="Clip path"
          value={rawValue}
          onChange={(e) => {
            setRawValue(e.currentTarget.value);
            setError('');
          }}
          onBlur={() => {
            const trimmed = rawValue.trim();

            if (trimmed === '' || isValidClipPathCss(trimmed)) {
              onUpdate('customClipPath', trimmed);
              setError('');
            } else {
              setError('Invalid clip-path CSS');
            }
          }}
        />
      </FieldShell>
      {error !== '' ?
        <p role="alert" style={{ color: color('danger'), fontSize: font('body-compact'), margin: 0 }}>
          {error}
        </p>
      : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  PathPropertiesPanel                                                */
/* ------------------------------------------------------------------ */

export interface PathPropertiesPanelProps {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeOpacity: number;
  readonly strokeDasharray: string;
  readonly strokeDashoffset: number;
  readonly strokeLinecap: string;
  readonly strokeLinejoin: string;
  readonly fill: string;
  readonly fillOpacity: number;
  readonly fillRule: string;
  readonly trimStart: number;
  readonly trimEnd: number;
  readonly trimOffset: number;
  readonly content: string;
  readonly onUpdate: (key: string, value: string | number) => void;
  readonly onStartDrawing: () => void;
  readonly onStopDrawing: () => void;
  readonly onStartEditing: () => void;
  readonly onStopEditing: () => void;
  readonly isDrawing: boolean;
  readonly isEditing: boolean;
}

export function PathPropertiesPanel({
  stroke,
  strokeWidth,
  strokeOpacity,
  strokeDasharray,
  strokeDashoffset,
  strokeLinecap,
  strokeLinejoin,
  fill,
  fillOpacity,
  fillRule,
  trimStart,
  trimEnd,
  trimOffset,
  content,
  onUpdate,
  onStartDrawing,
  onStopDrawing,
  onStartEditing,
  onStopEditing,
  isDrawing,
  isEditing,
}: PathPropertiesPanelProps): JSX.Element {
  const hasContent = content.trim().length > 0;

  return (
    <section aria-label="Path Properties" role="region" className="flex flex-col gap-2">
      <ColorInput
        label="Stroke color"
        value={stroke}
        onChange={(v) => {
          onUpdate('stroke', v);
        }}
      />
      <NumField
        label="Stroke width"
        value={strokeWidth}
        min={0}
        onChange={(v) => {
          onUpdate('strokeWidth', v);
        }}
      />
      <NumField
        label="Stroke opacity"
        value={strokeOpacity}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => {
          onUpdate('strokeOpacity', v);
        }}
      />
      <FieldShell label="Stroke dasharray">
        <Input
          aria-label="Stroke dasharray"
          value={strokeDasharray}
          onChange={(e) => {
            onUpdate('strokeDasharray', e.currentTarget.value);
          }}
        />
      </FieldShell>
      <NumField
        label="Stroke dashoffset"
        value={strokeDashoffset}
        onChange={(v) => {
          onUpdate('strokeDashoffset', v);
        }}
      />
      <SelectField
        label="Stroke linecap"
        value={strokeLinecap}
        options={[...LINECAP_OPTIONS]}
        onUpdate={onUpdate}
        updateKey="strokeLinecap"
      />
      <SelectField
        label="Stroke linejoin"
        value={strokeLinejoin}
        options={[...LINEJOIN_OPTIONS]}
        onUpdate={onUpdate}
        updateKey="strokeLinejoin"
      />
      <ColorInput
        label="Fill color"
        value={fill}
        onChange={(v) => {
          onUpdate('fill', v);
        }}
      />
      <NumField
        label="Fill opacity"
        value={fillOpacity}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => {
          onUpdate('fillOpacity', v);
        }}
      />
      <SelectField
        label="Fill rule"
        value={fillRule}
        options={[...FILL_RULE_OPTIONS]}
        onUpdate={onUpdate}
        updateKey="fillRule"
      />

      <Slider
        aria-label="Trim start"
        maxValue={1}
        minValue={0}
        step={0.01}
        value={trimStart}
        onChange={(v: number | readonly number[]) => {
          onUpdate('trimStart', typeof v === 'number' ? v : Number(v));
        }}
      >
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
      </Slider>
      <Slider
        aria-label="Trim end"
        maxValue={1}
        minValue={0}
        step={0.01}
        value={trimEnd}
        onChange={(v: number | readonly number[]) => {
          onUpdate('trimEnd', typeof v === 'number' ? v : Number(v));
        }}
      >
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
      </Slider>
      <Slider
        aria-label="Trim offset"
        maxValue={1}
        minValue={0}
        step={0.01}
        value={trimOffset}
        onChange={(v: number | readonly number[]) => {
          onUpdate('trimOffset', typeof v === 'number' ? v : Number(v));
        }}
      >
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
      </Slider>

      <div className="flex gap-2">
        <Button
          aria-label="Draw path"
          size="sm"
          variant={isDrawing ? 'primary' : 'ghost'}
          onPress={() => {
            if (isDrawing) {
              onStopDrawing();
            } else {
              onStartDrawing();
            }
          }}
        >
          Draw path
        </Button>
        <Button
          aria-label="Edit path points"
          isDisabled={!hasContent}
          size="sm"
          variant={isEditing ? 'primary' : 'ghost'}
          onPress={() => {
            if (isEditing) {
              onStopEditing();
            } else {
              onStartEditing();
            }
          }}
        >
          Edit path points
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  ImagePanel                                                         */
/* ------------------------------------------------------------------ */

export interface ImagePanelProps {
  readonly content: string;
  readonly onUpdate: (key: string, value: string | number) => void;
}

export function ImagePanel({ content, onUpdate }: ImagePanelProps): JSX.Element {
  return (
    <section aria-label="Image" role="region" className="flex flex-col gap-2">
      <FieldShell label="Source URL">
        <Input
          aria-label="Source URL"
          value={content}
          onChange={(e) => {
            onUpdate('content', e.currentTarget.value);
          }}
        />
      </FieldShell>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  ObjectFitPanel                                                     */
/* ------------------------------------------------------------------ */

export interface ObjectFitPanelProps {
  readonly objectFit: string;
  readonly onUpdate: (key: string, value: string | number) => void;
}

export function ObjectFitPanel({ objectFit, onUpdate }: ObjectFitPanelProps): JSX.Element {
  return (
    <section aria-label="Object Fit" role="region" className="flex flex-col gap-2">
      <SelectField
        label="Object fit"
        value={objectFit}
        options={[...OBJECT_FIT_OPTIONS]}
        onUpdate={onUpdate}
        updateKey="objectFit"
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  QrCodePanel                                                        */
/* ------------------------------------------------------------------ */

export interface QrCodePanelProps {
  readonly content: string;
  readonly errorCorrection: string;
  readonly foregroundColor: string;
  readonly backgroundColor: string;
  readonly onUpdate: (key: string, value: string | number) => void;
}

export function QrCodePanel({
  content,
  errorCorrection,
  foregroundColor,
  backgroundColor,
  onUpdate,
}: QrCodePanelProps): JSX.Element {
  return (
    <section aria-label="QR Code" role="region" className="flex flex-col gap-2">
      <FieldShell label="Content">
        <Input
          aria-label="Content"
          value={content}
          onChange={(e) => {
            onUpdate('content', e.currentTarget.value);
          }}
        />
      </FieldShell>
      <SelectField
        label="Error correction"
        value={errorCorrection}
        options={[...ERROR_CORRECTION_OPTIONS]}
        onUpdate={onUpdate}
        updateKey="errorCorrection"
      />
      <ColorInput
        label="Foreground color"
        value={foregroundColor}
        onChange={(v) => {
          onUpdate('qrForegroundColor', v);
        }}
      />
      <ColorInput
        label="Background color"
        value={backgroundColor}
        onChange={(v) => {
          onUpdate('qrBackgroundColor', v);
        }}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  GroupPanel                                                         */
/* ------------------------------------------------------------------ */

export interface GroupPanelProps {
  readonly name: string;
  readonly clipChildren: boolean;
  readonly booleanOperation: BooleanOperation | null;
  readonly onUpdate: (key: string, value: PropertyValue) => void;
}

export function GroupPanel({ name, clipChildren, booleanOperation, onUpdate }: GroupPanelProps): JSX.Element {
  return (
    <section aria-label="Group" role="region" className="flex flex-col gap-2">
      <FieldShell label="Group name">
        <Input
          aria-label="Group name"
          value={name}
          onChange={(e) => {
            onUpdate('name', e.currentTarget.value);
          }}
        />
      </FieldShell>
      <SelectField
        label="Boolean operation"
        value={booleanOperation ?? 'none'}
        options={[...BOOLEAN_OPERATION_OPTIONS]}
        onUpdate={(key, v) => {
          onUpdate(key, v === 'none' ? '' : v);
        }}
        updateKey="booleanOperation"
      />
      <Switch
        aria-label="Clip children"
        isSelected={clipChildren}
        onChange={(v) => {
          onUpdate('clipChildren', v);
        }}
      >
        Clip children
      </Switch>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  PreflightPanel                                                     */
/* ------------------------------------------------------------------ */

export interface PreflightIssue {
  readonly id: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly elementName?: string | undefined;
  readonly ruleId?: string | undefined;
}

export interface PreflightPanelProps {
  readonly issues: readonly PreflightIssue[];
}

export function PreflightPanel({ issues }: PreflightPanelProps): JSX.Element {
  if (issues.length === 0) {
    return (
      <section aria-label="Preflight" role="region" className="flex flex-col gap-2">
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>No issues found</p>
      </section>
    );
  }

  return (
    <section aria-label="Preflight" role="region" className="flex flex-col gap-2">
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {issues.map((issue) => (
          <li
            key={issue.id}
            style={{
              fontSize: font('body-compact'),
              color: issue.severity === 'error' ? color('danger') : color('foreground'),
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              padding: `${sp('sp-01')} 0`,
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {issue.ruleId !== undefined && issue.ruleId !== '' ? `[${issue.ruleId}] ` : ''}
              {issue.elementName !== undefined && issue.elementName !== '' ? `${issue.elementName}: ` : ''}
              {issue.message}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  PropertyField (keyframe integration)                               */
/* ------------------------------------------------------------------ */

export interface PropertyFieldProps {
  readonly propertyKey: string;
  readonly adapter?: PropertyFieldAdapter | undefined;
  readonly children: ReactNode;
}

export function PropertyField({ propertyKey, adapter, children }: PropertyFieldProps): JSX.Element {
  const contextAdapter = useContext(AdapterContext);
  const active = adapter ?? contextAdapter;

  if (active === null) {
    return <div data-property-key={propertyKey}>{children}</div>;
  }

  const included = active.isIncluded(propertyKey);
  const currentValue = active.getValue(propertyKey);

  return (
    <div data-property-key={propertyKey} data-disabled={!included ? '' : undefined}>
      {children}
      <Button
        aria-label={included ? 'Remove' : 'Include'}
        size="sm"
        variant="ghost"
        onPress={() => {
          active.toggleProperty(propertyKey, !included, currentValue);
        }}
      >
        {included ? 'Remove' : 'Include'}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AnimationModePropertiesPanel                                       */
/* ------------------------------------------------------------------ */

export interface AnimationModePropertiesPanelProps {
  readonly element: PanelElement;
  readonly adapter: PropertyFieldAdapter;
  readonly documentMode: 'screen' | 'print';
  readonly onUpdate: (key: string, value: string | number) => void;
}

export function AnimationModePropertiesPanel({
  element,
  adapter,
  documentMode,
  onUpdate,
}: AnimationModePropertiesPanelProps): JSX.Element {
  const profile = getCapabilityProfile(element.type);

  return (
    <aside aria-label="Animation Properties" role="region" className="p-3" style={glassPanelStyle()}>
      <AdapterContext.Provider value={adapter}>
        <Accordion allowsMultipleExpanded defaultExpandedKeys={['geometry']}>
          <Accordion.Item id="geometry">
            <Accordion.Heading>
              <Accordion.Trigger>Geometry</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <GeometryPanel
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                rotation={element.rotation}
                onUpdate={onUpdate}
                documentMode={documentMode}
              />
            </Accordion.Panel>
          </Accordion.Item>

          {profile.typography ?
            <Accordion.Item id="typography">
              <Accordion.Heading>
                <Accordion.Trigger>Typography</Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <TypographyPanel
                  fontFamily={element.fontFamily}
                  fontSize={element.fontSize}
                  fontColor={element.fontColor}
                  fontWeight={element.fontWeight}
                  fontStyle={element.fontStyle}
                  textAlignment={element.textAlignment}
                  verticalAlignment={element.verticalAlignment}
                  textDecoration={element.textDecoration}
                  textTransform={element.textTransform}
                  onUpdate={onUpdate}
                />
              </Accordion.Panel>
            </Accordion.Item>
          : null}

          {profile.appearance ?
            <Accordion.Item id="appearance">
              <Accordion.Heading>
                <Accordion.Trigger>Appearance</Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <AppearancePanel
                  backgroundColor={element.backgroundColor}
                  borderWidth={element.borderWidth}
                  borderColor={element.borderColor}
                  borderStyle={element.borderStyle}
                  borderRadius={element.borderRadius}
                  opacity={element.opacity}
                  blendMode={element.blendMode}
                  onUpdate={onUpdate}
                />
              </Accordion.Panel>
            </Accordion.Item>
          : null}
        </Accordion>
      </AdapterContext.Provider>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  VideoPanel — source URL, autoplay, loop, muted, start/end time     */
/* ------------------------------------------------------------------ */

export interface VideoPanelProps {
  readonly sourceUrl: string;
  readonly autoplay: boolean;
  readonly loop: boolean;
  readonly muted: boolean;
  readonly startTime: number;
  readonly endTime: number;
  readonly onUpdate: (key: string, value: string | number | boolean) => void;
}

export function VideoPanel({
  sourceUrl,
  autoplay,
  loop,
  muted,
  startTime,
  endTime,
  onUpdate,
}: VideoPanelProps): JSX.Element {
  return (
    <section aria-label="Video" role="region" className="grid grid-cols-1 gap-2">
      <FieldShell label="Source URL">
        <Input
          aria-label="Source URL"
          value={sourceUrl}
          onChange={(e) => {
            onUpdate('content', e.currentTarget.value);
          }}
        />
      </FieldShell>
      <Switch
        aria-label="Autoplay"
        isSelected={autoplay}
        onChange={(v) => {
          onUpdate('autoplay', v);
        }}
      >
        Autoplay
      </Switch>
      <Switch
        aria-label="Loop"
        isSelected={loop}
        onChange={(v) => {
          onUpdate('loop', v);
        }}
      >
        Loop
      </Switch>
      <Switch
        aria-label="Muted"
        isSelected={muted}
        onChange={(v) => {
          onUpdate('muted', v);
        }}
      >
        Muted
      </Switch>
      <NumericField
        label="Start Time (s)"
        minValue={0}
        value={startTime}
        onValueChange={(v) => {
          onUpdate('startTime', v);
        }}
      />
      <NumericField
        label="End Time (s)"
        minValue={0}
        value={endTime}
        onValueChange={(v) => {
          onUpdate('endTime', v);
        }}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  ClockPanel — format, mode, mode-dependent fields                   */
/* ------------------------------------------------------------------ */

export interface ClockPanelProps {
  readonly format: string;
  readonly mode: string;
  readonly startValue: string;
  readonly targetValue: string;
  readonly countdownTo: string;
  readonly onUpdate: (key: string, value: string) => void;
}

export function ClockPanel({
  format,
  mode,
  startValue,
  targetValue,
  countdownTo,
  onUpdate,
}: ClockPanelProps): JSX.Element {
  const isCountdown = mode === 'countdown';
  const isCountdownOrCountup = mode === 'countdown' || mode === 'countup' || mode === 'stopwatch';
  const hasAbsoluteCountdown = isCountdown && countdownTo !== '';

  return (
    <section aria-label="Clock" role="region" className="grid grid-cols-1 gap-2">
      <FieldShell label="Format">
        <Input
          aria-label="Format"
          value={format}
          onChange={(e) => {
            onUpdate('content', e.currentTarget.value);
          }}
        />
      </FieldShell>
      <SelectField
        label="Mode"
        options={CLOCK_MODES as unknown as readonly string[]}
        updateKey="mode"
        value={mode}
        onUpdate={(_key, value) => {
          onUpdate('mode', String(value));
        }}
      />
      {isCountdownOrCountup && !hasAbsoluteCountdown ?
        <FieldShell label="Start Value">
          <Input
            aria-label="Start Value"
            value={startValue}
            onChange={(e) => {
              onUpdate('startValue', e.currentTarget.value);
            }}
          />
        </FieldShell>
      : null}
      {isCountdown && !hasAbsoluteCountdown ?
        <FieldShell label="Target Value">
          <Input
            aria-label="Target Value"
            value={targetValue}
            onChange={(e) => {
              onUpdate('targetValue', e.currentTarget.value);
            }}
          />
        </FieldShell>
      : null}
      {isCountdown ?
        <FieldShell label="Countdown To">
          <Input
            aria-label="Countdown To"
            value={countdownTo}
            onChange={(e) => {
              onUpdate('countdownTo', e.currentTarget.value);
            }}
          />
        </FieldShell>
      : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  TickerPanel — items list, speed, direction, gap, paused            */
/* ------------------------------------------------------------------ */

export interface TickerPanelProps {
  readonly items: readonly string[];
  readonly speed: number;
  readonly direction: string;
  readonly gap: number;
  readonly paused: boolean;
  readonly onUpdate: (key: string, value: string | number | boolean) => void;
  readonly onUpdateItems: (items: readonly string[]) => void;
}

export function TickerPanel({
  items,
  speed,
  direction,
  gap,
  paused,
  onUpdate,
  onUpdateItems,
}: TickerPanelProps): JSX.Element {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function handleItemDragStart(e: ReactDragEvent<HTMLDivElement>, index: number): void {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';

    // Use transparent 1×1 image as drag ghost
    const ghost = document.createElement('canvas');

    ghost.width = 1;
    ghost.height = 1;
    e.dataTransfer.setDragImage(ghost, 0, 0);
  }

  function handleItemDragOver(e: ReactDragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleItemDrop(targetIndex: number): void {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);

      return;
    }

    const reordered = [...items];

    const [moved] = reordered.splice(dragIndex, 1);

    if (moved !== undefined) {
      reordered.splice(targetIndex, 0, moved);
      onUpdateItems(reordered);
    }

    setDragIndex(null);
  }

  return (
    <section aria-label="Ticker" role="region" className="grid grid-cols-1 gap-2">
      <FieldShell label="Items">
        <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
          {items.map((item, index) => (
            <div
              key={`${String(index)}-${item}`}
              draggable
              style={{ display: 'flex', gap: sp('sp-02'), alignItems: 'center' }}
              onDragOver={handleItemDragOver}
              onDragStart={(e) => {
                handleItemDragStart(e, index);
              }}
              onDrop={() => {
                handleItemDrop(index);
              }}
            >
              <span
                aria-label={`Drag item ${String(index + 1)}`}
                style={{ cursor: 'grab', display: 'flex', alignItems: 'center' }}
              >
                <GripVertical size={ICON_SIZE} />
              </span>
              <Input
                aria-label={`Item ${String(index + 1)}`}
                value={item}
                onChange={(e) => {
                  const updated = items.map((existing, i) => (i === index ? e.currentTarget.value : existing));

                  onUpdateItems(updated);
                }}
              />
              {items.length > 1 ?
                <Button
                  aria-label={`Remove item ${String(index + 1)}`}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    onUpdateItems(items.filter((_, i) => i !== index));
                  }}
                >
                  <Trash2 size={ICON_SIZE} />
                </Button>
              : null}
            </div>
          ))}
          <Button
            aria-label="Add Item"
            size="sm"
            variant="ghost"
            onPress={() => {
              onUpdateItems([...items, 'New item']);
            }}
          >
            <Plus size={ICON_SIZE} /> Add Item
          </Button>
        </div>
      </FieldShell>
      <NumericField
        label="Speed (px/s)"
        maxValue={2000}
        minValue={1}
        value={speed}
        onValueChange={(v) => {
          onUpdate('speed', v);
        }}
      />
      <SelectField
        label="Direction"
        options={TICKER_DIRECTIONS as unknown as readonly string[]}
        updateKey="direction"
        value={direction}
        onUpdate={(key, value) => {
          onUpdate(key, value);
        }}
      />
      <NumericField
        label="Gap (px)"
        minValue={0}
        value={gap}
        onValueChange={(v) => {
          onUpdate('gap', v);
        }}
      />
      <Switch
        aria-label="Paused"
        isSelected={paused}
        onChange={(v) => {
          onUpdate('paused', v);
        }}
      >
        Paused
      </Switch>
    </section>
  );
}
