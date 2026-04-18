import type { VerticalAlignment } from '@broadset/model';
import { Button } from '@heroui/react';
import { Bold, Italic, Strikethrough, Underline } from 'lucide-react';
import type { JSX } from 'react';
import { useState } from 'react';

import {
  ColorInput,
  CssLengthInput,
  FieldRow,
  NumField,
  SegmentedSwitcher,
  ShadowEditor,
  TextStrokeInput,
  ToggleRow,
} from '../inputs';
import { ICON_SIZE, SelectField, TEXT_TRANSFORM_OPTIONS, VERTICAL_ALIGNMENT_OPTIONS } from '../panel-types';
import { color, font, sp } from '../tokens';
import { PropertyField } from './property-editing-context';

const FONT_SIZE_MIN = 1;
const FONT_SIZE_MAX = 512;
const FONT_WEIGHT_MIN = 100;
const FONT_WEIGHT_MAX = 900;
const FONT_WEIGHT_STEP = 100;
const REGULAR_WEIGHT = 400;
const BOLD_WEIGHT = 700;
const DEFAULT_FONT_FAMILIES = ['Arial', 'Inter', 'Helvetica Neue'] as const;

const ALIGNMENT_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
  { value: 'justify', label: 'Justify' },
] as const;

type HorizontalAlignment = (typeof ALIGNMENT_OPTIONS)[number]['value'];

function toHorizontalAlignment(value: string): HorizontalAlignment {
  const matched = ALIGNMENT_OPTIONS.find((option) => option.value === value);

  return matched?.value ?? 'left';
}

export interface TypographyPanelProps {
  readonly fontFamily: string;
  readonly availableFonts?: readonly string[] | undefined;
  readonly fontSize: number;
  readonly fontColor: string;
  readonly fontWeight: number;
  readonly fontStyle: string;
  readonly textAlignment: string;
  readonly verticalAlignment: VerticalAlignment;
  readonly textDecoration: string;
  readonly textTransform: string;
  readonly isAnimationMode?: boolean | undefined;
  readonly onUpdate: (key: string, value: string | number) => void;
}

export function TypographyPanel({
  fontFamily,
  availableFonts,
  fontSize,
  fontColor,
  fontWeight,
  fontStyle,
  textAlignment,
  verticalAlignment,
  textDecoration,
  textTransform,
  isAnimationMode = false,
  onUpdate,
}: TypographyPanelProps): JSX.Element {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isBold = fontWeight >= BOLD_WEIGHT;
  const isItalic = fontStyle === 'italic';
  const isUnderline = textDecoration === 'underline';
  const isStrikethrough = textDecoration === 'line-through';
  const fontFamilyOptions =
    availableFonts !== undefined && availableFonts.length > 0 ? availableFonts : DEFAULT_FONT_FAMILIES;
  const alignment = toHorizontalAlignment(textAlignment);

  return (
    <section
      aria-label="Typography"
      role="region"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04'), minWidth: 0, width: '100%' }}
    >
      {!isAnimationMode ?
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>
          Double-click the text on canvas to edit content inline.
        </p>
      : null}

      <FieldRow label="Font">
        <PropertyField propertyKey="fontFamily" defaultValue={fontFamily}>
          <SelectField
            label="Font family"
            value={fontFamily}
            options={fontFamilyOptions}
            onUpdate={onUpdate}
            updateKey="fontFamily"
          />
        </PropertyField>
      </FieldRow>

      <FieldRow label="Size" unit="pt">
        <PropertyField propertyKey="fontSize" defaultValue={fontSize}>
          <NumField
            compact
            label="Font size (pt)"
            value={fontSize}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            onChange={(v) => {
              onUpdate('fontSize', v);
            }}
          />
        </PropertyField>
      </FieldRow>

      <FieldRow label="Color">
        <div
          style={{
            display: 'grid',
            gap: sp('sp-02'),
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            minWidth: 0,
          }}
        >
          <PropertyField propertyKey="fontColor" defaultValue={fontColor}>
            <ColorInput
              compact
              label="Text color"
              value={fontColor}
              onChange={(v) => {
                onUpdate('fontColor', v);
              }}
            />
          </PropertyField>
          <PropertyField propertyKey="verticalAlignment" defaultValue={verticalAlignment}>
            <SelectField
              label="Vertical alignment"
              value={verticalAlignment}
              options={[...VERTICAL_ALIGNMENT_OPTIONS]}
              onUpdate={onUpdate}
              updateKey="verticalAlignment"
            />
          </PropertyField>
        </div>
      </FieldRow>

      <FieldRow label="Style">
        <ToggleRow
          ariaLabel="Formatting"
          items={[
            {
              value: 'bold',
              ariaLabel: 'Bold',
              icon: <Bold size={ICON_SIZE} />,
              isActive: isBold,
            },
            {
              value: 'italic',
              ariaLabel: 'Italic',
              icon: <Italic size={ICON_SIZE} />,
              isActive: isItalic,
            },
            {
              value: 'underline',
              ariaLabel: 'Underline',
              icon: <Underline size={ICON_SIZE} />,
              isActive: isUnderline,
            },
            {
              value: 'strikethrough',
              ariaLabel: 'Strikethrough',
              icon: <Strikethrough size={ICON_SIZE} />,
              isActive: isStrikethrough,
            },
          ]}
          onToggle={(value) => {
            if (value === 'bold') {
              onUpdate('fontWeight', isBold ? REGULAR_WEIGHT : BOLD_WEIGHT);
            } else if (value === 'italic') {
              onUpdate('fontStyle', isItalic ? 'normal' : 'italic');
            } else if (value === 'underline') {
              onUpdate('textDecoration', isUnderline ? 'none' : 'underline');
            } else {
              onUpdate('textDecoration', isStrikethrough ? 'none' : 'line-through');
            }
          }}
        />
      </FieldRow>

      <FieldRow label="Align">
        <PropertyField propertyKey="textAlignment" defaultValue={alignment}>
          <SegmentedSwitcher
            ariaLabel="Text alignment"
            value={alignment}
            options={ALIGNMENT_OPTIONS}
            onChange={(nextAlignment) => {
              onUpdate('textAlignment', nextAlignment);
            }}
          />
        </PropertyField>
      </FieldRow>

      <Button
        aria-label="Advanced"
        size="sm"
        variant="ghost"
        style={{ alignSelf: 'flex-start' }}
        onPress={() => {
          setShowAdvanced((current) => !current);
        }}
      >
        Advanced
      </Button>

      {showAdvanced ?
        <>
          <FieldRow label="Weight">
            <PropertyField propertyKey="fontWeight" defaultValue={fontWeight}>
              <NumField
                compact
                label="Weight"
                value={fontWeight}
                min={FONT_WEIGHT_MIN}
                max={FONT_WEIGHT_MAX}
                step={FONT_WEIGHT_STEP}
                onChange={(v) => {
                  onUpdate('fontWeight', v);
                }}
              />
            </PropertyField>
          </FieldRow>
          <FieldRow label="Case">
            <PropertyField propertyKey="textTransform" defaultValue={textTransform}>
              <SelectField
                label="Case"
                value={textTransform}
                options={[...TEXT_TRANSFORM_OPTIONS]}
                onUpdate={onUpdate}
                updateKey="textTransform"
              />
            </PropertyField>
          </FieldRow>
        </>
      : null}
    </section>
  );
}

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
    <section
      aria-label="Text Effects"
      role="region"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04'), minWidth: 0, width: '100%' }}
    >
      <Button
        aria-label="Advanced"
        size="sm"
        variant="ghost"
        style={{ alignSelf: 'flex-start' }}
        onPress={() => {
          setShowAdvanced((s) => !s);
        }}
      >
        Advanced
      </Button>

      {showAdvanced ?
        <>
          <FieldRow label="Line height">
            <PropertyField propertyKey="lineHeight" defaultValue={lineHeight}>
              <CssLengthInput
                label="Line height"
                value={lineHeight}
                onChange={(v) => {
                  onUpdate('lineHeight', v);
                }}
              />
            </PropertyField>
          </FieldRow>

          <FieldRow label="Spacing">
            <div
              style={{
                display: 'grid',
                gap: sp('sp-02'),
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                minWidth: 0,
              }}
            >
              <PropertyField propertyKey="letterSpacing" defaultValue={letterSpacing}>
                <CssLengthInput
                  label="Letter spacing"
                  value={String(letterSpacing)}
                  onChange={(v) => {
                    onUpdate('letterSpacing', v);
                  }}
                />
              </PropertyField>
              <PropertyField propertyKey="wordSpacing" defaultValue={wordSpacing}>
                <CssLengthInput
                  label="Word spacing"
                  value={String(wordSpacing)}
                  onChange={(v) => {
                    onUpdate('wordSpacing', v);
                  }}
                />
              </PropertyField>
            </div>
          </FieldRow>

          <FieldRow label="Outline">
            <PropertyField propertyKey="textStroke" defaultValue={textStroke}>
              <TextStrokeInput
                label="Text stroke"
                width={textStroke ? parseInt(textStroke, 10) : 0}
                color={textStroke.split(' ')[1] ?? '#000000'}
                onChange={(v) => {
                  onUpdate('textStroke', v);
                }}
              />
            </PropertyField>
          </FieldRow>
          <FieldRow label="Shadow">
            <PropertyField propertyKey="textShadow" defaultValue={textShadow}>
              <ShadowEditor
                label="Text shadow"
                mode="text"
                value={textShadow}
                onChange={(v) => {
                  onUpdate('textShadow', v);
                }}
              />
            </PropertyField>
          </FieldRow>
        </>
      : null}
    </section>
  );
}
