import type { BooleanOperation } from '@broadset/model';
import { Accordion, Button, Input, ListBox, Select, Slider, TextArea } from '@heroui/react';
import type { JSX } from 'react';
import { useState } from 'react';

import { ColorInput, FieldRow, NumField, SegmentedSwitcher, ToggleSwitch } from '../inputs';
import { type MediaAsset, MediaLibraryModal } from '../modals';
import type { PropertyValue } from '../panel-types';
import {
  BOOLEAN_OPERATION_OPTIONS,
  ERROR_CORRECTION_OPTIONS,
  FieldShell,
  LINECAP_OPTIONS,
  LINEJOIN_OPTIONS,
  SelectField,
} from '../panel-types';
import { color, font, sp } from '../tokens';

const OPACITY_PERCENT_MIN = 0;
const OPACITY_PERCENT_MAX = 100;
const OPACITY_PERCENT_STEP = 1;
const EMPTY_ASSET_ID_VALUE = '';

const OBJECT_FIT_OPTIONS_WITH_LABELS = [
  { label: 'Contain', value: 'contain' },
  { label: 'Cover', value: 'cover' },
  { label: 'Fill', value: 'fill' },
  { label: 'None', value: 'none' },
  { label: 'Scale down', value: 'scale-down' },
] as const;

type ObjectFitValue = (typeof OBJECT_FIT_OPTIONS_WITH_LABELS)[number]['value'];

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
    <section
      aria-label="Path Properties"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04'), minWidth: 0, width: '100%' }}
    >
      <div style={{ display: 'flex', gap: sp('sp-02'), minWidth: 0 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04'), minWidth: 0, width: '100%' }}>
              <FieldRow label="Stroke">
                <div
                  style={{
                    display: 'grid',
                    gap: sp('sp-02'),
                    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                    minWidth: 0,
                  }}
                >
                  <ColorInput
                    compact
                    allowAlpha={false}
                    label="Stroke"
                    value={stroke}
                    onChange={(v) => {
                      onUpdate('stroke', v);
                    }}
                  />
                  <NumField
                    compact
                    label="Stroke width"
                    value={strokeWidth}
                    min={0}
                    step={0.5}
                    onChange={(v) => {
                      onUpdate('strokeWidth', v);
                    }}
                  />
                </div>
              </FieldRow>

              <FieldRow
                label="Stroke opacity"
                trailing={
                  <span
                    style={{ color: color('muted'), fontSize: font('label') }}
                  >{`${String(strokeOpacityPercent)}%`}</span>
                }
              >
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
              </FieldRow>

              <FieldRow label="Line">
                <div
                  style={{
                    display: 'grid',
                    gap: sp('sp-02'),
                    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                    minWidth: 0,
                  }}
                >
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
                </div>
              </FieldRow>

              <Button
                aria-label="Stroke advanced"
                size="sm"
                variant="ghost"
                style={{ alignSelf: 'flex-start' }}
                onPress={() => {
                  setShowStrokeAdvanced((current) => !current);
                }}
              >
                Advanced
              </Button>

              {showStrokeAdvanced ?
                <FieldRow label="Dash">
                  <div
                    style={{
                      display: 'grid',
                      gap: sp('sp-02'),
                      gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
                      minWidth: 0,
                    }}
                  >
                    <Input
                      aria-label="Dash pattern"
                      placeholder="e.g. 4 2"
                      value={strokeDasharray}
                      onChange={(e) => {
                        onUpdate('strokeDasharray', e.currentTarget.value);
                      }}
                    />
                    <NumField
                      compact
                      label="Dash offset"
                      value={strokeDashoffset}
                      onChange={(v) => {
                        onUpdate('strokeDashoffset', v);
                      }}
                    />
                  </div>
                </FieldRow>
              : null}
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item id="fill">
          <Accordion.Heading>
            <Accordion.Trigger>Fill</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04'), minWidth: 0, width: '100%' }}>
              <FieldRow label="Fill">
                <ColorInput
                  allowAlpha={false}
                  label="Fill"
                  value={fill}
                  onChange={(v) => {
                    onUpdate('fill', v);
                  }}
                />
              </FieldRow>

              <FieldRow
                label="Fill opacity"
                trailing={
                  <span
                    style={{ color: color('muted'), fontSize: font('label') }}
                  >{`${String(fillOpacityPercent)}%`}</span>
                }
              >
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
              </FieldRow>

              <FieldRow label="Inside rule">
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
              </FieldRow>
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item id="shape">
          <Accordion.Heading>
            <Accordion.Trigger>Shape</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), minWidth: 0, width: '100%' }}>
              <Button
                aria-label="Advanced / Power user"
                size="sm"
                variant="ghost"
                style={{ alignSelf: 'flex-start' }}
                onPress={() => {
                  setShowShapeAdvanced((current) => !current);
                }}
              >
                Advanced / Power user
              </Button>

              {showShapeAdvanced ?
                <>
                  <FieldRow label="Path preview">
                    <Input
                      aria-label="Path preview"
                      readOnly
                      value={content.trim() === '' ? '(empty path)' : content}
                    />
                  </FieldRow>
                  <ToggleSwitch
                    ariaLabel="Show path source"
                    isSelected={showPathSource}
                    onChange={(nextValue) => {
                      setShowPathSource(nextValue);
                    }}
                  >
                    Show path source
                  </ToggleSwitch>
                  {showPathSource ?
                    <FieldRow label="Shape source">
                      <TextArea
                        aria-label="Shape source"
                        readOnly
                        value={content}
                        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                      />
                    </FieldRow>
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
  readonly assetId?: string | null | undefined;
  readonly assets?: readonly MediaAsset[] | undefined;
  readonly objectFit?: string | undefined;
  readonly onUploadRequest?: (() => void) | undefined;
  readonly onUpdate: (key: string, value: string | number) => void;
}

function getImageFilename(url: string): string {
  const trimmed = url.trim();

  if (trimmed === '') {
    return 'No source selected';
  }

  try {
    const pathname = new URL(trimmed).pathname;
    const segments = pathname.split('/').filter((segment) => segment !== '');
    const lastSegment = segments[segments.length - 1];

    return lastSegment ?? trimmed;
  } catch {
    const parts = trimmed.split('/').filter((segment) => segment !== '');
    const lastPart = parts[parts.length - 1];

    return lastPart ?? trimmed;
  }
}

export function ImagePanel({
  content,
  assetId = null,
  assets = [],
  objectFit,
  onUploadRequest,
  onUpdate,
}: ImagePanelProps): JSX.Element {
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const selectedAsset =
    assetId !== null && assetId !== '' ?
      assets.find((asset) => asset.id === assetId)
    : assets.find((asset) => asset.url === content);
  const selectedName = selectedAsset?.name ?? getImageFilename(content);
  // Prefer the resolved asset URL for the thumbnail so elements whose `content`
  // is an empty string but whose `assetId` points at a known asset still show
  // a live preview instead of a broken-image icon. Falls through to `content`
  // (which may be a direct URL typed by the user) when no asset matches.
  const thumbnailSrc = selectedAsset?.url ?? content;
  const categories = ['All', ...Array.from(new Set(assets.map((asset) => asset.category)))];
  const currentObjectFit: ObjectFitValue =
    OBJECT_FIT_OPTIONS_WITH_LABELS.find((option) => option.value === objectFit)?.value ?? 'contain';

  return (
    <section
      aria-label="Image"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), minWidth: 0, width: '100%' }}
    >
      <div
        style={{
          alignItems: 'center',
          background: color('field-background'),
          border: `1px solid ${color('border')}`,
          borderRadius: 6,
          display: 'flex',
          gap: sp('sp-02'),
          minWidth: 0,
          padding: sp('sp-02'),
        }}
      >
        <img
          alt="Selected thumbnail"
          src={thumbnailSrc}
          style={{ borderRadius: 4, flex: '0 0 auto', height: 36, objectFit: 'cover', width: 36 }}
        />
        <span
          style={{
            color: color('foreground'),
            flex: 1,
            fontSize: font('body-compact'),
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {selectedName}
        </span>
      </div>

      <div style={{ display: 'flex', gap: sp('sp-02'), minWidth: 0 }}>
        <Button
          aria-label="Choose from library"
          size="sm"
          variant="primary"
          onPress={() => {
            setIsMediaLibraryOpen(true);
          }}
        >
          Choose from library
        </Button>
        <Button
          aria-label="Replace URL"
          size="sm"
          variant="ghost"
          onPress={() => {
            setShowUrlInput((current) => !current);
          }}
        >
          URL…
        </Button>
      </div>

      {showUrlInput ?
        <FieldRow label="Source URL">
          <Input
            aria-label="Source URL"
            value={content}
            onChange={(e) => {
              onUpdate('content', e.currentTarget.value);
              onUpdate('assetId', EMPTY_ASSET_ID_VALUE);
            }}
          />
        </FieldRow>
      : null}

      {objectFit !== undefined ?
        <FieldRow label="Fit">
          <SegmentedSwitcher
            ariaLabel="Object fit"
            value={currentObjectFit}
            options={OBJECT_FIT_OPTIONS_WITH_LABELS.map((option) => ({ label: option.label, value: option.value }))}
            onChange={(nextValue) => {
              onUpdate('objectFit', nextValue);
            }}
          />
        </FieldRow>
      : null}

      {isMediaLibraryOpen ?
        <MediaLibraryModal
          isOpen={isMediaLibraryOpen}
          assets={assets}
          categories={categories}
          onSelect={(asset) => {
            onUpdate('content', asset.url);
            onUpdate('assetId', asset.id);
            setIsMediaLibraryOpen(false);
          }}
          onClose={() => {
            setIsMediaLibraryOpen(false);
          }}
          onUploadRequest={onUploadRequest}
        />
      : null}
    </section>
  );
}

export interface ObjectFitPanelProps {
  readonly objectFit: string;
  readonly onUpdate: (key: string, value: string | number) => void;
}

export function ObjectFitPanel({ objectFit, onUpdate }: ObjectFitPanelProps): JSX.Element {
  const current: ObjectFitValue =
    OBJECT_FIT_OPTIONS_WITH_LABELS.find((option) => option.value === objectFit)?.value ?? 'contain';

  return (
    <section
      aria-label="Object Fit"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), minWidth: 0, width: '100%' }}
    >
      <FieldRow label="Fit">
        <SegmentedSwitcher
          ariaLabel="Object fit"
          value={current}
          options={OBJECT_FIT_OPTIONS_WITH_LABELS.map((option) => ({ label: option.label, value: option.value }))}
          onChange={(nextValue) => {
            onUpdate('objectFit', nextValue);
          }}
        />
      </FieldRow>
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
    <section
      aria-label="QR Code"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04'), minWidth: 0, width: '100%' }}
    >
      <FieldRow label="Content">
        <Input
          aria-label="Content"
          value={content}
          onChange={(e) => {
            onUpdate('content', e.currentTarget.value);
          }}
        />
      </FieldRow>

      <FieldRow label="Error correction">
        <SelectField
          hideLabel
          label="Error correction"
          value={errorCorrection}
          options={[...ERROR_CORRECTION_OPTIONS]}
          onUpdate={onUpdate}
          updateKey="errorCorrection"
        />
      </FieldRow>

      <FieldRow label="Colors">
        <div
          style={{
            display: 'grid',
            gap: sp('sp-02'),
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            minWidth: 0,
          }}
        >
          <ColorInput
            compact
            label="Foreground color"
            value={foregroundColor}
            onChange={(v) => {
              onUpdate('qrForegroundColor', v);
            }}
          />
          <ColorInput
            compact
            label="Background color"
            value={backgroundColor}
            onChange={(v) => {
              onUpdate('qrBackgroundColor', v);
            }}
          />
        </div>
      </FieldRow>
    </section>
  );
}

export interface GroupPanelProps {
  readonly name: string;
  readonly opacity: number;
  readonly clipChildren: boolean;
  readonly booleanOperation: BooleanOperation | null;
  readonly documentMode: 'screen' | 'print';
  readonly onUpdate: (key: string, value: PropertyValue) => void;
}

export function GroupPanel({
  name,
  opacity,
  clipChildren,
  booleanOperation,
  documentMode,
  onUpdate,
}: GroupPanelProps): JSX.Element {
  const opacityPercent = Math.round(opacity * OPACITY_PERCENT_MAX);
  const isPrintMode = documentMode === 'print';

  return (
    <section
      aria-label="Group"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04'), minWidth: 0, width: '100%' }}
    >
      <FieldShell label="Group name">
        <Input
          aria-label="Group name"
          value={name}
          onChange={(e) => {
            onUpdate('name', e.currentTarget.value);
          }}
        />
      </FieldShell>

      <FieldRow
        label="Opacity"
        trailing={
          <span style={{ color: color('muted'), fontSize: font('label') }}>{`${String(opacityPercent)}%`}</span>
        }
      >
        <Slider
          aria-label="Group opacity"
          maxValue={OPACITY_PERCENT_MAX}
          minValue={OPACITY_PERCENT_MIN}
          step={OPACITY_PERCENT_STEP}
          value={opacityPercent}
          onChange={(v: number | readonly number[]) => {
            const percent = typeof v === 'number' ? v : Number(v);

            onUpdate('opacity', percent / OPACITY_PERCENT_MAX);
          }}
        >
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
      </FieldRow>

      <FieldRow label="Clip">
        <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01'), minWidth: 0 }}>
          <ToggleSwitch
            ariaLabel="Clip children to group bounds"
            isDisabled={isPrintMode}
            isSelected={clipChildren}
            onChange={(v) => {
              onUpdate('clipChildren', v);
            }}
          >
            Clip children to group bounds
          </ToggleSwitch>
          {isPrintMode ?
            <span style={{ color: color('muted'), fontSize: font('label') }}>
              Clip children is not available in this document mode.
            </span>
          : null}
        </div>
      </FieldRow>

      <FieldRow label="Boolean operation">
        <SelectField
          hideLabel
          label="Boolean operation"
          value={booleanOperation ?? 'none'}
          options={[...BOOLEAN_OPERATION_OPTIONS]}
          onUpdate={(key, v) => {
            onUpdate(key, v === 'none' ? '' : v);
          }}
          updateKey="booleanOperation"
        />
      </FieldRow>
    </section>
  );
}
