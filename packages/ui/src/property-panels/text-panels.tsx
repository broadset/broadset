import type { VerticalAlignment } from '@broadset/model';
import { Button, Input } from '@heroui/react';
import type { JSX } from 'react';
import { useState } from 'react';

import { ColorInput, CssLengthInput, NumField, ShadowEditor, TextStrokeInput } from '../inputs';
import {
  FONT_STYLE_OPTIONS,
  SelectField,
  TEXT_ALIGNMENT_OPTIONS,
  TEXT_DECORATION_OPTIONS,
  TEXT_TRANSFORM_OPTIONS,
  VERTICAL_ALIGNMENT_OPTIONS,
} from '../panel-types';

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
      <div>
        <Input
          aria-label="Font family"
          value={fontFamily}
          onChange={(e) => {
            onUpdate('fontFamily', e.currentTarget.value);
          }}
        />
      </div>
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
