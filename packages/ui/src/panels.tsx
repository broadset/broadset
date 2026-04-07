import { Accordion, Button, Input, ListBox, ListBoxItem, NumberField, Select } from '@heroui/react';
import {
  Circle,
  Clock3,
  Eye,
  EyeOff,
  FileCode2,
  Folder,
  Image,
  Lock,
  PenTool,
  QrCode,
  Square,
  Type,
  Unlock,
  Video,
} from 'lucide-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';

import { color, font, glassPanelStyle, sp } from './tokens';

const ICON_SIZE = 14;
const GEOMETRY_FIELDS = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
  { key: 'rotation', label: 'Rotation' },
] as const;
const BORDER_STYLE_OPTIONS = ['none', 'solid', 'dashed', 'dotted'] as const;
const BLEND_MODE_OPTIONS = ['normal', 'multiply', 'screen', 'overlay'] as const;

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
  ticker: Type,
} as const;

export interface PanelElement {
  readonly id: string;
  readonly type: string;
  readonly name: string;
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
  readonly borderRadius: number;
  readonly opacity: number;
  readonly blendMode: string;
  readonly boxShadow: string;
  readonly filter: string;
  readonly backdropFilter: string;
}

export interface LayerInfo {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly locked: boolean;
  readonly visible: boolean;
}

interface CustomPanelProps {
  readonly element: PanelElement;
  readonly documentMode: 'screen' | 'print';
  readonly onUpdate: (key: string, value: string | number) => void;
}

type CustomPanelComponent = (props: CustomPanelProps) => JSX.Element;

export interface GeometryPanelProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly onUpdate: (key: string, value: number) => void;
}

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
}: {
  readonly label: string;
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  readonly step?: number | undefined;
  readonly minValue?: number | undefined;
  readonly maxValue?: number | undefined;
}): JSX.Element {
  return (
    <FieldShell label={label}>
      <NumberField
        aria-label={label}
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

export function GeometryPanel({ x, y, width, height, rotation, onUpdate }: GeometryPanelProps): JSX.Element {
  const values = { x, y, width, height, rotation } as const;

  return (
    <section aria-label="Geometry" role="region" className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {GEOMETRY_FIELDS.map((field) => (
        <NumericField
          key={field.key}
          label={field.label}
          value={values[field.key]}
          onValueChange={(nextValue) => {
            onUpdate(field.key, nextValue);
          }}
        />
      ))}
    </section>
  );
}

export interface AppearancePanelProps {
  readonly backgroundColor: string;
  readonly borderWidth: number;
  readonly borderColor: string;
  readonly borderStyle: string;
  readonly borderRadius: number;
  readonly opacity: number;
  readonly blendMode: string;
  readonly onUpdate: (key: string, value: string | number) => void;
}

export function AppearancePanel({
  backgroundColor,
  borderWidth,
  borderColor,
  borderStyle,
  borderRadius,
  opacity,
  blendMode,
  onUpdate,
}: AppearancePanelProps): JSX.Element {
  const handleBorderStyleChange = useCallback(
    (key: string | number | null) => {
      if (key !== null) {
        onUpdate('borderStyle', String(key));
      }
    },
    [onUpdate],
  );
  const handleBlendModeChange = useCallback(
    (key: string | number | null) => {
      if (key !== null) {
        onUpdate('blendMode', String(key));
      }
    },
    [onUpdate],
  );

  return (
    <section aria-label="Appearance" role="region" className="flex flex-col gap-2">
      <FieldShell label="Fill color">
        <Input
          aria-label="Fill color"
          value={backgroundColor}
          onChange={(event) => {
            onUpdate('backgroundColor', event.currentTarget.value);
          }}
        />
      </FieldShell>

      <NumericField
        label="Border width"
        value={borderWidth}
        minValue={0}
        onValueChange={(nextValue) => {
          onUpdate('borderWidth', nextValue);
        }}
      />

      <FieldShell label="Border color">
        <Input
          aria-label="Border color"
          value={borderColor}
          onChange={(event) => {
            onUpdate('borderColor', event.currentTarget.value);
          }}
        />
      </FieldShell>

      <FieldShell label="Border style">
        <Select aria-label="Border style" value={borderStyle} onChange={handleBorderStyleChange}>
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {BORDER_STYLE_OPTIONS.map((option) => (
                <ListBoxItem id={option} key={option}>
                  {option}
                </ListBoxItem>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </FieldShell>

      <NumericField
        label="Border radius"
        value={borderRadius}
        minValue={0}
        onValueChange={(nextValue) => {
          onUpdate('borderRadius', nextValue);
        }}
      />

      <NumericField
        label="Opacity"
        value={opacity}
        maxValue={1}
        minValue={0}
        step={0.1}
        onValueChange={(nextValue) => {
          onUpdate('opacity', nextValue);
        }}
      />

      <FieldShell label="Blend mode">
        <Select aria-label="Blend mode" value={blendMode} onChange={handleBlendModeChange}>
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {BLEND_MODE_OPTIONS.map((option) => (
                <ListBoxItem id={option} key={option}>
                  {option}
                </ListBoxItem>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </FieldShell>
    </section>
  );
}

export interface PropertiesSidebarProps {
  readonly element: PanelElement | null;
  readonly documentMode: 'screen' | 'print';
  readonly onUpdate: (key: string, value: string | number) => void;
  readonly customPanels?: Readonly<Record<string, CustomPanelComponent>> | undefined;
}

export function PropertiesSidebar({
  element,
  documentMode,
  onUpdate,
  customPanels,
}: PropertiesSidebarProps): JSX.Element {
  if (element === null) {
    return (
      <aside aria-label="Properties" role="region" className="p-3" style={glassPanelStyle()}>
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>
          Select an element to edit its properties
        </p>
      </aside>
    );
  }

  const CustomPanel = customPanels?.[element.type];

  if (CustomPanel !== undefined) {
    return (
      <aside aria-label="Properties" role="region" className="p-3" style={glassPanelStyle()}>
        <CustomPanel documentMode={documentMode} element={element} onUpdate={onUpdate} />
      </aside>
    );
  }

  const isScreenMode = documentMode === 'screen';
  const showGradient = isScreenMode && element.type === 'rectangle';

  return (
    <aside aria-label="Properties" role="region" className="p-3" style={glassPanelStyle()}>
      <Accordion
        allowsMultipleExpanded
        defaultExpandedKeys={showGradient ? ['geometry', 'appearance', 'gradient'] : ['geometry', 'appearance']}
      >
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
            />
          </Accordion.Panel>
        </Accordion.Item>

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
              blendMode={element.blendMode}
              opacity={element.opacity}
              onUpdate={onUpdate}
            />
          </Accordion.Panel>
        </Accordion.Item>

        {showGradient ?
          <Accordion.Item id="gradient">
            <Accordion.Heading>
              <Accordion.Trigger>Gradient Fill</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <FieldShell label="CSS Gradient">
                <Input
                  aria-label="CSS Gradient"
                  value={element.backgroundGradient}
                  onChange={(event) => {
                    onUpdate('backgroundGradient', event.currentTarget.value);
                  }}
                />
              </FieldShell>
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
  readonly onSelect: (id: string) => void;
  readonly onToggleLock: (id: string) => void;
  readonly onToggleVisibility?: ((id: string) => void) | undefined;
  readonly onDelete: (id: string) => void;
  readonly onRename?: ((id: string, name: string) => void) | undefined;
}

export function LayersSidebar({
  layers,
  selectedIds = [],
  onSelect,
  onToggleLock,
  onToggleVisibility,
  onDelete,
  onRename,
}: LayersSidebarProps): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

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

  if (layers.length === 0) {
    return (
      <aside aria-label="Layers" role="region" className="p-3" style={glassPanelStyle()}>
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>No elements</p>
      </aside>
    );
  }

  return (
    <aside aria-label="Layers" role="region" className="p-3" style={glassPanelStyle()}>
      <ul style={{ display: 'grid', gap: sp('sp-02'), listStyle: 'none', margin: 0, padding: 0 }}>
        {layers.map((layer) => {
          const LayerIcon =
            layer.type in LAYER_ICON_MAP ? LAYER_ICON_MAP[layer.type as keyof typeof LAYER_ICON_MAP] : Square;
          const isSelected = selectedIds.includes(layer.id);

          return (
            <li
              key={layer.id}
              style={{
                alignItems: 'center',
                backgroundColor: isSelected ? color('surface-secondary') : 'transparent',
                borderRadius: '0.75rem',
                display: 'grid',
                gap: sp('sp-02'),
                gridTemplateColumns: 'auto 1fr auto auto auto',
                padding: `${sp('sp-02')} ${sp('sp-03')}`,
              }}
            >
              <LayerIcon size={ICON_SIZE} />
              {editingId === layer.id ?
                <Input
                  aria-label="Rename layer"
                  value={editValue}
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
              : <Button
                  aria-label={`Select ${layer.name}`}
                  className="justify-start"
                  size="sm"
                  variant="ghost"
                  onDoubleClick={() => {
                    startRename(layer.id, layer.name);
                  }}
                  onPress={() => {
                    onSelect(layer.id);
                  }}
                >
                  <span style={{ color: color('foreground'), fontSize: font('body-compact') }}>{layer.name}</span>
                </Button>
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
                variant="ghost"
                onPress={() => {
                  onDelete(layer.id);
                }}
              >
                ×
              </Button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
