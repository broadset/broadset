import type { VerticalAlignment } from '@broadset/model';
import { Button, ButtonGroup, Tooltip } from '@heroui/react';
import { Bold, Italic, Strikethrough, Underline } from 'lucide-react';
import type { JSX } from 'react';
import { useState } from 'react';

import { ColorInput, CssLengthInput, NumField, SegmentedSwitcher, ShadowEditor, TextStrokeInput } from '../inputs';
import { ICON_SIZE, SelectField, TEXT_TRANSFORM_OPTIONS, VERTICAL_ALIGNMENT_OPTIONS } from '../panel-types';
import { color, font } from '../tokens';

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

function formatButtonVariant(isActive: boolean): 'ghost' | 'secondary' {
  return isActive ? 'secondary' : 'ghost';
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
    <section aria-label="Typography" role="region" className="flex flex-col gap-2">
      {!isAnimationMode ?
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>
          Double-click the text on canvas to edit content inline.
        </p>
      : null}

      <SelectField
        label="Font family"
        value={fontFamily}
        options={fontFamilyOptions}
        onUpdate={onUpdate}
        updateKey="fontFamily"
      />
      <NumField
        label="Font size (pt)"
        value={fontSize}
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        onChange={(v) => {
          onUpdate('fontSize', v);
        }}
      />
      <ColorInput
        label="Text color"
        value={fontColor}
        onChange={(v) => {
          onUpdate('fontColor', v);
        }}
      />

      <div className="flex flex-col gap-1">
        <span style={{ color: color('muted'), fontSize: font('label') }}>Formatting</span>
        <ButtonGroup aria-label="Formatting">
          <Tooltip delay={0}>
            <Button
              aria-label="Bold"
              size="sm"
              variant={formatButtonVariant(isBold)}
              onPress={() => {
                onUpdate('fontWeight', isBold ? REGULAR_WEIGHT : BOLD_WEIGHT);
              }}
            >
              <Bold size={ICON_SIZE} />
            </Button>
            <Tooltip.Content>Bold</Tooltip.Content>
          </Tooltip>
          <Tooltip delay={0}>
            <Button
              aria-label="Italic"
              size="sm"
              variant={formatButtonVariant(isItalic)}
              onPress={() => {
                onUpdate('fontStyle', isItalic ? 'normal' : 'italic');
              }}
            >
              <Italic size={ICON_SIZE} />
            </Button>
            <Tooltip.Content>Italic</Tooltip.Content>
          </Tooltip>
          <Tooltip delay={0}>
            <Button
              aria-label="Underline"
              size="sm"
              variant={formatButtonVariant(isUnderline)}
              onPress={() => {
                onUpdate('textDecoration', isUnderline ? 'none' : 'underline');
              }}
            >
              <Underline size={ICON_SIZE} />
            </Button>
            <Tooltip.Content>Underline</Tooltip.Content>
          </Tooltip>
          <Tooltip delay={0}>
            <Button
              aria-label="Strikethrough"
              size="sm"
              variant={formatButtonVariant(isStrikethrough)}
              onPress={() => {
                onUpdate('textDecoration', isStrikethrough ? 'none' : 'line-through');
              }}
            >
              <Strikethrough size={ICON_SIZE} />
            </Button>
            <Tooltip.Content>Strikethrough</Tooltip.Content>
          </Tooltip>
        </ButtonGroup>
      </div>

      <SegmentedSwitcher
        ariaLabel="Text alignment"
        value={alignment}
        options={ALIGNMENT_OPTIONS}
        onChange={(nextAlignment) => {
          onUpdate('textAlignment', nextAlignment);
        }}
      />

      <SelectField
        label="Vertical alignment"
        value={verticalAlignment}
        options={[...VERTICAL_ALIGNMENT_OPTIONS]}
        onUpdate={onUpdate}
        updateKey="verticalAlignment"
      />

      <Button
        aria-label="Advanced"
        size="sm"
        variant="ghost"
        onPress={() => {
          setShowAdvanced((current) => !current);
        }}
      >
        Advanced
      </Button>

      {showAdvanced ?
        <>
          <NumField
            label="Weight"
            value={fontWeight}
            min={FONT_WEIGHT_MIN}
            max={FONT_WEIGHT_MAX}
            step={FONT_WEIGHT_STEP}
            onChange={(v) => {
              onUpdate('fontWeight', v);
            }}
          />
          <SelectField
            label="Case"
            value={textTransform}
            options={[...TEXT_TRANSFORM_OPTIONS]}
            onUpdate={onUpdate}
            updateKey="textTransform"
          />
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
    <section aria-label="Text Effects" role="region" className="flex flex-col gap-2">
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
