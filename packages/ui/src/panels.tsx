import type { JSX } from 'react';
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

// ---------------------------------------------------------------------------
// CollapsibleSection — shared helper
// ---------------------------------------------------------------------------

interface CollapsibleSectionProps {
  readonly label: string;
  readonly defaultExpanded?: boolean;
  readonly children: React.ReactNode;
}

function CollapsibleSection({ label, defaultExpanded, children }: CollapsibleSectionProps): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded ?? true);

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((prev) => !prev);
        }}
      >
        {label}
      </button>
      {expanded ? children : null}
    </div>
  );
}

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
        <label key={field.key}>
          {field.label}
          <input
            type="number"
            aria-label={field.label}
            value={values[field.key] ?? 0}
            onChange={(e) => {
              onUpdate(field.key, parseFloat(e.target.value));
            }}
          />
        </label>
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
  return (
    <section role="region" aria-label="Appearance">
      <label>
        Fill color
        <input
          type="text"
          aria-label="Fill color"
          value={backgroundColor}
          onChange={(e) => {
            onUpdate('backgroundColor', e.target.value);
          }}
        />
      </label>
      <label>
        Border width
        <input
          type="number"
          aria-label="Border width"
          value={borderWidth}
          onChange={(e) => {
            onUpdate('borderWidth', parseFloat(e.target.value));
          }}
        />
      </label>
      <label>
        Border color
        <input
          type="text"
          aria-label="Border color"
          value={borderColor}
          onChange={(e) => {
            onUpdate('borderColor', e.target.value);
          }}
        />
      </label>
      <label>
        Border style
        <select
          aria-label="Border style"
          value={borderStyle}
          onChange={(e) => {
            onUpdate('borderStyle', e.target.value);
          }}
        >
          <option value="none">none</option>
          <option value="solid">solid</option>
          <option value="dashed">dashed</option>
          <option value="dotted">dotted</option>
        </select>
      </label>
      <label>
        Border radius
        <input
          type="number"
          aria-label="Border radius"
          value={borderRadius}
          onChange={(e) => {
            onUpdate('borderRadius', parseFloat(e.target.value));
          }}
        />
      </label>
      <label>
        Opacity
        <input
          type="number"
          aria-label="Opacity"
          step={0.1}
          min={0}
          max={1}
          value={opacity}
          onChange={(e) => {
            onUpdate('opacity', parseFloat(e.target.value));
          }}
        />
      </label>
      <label>
        Blend mode
        <select
          aria-label="Blend mode"
          value={blendMode}
          onChange={(e) => {
            onUpdate('blendMode', e.target.value);
          }}
        >
          <option value="normal">normal</option>
          <option value="multiply">multiply</option>
          <option value="screen">screen</option>
          <option value="overlay">overlay</option>
        </select>
      </label>
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

  return (
    <aside role="region" aria-label="Properties">
      <CollapsibleSection label="Geometry">
        <GeometryPanel
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          rotation={element.rotation}
          onUpdate={onUpdate}
        />
      </CollapsibleSection>
      <CollapsibleSection label="Appearance">
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
      </CollapsibleSection>
      {isScreen ?
        <CollapsibleSection label="Gradient fill">
          <p>Gradient controls here</p>
        </CollapsibleSection>
      : null}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// LayersSidebar
// ---------------------------------------------------------------------------

export interface LayersSidebarProps {
  readonly layers: readonly LayerInfo[];
  readonly onSelect: (id: string) => void;
  readonly onToggleLock: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onRename?: (id: string, name: string) => void;
}

export function LayersSidebar({ layers, onSelect, onToggleLock, onDelete, onRename }: LayersSidebarProps): JSX.Element {
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
        {layers.map((layer) => (
          <li key={layer.id}>
            {editingId === layer.id ?
              <input
                type="text"
                value={editValue}
                onChange={(e) => {
                  setEditValue(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitRename(layer.id);
                  } else if (e.key === 'Escape') {
                    cancelRename();
                  }
                }}
                autoFocus
              />
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
            <button
              type="button"
              aria-label={`Toggle lock ${layer.name}`}
              onClick={() => {
                onToggleLock(layer.id);
              }}
            >
              {layer.locked ? 'Unlock' : 'Lock'}
            </button>
            <button
              type="button"
              aria-label={`Delete ${layer.name}`}
              onClick={() => {
                onDelete(layer.id);
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
