import type { BooleanOperation } from '@broadset/model';
import { Button, Input, Slider, Switch } from '@heroui/react';
import type { JSX } from 'react';

import { ColorInput, NumField } from '../inputs';
import type { PropertyValue } from '../panel-types';
import {
  BOOLEAN_OPERATION_OPTIONS,
  ERROR_CORRECTION_OPTIONS,
  FieldShell,
  FILL_RULE_OPTIONS,
  LINECAP_OPTIONS,
  LINEJOIN_OPTIONS,
  OBJECT_FIT_OPTIONS,
  SelectField,
} from '../panel-types';

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
