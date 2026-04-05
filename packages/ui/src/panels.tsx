import { Accordion, Button, Input, Label, ListBox, ListBoxItem, NumberField, Select, TextField } from '@heroui/react';
import type { LucideIcon } from 'lucide-react';
import { Circle, Code, Eye, EyeOff, Folder, Image, Lock, PenTool, QrCode, Square, Type, Unlock } from 'lucide-react';
import type { JSX, Key } from 'react';
import { useCallback, useState } from 'react';

// Layer type → icon map
const LAYER_ICON_MAP: Record<string, LucideIcon> = {
  text: Type,
  image: Image,
  svg: Code,
  path: PenTool,
  rectangle: Square,
  ellipse: Circle,
  qrcode: QrCode,
  group: Folder,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type CustomPanelComponent = (props: Record<string, unknown>) => JSX.Element;

// CollapsibleSection replaced by HeroUI Accordion — see PropertiesSidebar

// ---------------------------------------------------------------------------
// GeometryPanel
// ---------------------------------------------------------------------------

interface GeometryField {
  readonly key: string;
  readonly label: string;
}

const GEOMETRY_FIELDS: readonly GeometryField[] = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
  { key: 'rotation', label: 'Rotation' },
];

export interface GeometryPanelProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly onUpdate: (key: string, value: number) => void;
}

export function GeometryPanel({ x, y, width, height, rotation, onUpdate }: GeometryPanelProps): JSX.Element {
  const values: Record<string, number> = { x, y, width, height, rotation };

  return (
    <section role="region" aria-label="Geometry" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {GEOMETRY_FIELDS.map((field) => (
        <NumberField
          key={field.key}
          aria-label={field.label}
          value={values[field.key] ?? 0}
          onChange={(v: number) => {
            onUpdate(field.key, v);
          }}
        >
          <Label>{field.label}</Label>
          <NumberField.Group>
            <NumberField.Input />
          </NumberField.Group>
        </NumberField>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// AppearancePanel
// ---------------------------------------------------------------------------

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
    (key: Key | null): void => {
      if (key === null) return;

      onUpdate('borderStyle', String(key));
    },
    [onUpdate],
  );

  const handleBlendModeChange = useCallback(
    (key: Key | null): void => {
      if (key === null) return;

      onUpdate('blendMode', String(key));
    },
    [onUpdate],
  );

  return (
    <section role="region" aria-label="Appearance" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <TextField
        aria-label="Fill color"
        value={backgroundColor}
        onChange={(v: string) => {
          onUpdate('backgroundColor', v);
        }}
      >
        <Label>Fill Color</Label>
        <Input />
      </TextField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <NumberField
          aria-label="Border width"
          value={borderWidth}
          onChange={(v: number) => {
            onUpdate('borderWidth', v);
          }}
        >
          <Label>Border Width</Label>
          <NumberField.Group>
            <NumberField.Input />
          </NumberField.Group>
        </NumberField>
        <NumberField
          aria-label="Border radius"
          value={borderRadius}
          onChange={(v: number) => {
            onUpdate('borderRadius', v);
          }}
        >
          <Label>Border Radius</Label>
          <NumberField.Group>
            <NumberField.Input />
          </NumberField.Group>
        </NumberField>
      </div>
      <TextField
        aria-label="Border color"
        value={borderColor}
        onChange={(v: string) => {
          onUpdate('borderColor', v);
        }}
      >
        <Label>Border Color</Label>
        <Input />
      </TextField>
      <Select aria-label="Border style" value={borderStyle} onChange={handleBorderStyleChange}>
        <Label>Border Style</Label>
        <Select.Trigger>
          <Select.Value />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBoxItem id="none">none</ListBoxItem>
            <ListBoxItem id="solid">solid</ListBoxItem>
            <ListBoxItem id="dashed">dashed</ListBoxItem>
            <ListBoxItem id="dotted">dotted</ListBoxItem>
          </ListBox>
        </Select.Popover>
      </Select>
      <NumberField
        aria-label="Opacity"
        step={0.1}
        minValue={0}
        maxValue={1}
        value={opacity}
        onChange={(v: number) => {
          onUpdate('opacity', v);
        }}
      >
        <Label>Opacity</Label>
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <Select aria-label="Blend mode" value={blendMode} onChange={handleBlendModeChange}>
        <Label>Blend Mode</Label>
        <Select.Trigger>
          <Select.Value />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBoxItem id="normal">normal</ListBoxItem>
            <ListBoxItem id="multiply">multiply</ListBoxItem>
            <ListBoxItem id="screen">screen</ListBoxItem>
            <ListBoxItem id="overlay">overlay</ListBoxItem>
          </ListBox>
        </Select.Popover>
      </Select>
    </section>
  );
}

// ---------------------------------------------------------------------------
// PropertiesSidebar
// ---------------------------------------------------------------------------

export interface PropertiesSidebarProps {
  readonly element: PanelElement;
  readonly documentMode: 'screen' | 'print';
  readonly onUpdate: (key: string, value: string | number) => void;
  readonly customPanels?: Readonly<Record<string, CustomPanelComponent>>;
}

export function PropertiesSidebar({
  element,
  documentMode,
  onUpdate,
  customPanels,
}: PropertiesSidebarProps): JSX.Element {
  // Custom panel override
  const CustomPanel = customPanels?.[element.type];

  if (CustomPanel) {
    return (
      <aside role="region" aria-label="Properties">
        <CustomPanel element={element} onUpdate={onUpdate} />
      </aside>
    );
  }

  const isScreen = documentMode === 'screen';

  const defaultKeys = isScreen ? ['geometry', 'appearance', 'gradient', 'boxEffects'] : ['geometry', 'appearance'];

  const ElementIcon = LAYER_ICON_MAP[element.type] ?? Square;

  return (
    <aside role="region" aria-label="Properties" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Element info header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 8px' }}>
        <ElementIcon size={16} style={{ opacity: 0.6, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {element.name}
          </div>
          <div style={{ fontSize: 11, opacity: 0.5 }}>{element.type}</div>
        </div>
      </div>

      <Accordion defaultExpandedKeys={defaultKeys} allowsMultipleExpanded>
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
              opacity={element.opacity}
              blendMode={element.blendMode}
              onUpdate={onUpdate}
            />
          </Accordion.Panel>
        </Accordion.Item>
        {isScreen ?
          <Accordion.Item id="gradient">
            <Accordion.Heading>
              <Accordion.Trigger>Gradient Fill</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <TextField
                aria-label="CSS Gradient"
                value={element.backgroundGradient}
                onChange={(v: string) => {
                  onUpdate('backgroundGradient', v);
                }}
              >
                <Label>CSS Gradient</Label>
                <Input placeholder="e.g. linear-gradient(90deg, #ff0000, #0000ff)" />
              </TextField>
            </Accordion.Panel>
          </Accordion.Item>
        : null}
        <Accordion.Item id="boxEffects">
          <Accordion.Heading>
            <Accordion.Trigger>Box Effects</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <TextField
                aria-label="Box shadow"
                value={element.boxShadow}
                onChange={(v: string) => {
                  onUpdate('boxShadow', v);
                }}
              >
                <Label>Box Shadow</Label>
                <Input placeholder="e.g. 2px 4px 8px rgba(0,0,0,0.3)" />
              </TextField>
              <TextField
                aria-label="CSS Filter"
                value={element.filter}
                onChange={(v: string) => {
                  onUpdate('filter', v);
                }}
              >
                <Label>Filter</Label>
                <Input placeholder="e.g. blur(4px) brightness(1.2)" />
              </TextField>
              {isScreen ?
                <TextField
                  aria-label="Backdrop filter"
                  value={element.backdropFilter}
                  onChange={(v: string) => {
                    onUpdate('backdropFilter', v);
                  }}
                >
                  <Label>Backdrop Filter</Label>
                  <Input placeholder="e.g. blur(10px)" />
                </TextField>
              : null}
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// LayersSidebar
// ---------------------------------------------------------------------------

export interface LayersSidebarProps {
  readonly layers: readonly LayerInfo[];
  readonly selectedIds?: readonly string[];
  readonly onSelect: (id: string) => void;
  readonly onToggleLock: (id: string) => void;
  readonly onToggleVisibility?: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onRename?: (id: string, name: string) => void;
}

export function LayersSidebar({
  layers,
  selectedIds = [],
  onSelect,
  onToggleLock,
  onToggleVisibility,
  onDelete: _onDelete,
  onRename,
}: LayersSidebarProps): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startRename = useCallback((id: string, currentName: string): void => {
    setEditingId(id);
    setEditValue(currentName);
  }, []);

  const commitRename = useCallback(
    (id: string): void => {
      const trimmed = editValue.trim();

      if (trimmed.length > 0 && onRename) {
        onRename(id, trimmed);
      }

      setEditingId(null);
    },
    [editValue, onRename],
  );

  const cancelRename = useCallback((): void => {
    setEditingId(null);
  }, []);

  if (layers.length === 0) {
    return (
      <aside role="region" aria-label="Layers">
        <p>No elements</p>
      </aside>
    );
  }

  return (
    <aside role="region" aria-label="Layers">
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {layers.map((layer) => {
          const isSelected = selectedIds.includes(layer.id);
          const LayerIcon = LAYER_ICON_MAP[layer.type] ?? Square;

          return (
            <li
              key={layer.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 4,
                backgroundColor: isSelected ? 'rgba(0, 111, 238, 0.15)' : undefined,
                cursor: 'pointer',
                opacity: layer.visible ? 1 : 0.5,
              }}
              aria-selected={isSelected}
            >
              <LayerIcon size={14} style={{ flexShrink: 0, opacity: 0.6 }} />

              {editingId === layer.id ?
                <TextField
                  aria-label="Rename layer"
                  value={editValue}
                  onChange={(v: string) => {
                    setEditValue(v);
                  }}
                  autoFocus
                >
                  <Input
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === 'Enter') {
                        commitRename(layer.id);
                      } else if (e.key === 'Escape') {
                        cancelRename();
                      }
                    }}
                  />
                </TextField>
              : <span
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onSelect(layer.id);
                  }}
                  onDoubleClick={() => {
                    startRename(layer.id, layer.name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onSelect(layer.id);
                    }
                  }}
                  style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}
                >
                  {layer.name}
                </span>
              }

              {onToggleVisibility !== undefined ?
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  onPress={() => {
                    onToggleVisibility(layer.id);
                  }}
                >
                  {layer.visible ?
                    <Eye size={14} />
                  : <EyeOff size={14} />}
                </Button>
              : null}

              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                aria-label={`Toggle lock ${layer.name}`}
                onPress={() => {
                  onToggleLock(layer.id);
                }}
              >
                {layer.locked ?
                  <Lock size={14} />
                : <Unlock size={14} />}
              </Button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
