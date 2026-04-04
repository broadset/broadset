import { Accordion, Button, Input, ListBox, ListBoxItem, NumberField, Select, TextField } from '@heroui/react';
import type { JSX, Key } from 'react';
import { useCallback, useState } from 'react';

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
  readonly borderWidth: number;
  readonly borderColor: string;
  readonly borderStyle: string;
  readonly borderRadius: number;
  readonly opacity: number;
  readonly blendMode: string;
}

export interface LayerInfo {
  readonly id: string;
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
    <section role="region" aria-label="Geometry">
      {GEOMETRY_FIELDS.map((field) => (
        <NumberField
          key={field.key}
          aria-label={field.label}
          value={values[field.key] ?? 0}
          onChange={(v: number) => {
            onUpdate(field.key, v);
          }}
        >
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
    <section role="region" aria-label="Appearance">
      <TextField
        aria-label="Fill color"
        value={backgroundColor}
        onChange={(v: string) => {
          onUpdate('backgroundColor', v);
        }}
      >
        <Input />
      </TextField>
      <NumberField
        aria-label="Border width"
        value={borderWidth}
        onChange={(v: number) => {
          onUpdate('borderWidth', v);
        }}
      >
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <TextField
        aria-label="Border color"
        value={borderColor}
        onChange={(v: string) => {
          onUpdate('borderColor', v);
        }}
      >
        <Input />
      </TextField>
      <Select aria-label="Border style" value={borderStyle} onChange={handleBorderStyleChange}>
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
        aria-label="Border radius"
        value={borderRadius}
        onChange={(v: number) => {
          onUpdate('borderRadius', v);
        }}
      >
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
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
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <Select aria-label="Blend mode" value={blendMode} onChange={handleBlendModeChange}>
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

  const defaultKeys = isScreen ? ['geometry', 'appearance', 'gradient'] : ['geometry', 'appearance'];

  return (
    <aside role="region" aria-label="Properties">
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
              <Accordion.Trigger>Gradient fill</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <p>Gradient controls here</p>
            </Accordion.Panel>
          </Accordion.Item>
        : null}
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
  readonly onDelete: (id: string) => void;
  readonly onRename?: (id: string, name: string) => void;
}

export function LayersSidebar({
  layers,
  selectedIds = [],
  onSelect,
  onToggleLock,
  onDelete,
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
      <ul>
        {layers.map((layer) => {
          const isSelected = selectedIds.includes(layer.id);

          return (
            <li
              key={layer.id}
              style={isSelected ? { backgroundColor: 'rgba(0, 111, 238, 0.15)' } : undefined}
              aria-selected={isSelected}
            >
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
                >
                  {layer.name}
                </span>
              }
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Toggle lock ${layer.name}`}
                onPress={() => {
                  onToggleLock(layer.id);
                }}
              >
                {layer.locked ? 'Unlock' : 'Lock'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${layer.name}`}
                onPress={() => {
                  onDelete(layer.id);
                }}
              >
                Delete
              </Button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
