import { ListBox, Select } from '@heroui/react';
import type { JSX, ReactNode } from 'react';
import { cloneElement, isValidElement, useId } from 'react';

import { color, font } from './tokens';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const ICON_SIZE = 14;

export const BORDER_STYLE_OPTIONS = [
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

export const MIX_BLEND_MODE_OPTIONS = [
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

export const LINECAP_OPTIONS = ['butt', 'round', 'square'] as const;
export const LINEJOIN_OPTIONS = ['miter', 'round', 'bevel'] as const;
export const ERROR_CORRECTION_OPTIONS = ['L', 'M', 'Q', 'H'] as const;
export const TEXT_TRANSFORM_OPTIONS = ['none', 'uppercase', 'lowercase', 'capitalize'] as const;
export const VERTICAL_ALIGNMENT_OPTIONS = ['top', 'middle', 'bottom'] as const;
export const ISOLATION_OPTIONS = ['auto', 'isolate'] as const;

export const CLIP_PATH_PRESETS = [
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

export const BOOLEAN_OPERATION_OPTIONS = ['none', 'union', 'subtract', 'intersect', 'exclude'] as const;

export const CLOCK_MODES = ['realtime', 'countdown', 'countup', 'stopwatch'] as const;

export const TICKER_DIRECTIONS = ['left', 'right', 'up', 'down'] as const;

/* ------------------------------------------------------------------ */
/*  Layer icon map                                                     */
/* ------------------------------------------------------------------ */

// Deferred — layer icon map stays in layers-sidebar.tsx because it depends on lucide-react icons.

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude';
export type VerticalAlignment = (typeof VERTICAL_ALIGNMENT_OPTIONS)[number];

export interface PanelElement {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly locked?: boolean | undefined;
  readonly content: string;
  readonly assetId?: string | null | undefined;
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
  readonly verticalAlignment: VerticalAlignment;
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
  readonly trimStart: number;
  readonly trimEnd: number;
  readonly trimOffset: number;
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
  readonly booleanOperation: BooleanOperation | null;
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
  readonly parentName?: string | undefined;
}

export interface PropertyFieldAdapter {
  readonly isIncluded: (key: string) => boolean;
  readonly getValue: (key: string) => PropertyValue;
  readonly toggleProperty: (key: string, include: boolean, defaultValue: PropertyValue) => void;
  readonly updateValue: (key: string, value: PropertyValue) => void;
}

/** Union of all property value types passed through onUpdate callbacks. */
export type PropertyValue = string | number | boolean | readonly [number, number, number, number];

/* ------------------------------------------------------------------ */
/*  Shared Helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Validate a raw CSS clip-path value.
 * Accepts common clip-path functions: circle, ellipse, inset, polygon, path, and url().
 */
const CLIP_PATH_FUNCTION_RE = /^(circle|ellipse|inset|polygon|path|url)\s*\([\s\S]+\)$/i;

export function isValidClipPathCss(value: string): boolean {
  return CLIP_PATH_FUNCTION_RE.test(value);
}

export function FieldShell({
  label,
  inputId,
  description,
  error,
  children,
}: {
  readonly label: string;
  readonly inputId?: string | undefined;
  readonly description?: string | undefined;
  readonly error?: string | undefined;
  readonly children: ReactNode;
}): JSX.Element {
  const fallbackInputId = useId();
  const resolvedInputId = inputId ?? fallbackInputId;
  const descriptionText = description !== undefined && description.trim().length > 0 ? description : undefined;
  const errorText = error !== undefined && error.trim().length > 0 ? error : undefined;
  const descriptionId = descriptionText !== undefined ? `${resolvedInputId}-description` : undefined;
  const errorId = errorText !== undefined ? `${resolvedInputId}-error` : undefined;
  const ariaDescribedBy = [descriptionId, errorId].filter((value): value is string => value !== undefined).join(' ');
  const childAriaProps: { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: true } = {};

  if (inputId === undefined) {
    childAriaProps.id = resolvedInputId;
  }

  if (ariaDescribedBy.length > 0) {
    childAriaProps['aria-describedby'] = ariaDescribedBy;
  }

  if (errorText !== undefined) {
    childAriaProps['aria-invalid'] = true;
  }

  const normalizedChildren = isValidElement(children) ? cloneElement(children, childAriaProps) : children;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={resolvedInputId} style={{ color: color('muted'), fontSize: font('label') }}>
        {label}
      </label>
      {normalizedChildren}
      {descriptionText !== undefined ?
        <span id={descriptionId} style={{ color: color('muted'), fontSize: font('label') }}>
          {descriptionText}
        </span>
      : null}
      {errorText !== undefined ?
        <span id={errorId} role="alert" style={{ color: color('danger'), fontSize: font('label') }}>
          {errorText}
        </span>
      : null}
    </div>
  );
}

export function SelectField({
  label,
  value,
  options,
  onUpdate,
  updateKey,
  hideLabel,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly onUpdate: (key: string, value: string | number) => void;
  readonly updateKey: string;
  /** When true, omits the FieldShell visible label (aria-label on Select still set). Use inside FieldRow/other labeled wrappers. */
  readonly hideLabel?: boolean | undefined;
}): JSX.Element {
  const select = (
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
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((opt) => (
            <ListBox.Item id={opt} key={opt} textValue={opt}>
              {opt}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );

  if (hideLabel === true) {
    return select;
  }

  return <FieldShell label={label}>{select}</FieldShell>;
}

/* ------------------------------------------------------------------ */
/*  CustomPanel types                                                  */
/* ------------------------------------------------------------------ */

export interface CustomPanelProps {
  readonly element: PanelElement;
  readonly documentMode: 'screen' | 'print';
  readonly onUpdate: (key: string, value: string | number) => void;
}

export type CustomPanelComponent = (props: CustomPanelProps) => JSX.Element;

