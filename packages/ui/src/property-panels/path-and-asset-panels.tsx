import type { BooleanOperation } from '@broadset/model';
import { Accordion, Button, Input, ListBox, Select, Slider, Switch, TextArea } from '@heroui/react';
import type { JSX } from 'react';
import { useState } from 'react';

import { ColorInput, NumField } from '../inputs';
import type { PropertyValue } from '../panel-types';
import {
  BOOLEAN_OPERATION_OPTIONS,
  ERROR_CORRECTION_OPTIONS,
  FieldShell,
  LINECAP_OPTIONS,
  LINEJOIN_OPTIONS,
  OBJECT_FIT_OPTIONS,
  SelectField,
} from '../panel-types';
import { color, font } from '../tokens';

const OPACITY_PERCENT_MIN = 0;
const OPACITY_PERCENT_MAX = 100;
const OPACITY_PERCENT_STEP = 1;

const FILL_RULE_LABELS = [
  { value: 'nonzero', label: 'Non-zero' },
  { value: 'evenodd', label: 'Even-odd' },
] as const;

function toFillRuleLabel(value: string): string {
  const matched = FILL_RULE_LABELS.find((option) => option.value === value);

  return matched?.label ?? 'Non-zero';
}

function toFillRuleValue(value: string): string {
  const matched = FILL_RULE_LABELS.find((option) => option.label === value);

  return matched?.value ?? 'nonzero';
}

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
  const [showStrokeAdvanced, setShowStrokeAdvanced] = useState(false);
  const [showShapeAdvanced, setShowShapeAdvanced] = useState(false);
  const [showPathSource, setShowPathSource] = useState(false);
  const strokeOpacityPercent = Math.round(strokeOpacity * OPACITY_PERCENT_MAX);
  const fillOpacityPercent = Math.round(fillOpacity * OPACITY_PERCENT_MAX);
  const fillRuleLabel = toFillRuleLabel(fillRule);

  return (
    <section aria-label="Path Properties" role="region" className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          aria-label={isDrawing ? 'Stop drawing' : 'Draw'}
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
          {isDrawing ? 'Done Drawing' : 'Draw'}
        </Button>
        <Button
          aria-label={isEditing ? 'Stop editing points' : 'Edit points'}
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
          {isEditing ? 'Done Editing Points' : 'Edit points'}
        </Button>
      </div>

      <Accordion allowsMultipleExpanded defaultExpandedKeys={['stroke', 'fill']}>
        <Accordion.Item id="stroke">
          <Accordion.Heading>
            <Accordion.Trigger>Stroke</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <div className="flex flex-col gap-2">
              <ColorInput
                label="Stroke"
                value={stroke}
                onChange={(v) => {
                  onUpdate('stroke', v);
                }}
              />
              <NumField
                label="Stroke width"
                value={strokeWidth}
                min={0}
                step={0.5}
                onChange={(v) => {
                  onUpdate('strokeWidth', v);
                }}
              />
              <Slider
                aria-label="Stroke opacity"
                maxValue={OPACITY_PERCENT_MAX}
                minValue={OPACITY_PERCENT_MIN}
                step={OPACITY_PERCENT_STEP}
                value={strokeOpacityPercent}
                onChange={(v: number | readonly number[]) => {
                  const percent = typeof v === 'number' ? v : Number(v);

                  onUpdate('strokeOpacity', percent / OPACITY_PERCENT_MAX);
                }}
              >
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
              <p
                style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}
              >{`${String(strokeOpacityPercent)}%`}</p>
              <SelectField
                label="Line cap"
                value={strokeLinecap}
                options={[...LINECAP_OPTIONS]}
                onUpdate={onUpdate}
                updateKey="strokeLinecap"
              />
              <SelectField
                label="Line join"
                value={strokeLinejoin}
                options={[...LINEJOIN_OPTIONS]}
                onUpdate={onUpdate}
                updateKey="strokeLinejoin"
              />

              <Button
                aria-label="Stroke advanced"
                size="sm"
                variant="ghost"
                onPress={() => {
                  setShowStrokeAdvanced((current) => !current);
                }}
              >
                Advanced
              </Button>

              {showStrokeAdvanced ?
                <>
                  <FieldShell label="Dash pattern">
                    <Input
                      aria-label="Dash pattern"
                      value={strokeDasharray}
                      onChange={(e) => {
                        onUpdate('strokeDasharray', e.currentTarget.value);
                      }}
                    />
                  </FieldShell>
                  <NumField
                    label="Dash offset"
                    value={strokeDashoffset}
                    onChange={(v) => {
                      onUpdate('strokeDashoffset', v);
                    }}
                  />
                </>
              : null}
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item id="fill">
          <Accordion.Heading>
            <Accordion.Trigger>Fill</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <div className="flex flex-col gap-2">
              <ColorInput
                label="Fill"
                value={fill}
                onChange={(v) => {
                  onUpdate('fill', v);
                }}
              />
              <Slider
                aria-label="Fill opacity"
                maxValue={OPACITY_PERCENT_MAX}
                minValue={OPACITY_PERCENT_MIN}
                step={OPACITY_PERCENT_STEP}
                value={fillOpacityPercent}
                onChange={(v: number | readonly number[]) => {
                  const percent = typeof v === 'number' ? v : Number(v);

                  onUpdate('fillOpacity', percent / OPACITY_PERCENT_MAX);
                }}
              >
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
              <p
                style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}
              >{`${String(fillOpacityPercent)}%`}</p>

              <FieldShell label="Inside rule">
                <Select
                  aria-label="Inside rule"
                  value={fillRuleLabel}
                  onChange={(selection) => {
                    if (selection !== null) {
                      onUpdate('fillRule', toFillRuleValue(String(selection)));
                    }
                  }}
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {FILL_RULE_LABELS.map((option) => (
                        <ListBox.Item id={option.label} key={option.label} textValue={option.label}>
                          {option.label}
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </FieldShell>
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item id="shape">
          <Accordion.Heading>
            <Accordion.Trigger>Shape</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <div className="flex flex-col gap-2">
              <Button
                aria-label="Advanced / Power user"
                size="sm"
                variant="ghost"
                onPress={() => {
                  setShowShapeAdvanced((current) => !current);
                }}
              >
                Advanced / Power user
              </Button>

              {showShapeAdvanced ?
                <>
                  <FieldShell label="Path preview">
                    <Input
                      aria-label="Path preview"
                      readOnly
                      value={content.trim() === '' ? '(empty path)' : content}
                    />
                  </FieldShell>
                  <Switch
                    aria-label="Show path source"
                    isSelected={showPathSource}
                    onChange={(nextValue) => {
                      setShowPathSource(nextValue);
                    }}
                  >
                    Show path source
                  </Switch>
                  {showPathSource ?
                    <FieldShell label="Shape source">
                      <TextArea
                        aria-label="Shape source"
                        readOnly
                        value={content}
                        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                      />
                    </FieldShell>
                  : null}
                </>
              : null}
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
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
