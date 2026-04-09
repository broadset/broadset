import { getCapabilityProfile } from '@broadset/model';
import {
  Accordion,
  Button,
  ButtonGroup,
  Input,
  ListBox,
  ListBoxItem,
  NumberField,
  Select,
  Slider,
  Switch,
} from '@heroui/react';
import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Eye,
  EyeOff,
  FileCode2,
  Folder,
  GripVertical,
  Image,
  LetterText,
  Link2,
  Lock,
  Minimize2,
  PenTool,
  Plus,
  QrCode,
  Square,
  Trash2,
  Type,
  Unlink2,
  Unlock,
  Video,
} from 'lucide-react';
import type { DragEvent as ReactDragEvent, JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useState } from 'react';

import { ColorInput, CssLengthInput, FilterEditor, NumField, ShadowEditor, TextStrokeInput } from './inputs';
import { color, font, glassPanelStyle, sp } from './tokens';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ICON_SIZE = 14;

const BORDER_STYLE_OPTIONS = [
  'none',
  'solid',
  'dashed',
  'dotted',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
] as const;

const MIX_BLEND_MODE_OPTIONS = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

const OBJECT_FIT_OPTIONS = ['fill', 'contain', 'cover', 'none', 'scale-down'] as const;

const LINECAP_OPTIONS = ['butt', 'round', 'square'] as const;
const LINEJOIN_OPTIONS = ['miter', 'round', 'bevel'] as const;
const FILL_RULE_OPTIONS = ['nonzero', 'evenodd'] as const;
const ERROR_CORRECTION_OPTIONS = ['L', 'M', 'Q', 'H'] as const;
const TEXT_TRANSFORM_OPTIONS = ['none', 'uppercase', 'lowercase', 'capitalize'] as const;
const TEXT_DECORATION_OPTIONS = ['', 'underline', 'overline', 'line-through'] as const;
const TEXT_ALIGNMENT_OPTIONS = ['left', 'center', 'right', 'justify'] as const;
const FONT_STYLE_OPTIONS = ['normal', 'italic'] as const;
const ISOLATION_OPTIONS = ['auto', 'isolate'] as const;

const CLIP_PATH_PRESETS = [
  { label: 'None', value: '', maskType: 'none' as const },
  { label: 'Circle', value: 'circle(50%)', maskType: 'custom' as const },
  {
    label: 'Squircle',
    value: 'polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%)',
    maskType: 'custom' as const,
  },
  { label: 'Triangle', value: 'polygon(50% 0%, 100% 100%, 0% 100%)', maskType: 'custom' as const },
  {
    label: 'Star',
    value: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
    maskType: 'custom' as const,
  },
] as const;

const LAYER_ICON_MAP = {
  text: Type,
  image: Image,
  svg: FileCode2,
  path: PenTool,
  rectangle: Square,
  ellipse: Circle,
  qrcode: QrCode,
  group: Folder,
  video: Video,
  clock: Clock3,
  ticker: LetterText,
} as const;

/**
 * Validate a raw CSS clip-path value.
 * Accepts common clip-path functions: circle, ellipse, inset, polygon, path, and url().
 */
const CLIP_PATH_FUNCTION_RE = /^(circle|ellipse|inset|polygon|path|url)\s*\([\s\S]+\)$/i;

function isValidClipPathCss(value: string): boolean {
  return CLIP_PATH_FUNCTION_RE.test(value);
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PanelElement {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly content: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly backgroundColor: string;
  readonly backgroundGradient: string;
  readonly borderWidth: number;
  readonly borderColor: string;
  readonly borderStyle: string;
  readonly borderRadius: readonly [number, number, number, number];
  readonly opacity: number;
  readonly blendMode: string;
  readonly mixBlendMode: string;
  readonly isolation: string;
  readonly boxShadow: string;
  readonly filter: string;
  readonly backdropFilter: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontColor: string;
  readonly fontWeight: number;
  readonly fontStyle: string;
  readonly textAlignment: string;
  readonly textDecoration: string;
  readonly textTransform: string;
  readonly letterSpacing: number;
  readonly lineHeight: string;
  readonly wordSpacing: number;
  readonly textStroke: string;
  readonly textShadow: string;
  readonly writingMode: string;
  readonly fontVariationSettings: string;
  readonly padding: readonly [number, number, number, number];
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeDasharray: string;
  readonly strokeDashoffset: number;
  readonly strokeLinecap: string;
  readonly strokeLinejoin: string;
  readonly strokeOpacity: number;
  readonly fill: string;
  readonly fillOpacity: number;
  readonly fillRule: string;
  readonly maskType: string;
  readonly customClipPath: string;
  readonly clipChildren: boolean;
  readonly rotateX: number;
  readonly rotateY: number;
  readonly rotateZ: number;
  readonly translateZ: number;
  readonly objectFit: string;
  readonly autoSize: string;
  readonly errorCorrection: string;
  readonly qrForegroundColor: string;
  readonly qrBackgroundColor: string;
  readonly videoAutoplay?: boolean | undefined;
  readonly videoLoop?: boolean | undefined;
  readonly videoMuted?: boolean | undefined;
  readonly videoStartTime?: number | undefined;
  readonly videoEndTime?: number | undefined;
  readonly clockMode?: string | undefined;
  readonly clockStartValue?: string | undefined;
  readonly clockTargetValue?: string | undefined;
  readonly clockCountdownTo?: string | undefined;
  readonly tickerItems?: readonly string[] | undefined;
  readonly tickerSpeed?: number | undefined;
  readonly tickerDirection?: string | undefined;
  readonly tickerGap?: number | undefined;
  readonly tickerPaused?: boolean | undefined;
}

export interface LayerInfo {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly locked: boolean;
  readonly visible: boolean;
  readonly depth?: number | undefined;
  readonly hasChildren?: boolean | undefined;
  readonly expanded?: boolean | undefined;
}

interface CustomPanelProps {
  readonly element: PanelElement;
  readonly documentMode: 'screen' | 'print';
  readonly onUpdate: (key: string, value: string | number) => void;
}

type CustomPanelComponent = (props: CustomPanelProps) => JSX.Element;

export interface PropertyFieldAdapter {
  readonly isIncluded: (key: string) => boolean;
  readonly getValue: (key: string) => number | string;
  readonly toggleProperty: (key: string, include: boolean, defaultValue: number | string) => void;
  readonly updateValue: (key: string, value: number | string) => void;
}

const AdapterContext = createContext<PropertyFieldAdapter | null>(null);

/* ------------------------------------------------------------------ */
/*  Shared Helpers                                                     */
/* ------------------------------------------------------------------ */

function FieldShell({ label, children }: { readonly label: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ color: color('muted'), fontSize: font('label') }}>{label}</span>
      {children}
    </div>
  );
}

function NumericField({
  label,
  value,
  onValueChange,
  step,
  minValue,
  maxValue,
  isDisabled,
}: {
  readonly label: string;
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  readonly step?: number | undefined;
  readonly minValue?: number | undefined;
  readonly maxValue?: number | undefined;
  readonly isDisabled?: boolean | undefined;
}): JSX.Element {
  return (
    <FieldShell label={label}>
      <NumberField
        aria-label={label}
        isDisabled={isDisabled ?? false}
        value={value}
        onChange={(nextValue) => {
          onValueChange(typeof nextValue === 'number' ? nextValue : Number(nextValue));
        }}
        {...(maxValue !== undefined ? { maxValue } : {})}
        {...(minValue !== undefined ? { minValue } : {})}
        {...(step !== undefined ? { step } : {})}
      >
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
    </FieldShell>
  );
}

function SelectField({
  label,
  value,
  options,
  onUpdate,
  updateKey,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly onUpdate: (key: string, value: string | number) => void;
  readonly updateKey: string;
}): JSX.Element {
  return (
    <FieldShell label={label}>
      <Select
        aria-label={label}
        value={value}
        onChange={(key) => {
          if (key !== null) {
            onUpdate(updateKey, String(key));
          }
        }}
      >
        <Select.Trigger>
          <Select.Value />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {options.map((opt) => (
              <ListBoxItem id={opt} key={opt}>
                {opt}
              </ListBoxItem>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </FieldShell>
  );
}

/** Compute property values for multi-element selection */
function computeMultiValue(
  elements: readonly PanelElement[],
  key: keyof PanelElement,
): { readonly value: PanelElement[keyof PanelElement]; readonly isMixed: boolean } {
  if (elements.length === 0) {
    return { value: '' as PanelElement[keyof PanelElement], isMixed: false };
  }

  const firstEl = elements[0];

  if (firstEl === undefined) {
    return { value: '' as PanelElement[keyof PanelElement], isMixed: false };
  }

  const first = firstEl[key];

  for (let i = 1; i < elements.length; i++) {
    const el = elements[i];

    if (el === undefined) {
      continue;
    }

    const current = el[key];

    if (Array.isArray(first) && Array.isArray(current)) {
      if (first.length !== current.length || first.some((v, idx) => v !== current[idx])) {
        return { value: first, isMixed: true };
      }
    } else if (current !== first) {
      return { value: first, isMixed: true };
    }
  }

  return { value: first, isMixed: false };
}

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
  readonly onUpdate: (key: string, value: PropertyValue) => void;
}

export function GroupPanel({ name, clipChildren, onUpdate }: GroupPanelProps): JSX.Element {
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
            }}
          >
            {issue.message}
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

const CLOCK_MODES = ['realtime', 'countdown', 'countup', 'stopwatch'] as const;

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

const TICKER_DIRECTIONS = ['left', 'right', 'up', 'down'] as const;

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

/* ------------------------------------------------------------------ */
/*  PropertiesSidebar — main panel orchestrator                        */
/* ------------------------------------------------------------------ */

/** Union of all property value types passed through onUpdate callbacks. */
export type PropertyValue = string | number | boolean | readonly [number, number, number, number];

export interface PropertiesSidebarProps {
  readonly elements: readonly PanelElement[];
  readonly documentMode: 'screen' | 'print';
  readonly showAnimations?: boolean | undefined;
  readonly onUpdate: (key: string, value: PropertyValue) => void;
  readonly customPanels?: Readonly<Record<string, CustomPanelComponent>> | undefined;
  readonly onStartDrawing?: (() => void) | undefined;
  readonly onStopDrawing?: (() => void) | undefined;
  readonly onStartEditing?: (() => void) | undefined;
  readonly onStopEditing?: (() => void) | undefined;
  readonly isDrawing?: boolean | undefined;
  readonly isEditing?: boolean | undefined;
}

export function PropertiesSidebar({
  elements,
  documentMode,
  showAnimations,
  onUpdate,
  customPanels,
  onStartDrawing,
  onStopDrawing,
  onStartEditing,
  onStopEditing,
  isDrawing = false,
  isEditing = false,
}: PropertiesSidebarProps): JSX.Element {
  if (elements.length === 0) {
    return (
      <aside aria-label="Properties" role="region" className="p-3" style={glassPanelStyle()}>
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>
          Select an element to edit its properties
        </p>
      </aside>
    );
  }

  const primary = elements[0];

  if (primary === undefined) {
    return (
      <aside aria-label="Properties" role="region" className="p-3" style={glassPanelStyle()}>
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>
          Select an element to edit its properties
        </p>
      </aside>
    );
  }

  const isMulti = elements.length > 1;
  const hasMixedX = isMulti && computeMultiValue(elements, 'x').isMixed;

  const CustomPanel = customPanels?.[primary.type];

  if (CustomPanel !== undefined) {
    return (
      <aside aria-label="Properties" role="region" className="p-3" style={glassPanelStyle()}>
        <CustomPanel documentMode={documentMode} element={primary} onUpdate={onUpdate} />
      </aside>
    );
  }

  const profile = getCapabilityProfile(primary.type);
  const isScreenMode = documentMode === 'screen';
  const showGradient = isScreenMode && primary.type === 'rectangle';
  const isQrCode = primary.type === 'qrcode';
  const isGroup = primary.type === 'group';
  const isImage = primary.type === 'image';
  const isVideo = primary.type === 'video';
  const isClock = primary.type === 'clock';
  const isTicker = primary.type === 'ticker';
  const showSpacing = profile.typography || isGroup;
  const showPathProperties = profile.svgStrokeFill || profile.pathEditing;

  const defaultExpanded = ['geometry', 'appearance'];

  return (
    <aside aria-label="Properties" role="region" className="p-3" style={glassPanelStyle()}>
      {hasMixedX ?
        <p style={{ color: color('muted'), fontSize: font('label') }}>Mixed</p>
      : null}
      <Accordion allowsMultipleExpanded defaultExpandedKeys={defaultExpanded}>
        <Accordion.Item id="geometry">
          <Accordion.Heading>
            <Accordion.Trigger>Geometry</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <GeometryPanel
              x={primary.x}
              y={primary.y}
              width={primary.width}
              height={primary.height}
              rotation={primary.rotation}
              rotateX={primary.rotateX}
              rotateY={primary.rotateY}
              rotateZ={primary.rotateZ}
              translateZ={primary.translateZ}
              autoSize={primary.autoSize}
              elementType={primary.type}
              onUpdate={onUpdate}
              documentMode={documentMode}
            />
          </Accordion.Panel>
        </Accordion.Item>

        {/* 2. Appearance */}
        {profile.appearance ?
          <Accordion.Item id="appearance">
            <Accordion.Heading>
              <Accordion.Trigger>Appearance</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <AppearancePanel
                backgroundColor={primary.backgroundColor}
                backgroundGradient={primary.backgroundGradient}
                showGradient={showGradient}
                borderWidth={primary.borderWidth}
                borderColor={primary.borderColor}
                borderStyle={primary.borderStyle}
                borderRadius={primary.borderRadius}
                opacity={primary.opacity}
                blendMode={primary.blendMode}
                onUpdate={onUpdate}
              />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* 3. Typography */}
        {profile.typography ?
          <Accordion.Item id="typography">
            <Accordion.Heading>
              <Accordion.Trigger>Typography</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <TypographyPanel
                fontFamily={primary.fontFamily}
                fontSize={primary.fontSize}
                fontColor={primary.fontColor}
                fontWeight={primary.fontWeight}
                fontStyle={primary.fontStyle}
                textAlignment={primary.textAlignment}
                textDecoration={primary.textDecoration}
                textTransform={primary.textTransform}
                onUpdate={onUpdate}
              />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* 4. Text Effects */}
        {profile.typography ?
          <Accordion.Item id="text-effects">
            <Accordion.Heading>
              <Accordion.Trigger>Text Effects</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <TextEffectsPanel
                letterSpacing={primary.letterSpacing}
                lineHeight={primary.lineHeight}
                wordSpacing={primary.wordSpacing}
                textStroke={primary.textStroke}
                textShadow={primary.textShadow}
                textTransform={primary.textTransform}
                onUpdate={onUpdate}
              />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* 5. Spacing */}
        {showSpacing ?
          <Accordion.Item id="spacing">
            <Accordion.Heading>
              <Accordion.Trigger>Spacing</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <SpacingPanel padding={primary.padding} onUpdate={onUpdate} />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* 6. Box Effects */}
        {profile.boxEffects ?
          <Accordion.Item id="box-effects">
            <Accordion.Heading>
              <Accordion.Trigger>Box Effects</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <BoxEffectsPanel
                boxShadow={primary.boxShadow}
                filter={primary.filter}
                backdropFilter={primary.backdropFilter}
                mixBlendMode={primary.mixBlendMode}
                isolation={primary.isolation}
                documentMode={documentMode}
                onUpdate={onUpdate}
              />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* 7. Clip Path */}
        {profile.clipPath && isScreenMode ?
          <Accordion.Item id="clip-path">
            <Accordion.Heading>
              <Accordion.Trigger>Clip Path</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <ClipPathPanel maskType={primary.maskType} customClipPath={primary.customClipPath} onUpdate={onUpdate} />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* 8. Path Properties */}
        {showPathProperties ?
          <Accordion.Item id="path-properties">
            <Accordion.Heading>
              <Accordion.Trigger>Path Properties</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <PathPropertiesPanel
                stroke={primary.stroke}
                strokeWidth={primary.strokeWidth}
                strokeOpacity={primary.strokeOpacity}
                strokeDasharray={primary.strokeDasharray}
                strokeDashoffset={primary.strokeDashoffset}
                strokeLinecap={primary.strokeLinecap}
                strokeLinejoin={primary.strokeLinejoin}
                fill={primary.fill}
                fillOpacity={primary.fillOpacity}
                fillRule={primary.fillRule}
                content={primary.content}
                onUpdate={onUpdate}
                onStartDrawing={onStartDrawing ?? (() => undefined)}
                onStopDrawing={onStopDrawing ?? (() => undefined)}
                onStartEditing={onStartEditing ?? (() => undefined)}
                onStopEditing={onStopEditing ?? (() => undefined)}
                isDrawing={isDrawing}
                isEditing={isEditing}
              />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* 9. Image */}
        {isImage ?
          <Accordion.Item id="image">
            <Accordion.Heading>
              <Accordion.Trigger>Image</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <ImagePanel content={primary.content} onUpdate={onUpdate} />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* 10. Object Fit */}
        {profile.objectFit ?
          <Accordion.Item id="object-fit">
            <Accordion.Heading>
              <Accordion.Trigger>Object Fit</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <ObjectFitPanel objectFit={primary.objectFit} onUpdate={onUpdate} />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* 11. QR Code */}
        {isQrCode ?
          <Accordion.Item id="qrcode">
            <Accordion.Heading>
              <Accordion.Trigger>QR Code</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <QrCodePanel
                content={primary.content}
                errorCorrection={primary.errorCorrection}
                foregroundColor={primary.qrForegroundColor}
                backgroundColor={primary.qrBackgroundColor}
                onUpdate={onUpdate}
              />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* 12. Group */}
        {isGroup ?
          <Accordion.Item id="group">
            <Accordion.Heading>
              <Accordion.Trigger>Group</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <GroupPanel name={primary.name} clipChildren={primary.clipChildren} onUpdate={onUpdate} />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* Video */}
        {isVideo ?
          <Accordion.Item id="video">
            <Accordion.Heading>
              <Accordion.Trigger>Video</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <VideoPanel
                sourceUrl={primary.content}
                autoplay={primary.videoAutoplay ?? false}
                loop={primary.videoLoop ?? false}
                muted={primary.videoMuted ?? false}
                startTime={primary.videoStartTime ?? 0}
                endTime={primary.videoEndTime ?? 0}
                onUpdate={onUpdate}
              />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* Clock */}
        {isClock ?
          <Accordion.Item id="clock">
            <Accordion.Heading>
              <Accordion.Trigger>Clock</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <ClockPanel
                format={primary.content}
                mode={primary.clockMode ?? 'realtime'}
                startValue={primary.clockStartValue ?? ''}
                targetValue={primary.clockTargetValue ?? ''}
                countdownTo={primary.clockCountdownTo ?? ''}
                onUpdate={onUpdate}
              />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* Ticker */}
        {isTicker ?
          <Accordion.Item id="ticker">
            <Accordion.Heading>
              <Accordion.Trigger>Ticker</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <TickerPanel
                items={primary.tickerItems ?? ['New item']}
                speed={primary.tickerSpeed ?? 100}
                direction={primary.tickerDirection ?? 'left'}
                gap={primary.tickerGap ?? 20}
                paused={primary.tickerPaused ?? false}
                onUpdate={onUpdate}
                onUpdateItems={(items) => {
                  onUpdate('tickerItems', JSON.stringify(items));
                }}
              />
            </Accordion.Panel>
          </Accordion.Item>
        : null}

        {/* 13. Animation Builder — rendered when showAnimations is enabled */}
        {showAnimations === true ?
          <Accordion.Item id="animation-builder">
            <Accordion.Heading>
              <Accordion.Trigger>Animation Builder</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <section aria-label="Animation Builder" role="region" className="flex flex-col gap-2">
                <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>
                  Animation builder controls
                </p>
              </section>
            </Accordion.Panel>
          </Accordion.Item>
        : null}
      </Accordion>
    </aside>
  );
}

export interface LayersSidebarProps {
  readonly layers: readonly LayerInfo[];
  readonly selectedIds?: readonly string[] | undefined;
  readonly scenes?: readonly { readonly id: string; readonly name: string }[] | undefined;
  readonly activeSceneId?: string | undefined;
  readonly onSelectScene?: ((id: string) => void) | undefined;
  readonly onAddScene?: (() => void) | undefined;
  readonly onSelect: (id: string, mode: 'single' | 'toggle' | 'range') => void;
  readonly onToggleLock: (id: string) => void;
  readonly onToggleVisibility?: ((id: string) => void) | undefined;
  readonly onDelete: (id: string) => void;
  readonly onRename?: ((id: string, name: string) => void) | undefined;
  readonly onToggleExpand?: ((id: string) => void) | undefined;
  readonly onReorder?:
    | ((dragId: string, targetId: string, position: 'before' | 'inside' | 'after') => void)
    | undefined;
}

const INDENT_PER_LEVEL = 16;

export function LayersSidebar({
  layers,
  selectedIds = [],
  scenes,
  activeSceneId,
  onSelectScene,
  onAddScene,
  onSelect,
  onToggleLock,
  onToggleVisibility,
  onDelete,
  onRename,
  onToggleExpand,
  onReorder,
}: LayersSidebarProps): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    readonly id: string;
    readonly position: 'before' | 'inside' | 'after';
  } | null>(null);

  const startRename = useCallback((id: string, name: string) => {
    setEditingId(id);
    setEditValue(name);
  }, []);
  const commitRename = useCallback(
    (id: string) => {
      const trimmed = editValue.trim();

      if (trimmed !== '' && onRename !== undefined) {
        onRename(id, trimmed);
      }

      setEditingId(null);
      setEditValue('');
    },
    [editValue, onRename],
  );

  const handleClick = useCallback(
    (id: string, event: React.MouseEvent) => {
      if (event.shiftKey) {
        onSelect(id, 'range');
      } else if (event.metaKey || event.ctrlKey) {
        onSelect(id, 'toggle');
      } else {
        onSelect(id, 'single');
      }
    },
    [onSelect],
  );

  const handleDragStart = useCallback((id: string, event: React.DragEvent) => {
    setDragId(id);

    // Use 1x1 transparent image as drag ghost
    const ghost = document.createElement('canvas');

    ghost.width = 1;
    ghost.height = 1;
    event.dataTransfer.setDragImage(ghost, 0, 0);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  /** Check whether targetId is a descendant of dragSourceId in the flat layer list */
  const isDescendant = useCallback(
    (dragSourceId: string, targetId: string): boolean => {
      const sourceIndex = layers.findIndex((l) => l.id === dragSourceId);

      if (sourceIndex < 0) {
        return false;
      }

      const sourceDepth = layers[sourceIndex]?.depth ?? 0;

      // Walk forward from the source — all immediately following layers with greater depth are descendants
      for (let i = sourceIndex + 1; i < layers.length; i++) {
        const layer = layers[i];

        if (layer === undefined) {
          break;
        }

        if ((layer.depth ?? 0) <= sourceDepth) {
          break; // Out of the subtree
        }

        if (layer.id === targetId) {
          return true;
        }
      }

      return false;
    },
    [layers],
  );

  const handleDragOver = useCallback(
    (targetId: string, event: React.DragEvent) => {
      event.preventDefault();

      if (dragId === null || dragId === targetId) {
        return;
      }

      // Reject drops into own descendants
      if (isDescendant(dragId, targetId)) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const third = rect.height / 3;

      let position: 'before' | 'inside' | 'after';

      if (y < third) {
        position = 'before';
      } else if (y > third * 2) {
        position = 'after';
      } else {
        position = 'inside';
      }

      setDropTarget({ id: targetId, position });
    },
    [dragId, isDescendant],
  );

  const handleDrop = useCallback(
    (targetId: string) => {
      if (dragId !== null && onReorder !== undefined && dropTarget !== null) {
        onReorder(dragId, targetId, dropTarget.position);
      }

      setDragId(null);
      setDropTarget(null);
    },
    [dragId, dropTarget, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTarget(null);
  }, []);

  const scenesSection =
    scenes !== undefined && scenes.length > 0 ?
      <div
        style={{ display: 'flex', gap: sp('sp-02'), marginBottom: sp('sp-03'), alignItems: 'center', flexWrap: 'wrap' }}
      >
        {scenes.map((scene) => (
          <Button
            key={scene.id}
            aria-label={`Scene ${scene.name}`}
            size="sm"
            variant={activeSceneId === scene.id ? 'secondary' : 'ghost'}
            onPress={() => {
              onSelectScene?.(scene.id);
            }}
          >
            {scene.name}
          </Button>
        ))}
        {onAddScene !== undefined ?
          <Button aria-label="Add Scene" size="sm" variant="ghost" onPress={onAddScene}>
            + Add Scene
          </Button>
        : null}
      </div>
    : null;

  if (layers.length === 0) {
    return (
      <aside aria-label="Layers" role="region" className="p-3" style={glassPanelStyle()}>
        {scenesSection}
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>No elements</p>
      </aside>
    );
  }

  return (
    <aside aria-label="Layers" role="region" className="p-3" style={glassPanelStyle()}>
      {scenesSection}{' '}
      <ul style={{ display: 'grid', gap: sp('sp-02'), listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto' }}>
        {layers.map((layer) => {
          const LayerIcon =
            layer.type in LAYER_ICON_MAP ? LAYER_ICON_MAP[layer.type as keyof typeof LAYER_ICON_MAP] : Square;
          const isSelected = selectedIds.includes(layer.id);
          const isHovered = hoveredId === layer.id;
          const depth = layer.depth ?? 0;
          const isDropBefore = dropTarget?.id === layer.id && dropTarget.position === 'before';
          const isDropInside = dropTarget?.id === layer.id && dropTarget.position === 'inside';
          const isDropAfter = dropTarget?.id === layer.id && dropTarget.position === 'after';

          let bgColor = 'transparent';

          if (isSelected) {
            bgColor = color('surface-secondary');
          } else if (isDropInside) {
            bgColor = color('surface-secondary');
          } else if (isHovered) {
            bgColor = color('surface');
          }

          return (
            <li
              key={layer.id}
              onMouseEnter={() => {
                setHoveredId(layer.id);
              }}
              onMouseLeave={() => {
                setHoveredId(null);
              }}
              onDragOver={(e) => {
                handleDragOver(layer.id, e);
              }}
              onDrop={() => {
                handleDrop(layer.id);
              }}
              style={{
                alignItems: 'center',
                backgroundColor: bgColor,
                borderRadius: '0.75rem',
                borderTop: isDropBefore ? `2px solid ${color('accent')}` : undefined,
                borderBottom: isDropAfter ? `2px solid ${color('accent')}` : undefined,
                display: 'grid',
                gap: sp('sp-02'),
                gridTemplateColumns: 'auto auto auto 1fr auto auto auto',
                padding: `${sp('sp-02')} ${sp('sp-03')}`,
                paddingLeft: depth > 0 ? `calc(${sp('sp-03')} + ${String(depth * INDENT_PER_LEVEL)}px)` : sp('sp-03'),
              }}
            >
              {/* Grip handle for drag initiation */}
              <span
                draggable
                aria-label={`Drag ${layer.name}`}
                role="img"
                style={{ cursor: 'grab', display: 'flex' }}
                onDragStart={(e) => {
                  handleDragStart(layer.id, e);
                }}
                onDragEnd={handleDragEnd}
              >
                <GripVertical size={ICON_SIZE} />
              </span>

              {/* Expand/collapse chevron for groups */}
              {layer.hasChildren === true ?
                <Button
                  aria-label={layer.expanded === true ? `Collapse ${layer.name}` : `Expand ${layer.name}`}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    onToggleExpand?.(layer.id);
                  }}
                >
                  {layer.expanded === true ?
                    <ChevronDown size={ICON_SIZE} />
                  : <ChevronRight size={ICON_SIZE} />}
                </Button>
              : <span style={{ width: ICON_SIZE + 8 }} />}

              <LayerIcon size={ICON_SIZE} />

              {editingId === layer.id ?
                <Input
                  aria-label="Rename layer"
                  value={editValue}
                  onBlur={() => {
                    commitRename(layer.id);
                  }}
                  onChange={(event) => {
                    setEditValue(event.currentTarget.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitRename(layer.id);
                    }

                    if (event.key === 'Escape') {
                      setEditingId(null);
                      setEditValue('');
                    }
                  }}
                />
              : <span
                  aria-label={`Select ${layer.name}`}
                  role="button"
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  tabIndex={0}
                  onClick={(e) => {
                    handleClick(layer.id, e);
                  }}
                  onDoubleClick={() => {
                    startRename(layer.id, layer.name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();

                      if (e.shiftKey) {
                        onSelect(layer.id, 'range');
                      } else if (e.metaKey || e.ctrlKey) {
                        onSelect(layer.id, 'toggle');
                      } else {
                        onSelect(layer.id, 'single');
                      }
                    }
                  }}
                >
                  <span style={{ color: color('foreground'), fontSize: font('body-compact') }}>{layer.name}</span>
                </span>
              }

              {onToggleVisibility !== undefined ?
                <Button
                  aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    onToggleVisibility(layer.id);
                  }}
                >
                  {layer.visible ?
                    <Eye size={ICON_SIZE} />
                  : <EyeOff size={ICON_SIZE} />}
                </Button>
              : null}

              <Button
                aria-label={`Toggle lock ${layer.name}`}
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() => {
                  onToggleLock(layer.id);
                }}
              >
                {layer.locked ?
                  <Lock size={ICON_SIZE} />
                : <Unlock size={ICON_SIZE} />}
              </Button>

              <Button
                aria-label={`Delete ${layer.name}`}
                isIconOnly
                size="sm"
                style={{ opacity: isHovered ? 1 : 0, pointerEvents: isHovered ? 'auto' : 'none' }}
                variant="ghost"
                onPress={() => {
                  onDelete(layer.id);
                }}
              >
                <Trash2 size={ICON_SIZE} />
              </Button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
