import { Button, Input } from '@heroui/react';
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Eye,
  EyeOff,
  FileCode2,
  Folder,
  GripVertical,
  Image,
  LetterText,
  Lock,
  PenTool,
  QrCode,
  Square,
  Trash2,
  Type,
  Unlock,
  Video,
} from 'lucide-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';

import { computeDropPosition, INDENT_PER_LEVEL, isDescendantInLayerList } from './layers-utils';
import type { LayerInfo } from './panel-types';
import { ICON_SIZE } from './panel-types';
import { color, font, glassPanelStyle, sp } from './tokens';

/* ------------------------------------------------------------------ */
/*  LayersSidebar                                                      */
/* ------------------------------------------------------------------ */

export interface LayersSidebarProps {
  readonly layers: readonly LayerInfo[];
  readonly selectedIds?: readonly string[] | undefined;
  readonly scenes?: readonly { readonly id: string; readonly name: string }[] | undefined;
  readonly activeSceneId?: string | undefined;
  readonly onSelectScene?: ((id: string) => void) | undefined;
  readonly onAddScene?: (() => void) | undefined;
  readonly onSelect: (id: string, mode: LayerSelectionMode) => void;
  readonly onToggleLock: (id: string) => void;
  readonly onToggleVisibility?: ((id: string) => void) | undefined;
  readonly onDelete: (id: string) => void;
  readonly onRename?: ((id: string, name: string) => void) | undefined;
  readonly onToggleExpand?: ((id: string) => void) | undefined;
  readonly onReorder?: ((dragId: string, targetId: string, position: LayerDropPosition) => void) | undefined;
}

type LayerSelectionMode = 'single' | 'toggle' | 'range';
type LayerDropPosition = 'before' | 'inside' | 'after';

export function LayersSidebar({
  layers,
  selectedIds = [],
  scenes,
  activeSceneId,
  onSelectScene,
  onAddScene,
  onSelect,
  onToggleLock,
  onToggleVisibility,
  onDelete,
  onRename,
  onToggleExpand,
  onReorder,
}: LayersSidebarProps): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    readonly id: string;
    readonly position: 'before' | 'inside' | 'after';
  } | null>(null);

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

  const handleClick = useCallback(
    (id: string, event: React.MouseEvent) => {
      if (event.shiftKey) {
        onSelect(id, 'range');
      } else if (event.metaKey || event.ctrlKey) {
        onSelect(id, 'toggle');
      } else {
        onSelect(id, 'single');
      }
    },
    [onSelect],
  );

  const handleDragStart = useCallback((id: string, event: React.DragEvent) => {
    setDragId(id);

    event.dataTransfer.effectAllowed = 'move';
  }, []);

  /** Check whether targetId is a descendant of dragSourceId in the flat layer list */
  const isDescendant = useCallback(
    (dragSourceId: string, targetId: string): boolean => isDescendantInLayerList(layers, dragSourceId, targetId),
    [layers],
  );

  const handleDragOver = useCallback(
    (targetId: string, event: React.DragEvent) => {
      event.preventDefault();

      if (dragId === null || dragId === targetId) {
        return;
      }

      // Reject drops into own descendants
      if (isDescendant(dragId, targetId)) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const targetLayer = layers.find((layer) => layer.id === targetId);
      const position = computeDropPosition(y, rect.height, targetLayer?.type === 'group');

      setDropTarget({ id: targetId, position });
    },
    [dragId, isDescendant, layers],
  );

  const handleDrop = useCallback(() => {
    if (dragId !== null && onReorder !== undefined && dropTarget !== null) {
      onReorder(dragId, dropTarget.id, dropTarget.position);
    }

    setDragId(null);
    setDropTarget(null);
  }, [dragId, dropTarget, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTarget(null);
  }, []);

  const scenesSection =
    scenes !== undefined && scenes.length > 0 ?
      <div
        style={{ display: 'flex', gap: sp('sp-02'), marginBottom: sp('sp-03'), alignItems: 'center', flexWrap: 'wrap' }}
      >
        {scenes.map((scene) => (
          <Button
            key={scene.id}
            aria-label={`Scene ${scene.name}`}
            size="sm"
            variant={activeSceneId === scene.id ? 'secondary' : 'ghost'}
            onPress={() => {
              onSelectScene?.(scene.id);
            }}
          >
            {scene.name}
          </Button>
        ))}
        {onAddScene !== undefined ?
          <Button aria-label="Add Scene" size="sm" variant="ghost" onPress={onAddScene}>
            + Add Scene
          </Button>
        : null}
      </div>
    : null;

  if (layers.length === 0) {
    return (
      <aside aria-label="Layers" role="region" className="p-3" style={glassPanelStyle()}>
        {scenesSection}
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>No elements</p>
      </aside>
    );
  }

  return (
    <aside aria-label="Layers" role="region" className="p-3" style={glassPanelStyle()}>
      {scenesSection}{' '}
      <ul style={{ display: 'grid', gap: sp('sp-02'), listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto' }}>
        {layers.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            isSelected={selectedIds.includes(layer.id)}
            isHovered={hoveredId === layer.id}
            dropTarget={dropTarget}
            editingId={editingId}
            editValue={editValue}
            onMouseEnter={setHoveredId}
            onMouseLeave={(): void => {
              setHoveredId(null);
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onToggleExpand={onToggleExpand}
            onToggleVisibility={onToggleVisibility}
            onToggleLock={onToggleLock}
            onDelete={onDelete}
            onSelect={onSelect}
            onClick={handleClick}
            onStartRename={startRename}
            onCommitRename={commitRename}
            onCancelRename={(): void => {
              setEditingId(null);
              setEditValue('');
            }}
            onEditChange={setEditValue}
          />
        ))}
      </ul>
    </aside>
  );
}

interface LayerRowProps {
  readonly layer: LayerInfo;
  readonly isSelected: boolean;
  readonly isHovered: boolean;
  readonly dropTarget: { readonly id: string; readonly position: LayerDropPosition } | null;
  readonly editingId: string | null;
  readonly editValue: string;
  readonly onMouseEnter: (id: string) => void;
  readonly onMouseLeave: () => void;
  readonly onDragOver: (id: string, event: React.DragEvent) => void;
  readonly onDrop: () => void;
  readonly onDragStart: (id: string, event: React.DragEvent) => void;
  readonly onDragEnd: () => void;
  readonly onToggleExpand: ((id: string) => void) | undefined;
  readonly onToggleVisibility: ((id: string) => void) | undefined;
  readonly onToggleLock: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onSelect: (id: string, mode: LayerSelectionMode) => void;
  readonly onClick: (id: string, event: React.MouseEvent) => void;
  readonly onStartRename: (id: string, name: string) => void;
  readonly onCommitRename: (id: string) => void;
  readonly onCancelRename: () => void;
  readonly onEditChange: (value: string) => void;
}

function LayerTypeIcon({ type }: { readonly type: string }): JSX.Element {
  switch (type) {
    case 'text':
      return <Type size={ICON_SIZE} />;
    case 'image':
      return <Image size={ICON_SIZE} />;
    case 'svg':
      return <FileCode2 size={ICON_SIZE} />;
    case 'path':
      return <PenTool size={ICON_SIZE} />;
    case 'rectangle':
      return <Square size={ICON_SIZE} />;
    case 'ellipse':
      return <Circle size={ICON_SIZE} />;
    case 'qrcode':
      return <QrCode size={ICON_SIZE} />;
    case 'group':
      return <Folder size={ICON_SIZE} />;
    case 'video':
      return <Video size={ICON_SIZE} />;
    case 'clock':
      return <Clock3 size={ICON_SIZE} />;
    case 'ticker':
      return <LetterText size={ICON_SIZE} />;
    default:
      return <Square size={ICON_SIZE} />;
  }
}

function computeRowBackground(isSelected: boolean, isDropInside: boolean, isHovered: boolean): string {
  if (isSelected || isDropInside) return color('surface-secondary');
  if (isHovered) return color('surface');

  return 'transparent';
}

function DropIndicator({ testId, label }: { readonly testId: string; readonly label: string }): JSX.Element {
  return (
    <span
      data-testid={testId}
      style={{
        backgroundColor: color('accent'),
        borderRadius: '999px',
        color: color('foreground'),
        fontSize: font('label'),
        fontWeight: 600,
        padding: '2px 8px',
        position: 'absolute',
        right: sp('sp-03'),
        top: '-10px',
        zIndex: 1,
      }}
    >
      {label}
    </span>
  );
}

function ExpandCollapseButton({
  layer,
  onToggleExpand,
}: {
  readonly layer: LayerInfo;
  readonly onToggleExpand: ((id: string) => void) | undefined;
}): JSX.Element {
  if (layer.hasChildren !== true) {
    return <span style={{ width: ICON_SIZE + 8 }} />;
  }

  const expanded = layer.expanded === true;

  return (
    <Button
      aria-label={expanded ? `Collapse ${layer.name}` : `Expand ${layer.name}`}
      isIconOnly
      size="sm"
      variant="ghost"
      onPress={(): void => {
        onToggleExpand?.(layer.id);
      }}
    >
      {expanded ? <ChevronDown size={ICON_SIZE} /> : <ChevronRight size={ICON_SIZE} />}
    </Button>
  );
}

function RenameInput({
  layer,
  editValue,
  onCommitRename,
  onCancelRename,
  onEditChange,
}: {
  readonly layer: LayerInfo;
  readonly editValue: string;
  readonly onCommitRename: (id: string) => void;
  readonly onCancelRename: () => void;
  readonly onEditChange: (value: string) => void;
}): JSX.Element {
  return (
    <Input
      aria-label="Rename layer"
      value={editValue}
      onBlur={(): void => {
        onCommitRename(layer.id);
      }}
      onChange={(event): void => {
        onEditChange(event.currentTarget.value);
      }}
      onKeyDown={(event): void => {
        if (event.key === 'Enter') {
          onCommitRename(layer.id);
        } else if (event.key === 'Escape') {
          onCancelRename();
        }
      }}
    />
  );
}

function LayerNameLabel({
  layer,
  onClick,
  onSelect,
  onStartRename,
}: {
  readonly layer: LayerInfo;
  readonly onClick: (id: string, event: React.MouseEvent) => void;
  readonly onSelect: (id: string, mode: 'single' | 'toggle' | 'range') => void;
  readonly onStartRename: (id: string, name: string) => void;
}): JSX.Element {
  return (
    <span
      aria-label={`Select ${layer.name}`}
      role="button"
      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
      tabIndex={0}
      onClick={(e): void => {
        onClick(layer.id, e);
      }}
      onDoubleClick={(): void => {
        onStartRename(layer.id, layer.name);
      }}
      onKeyDown={(e): void => {
        if (e.key !== 'Enter' && e.key !== ' ') return;

        e.preventDefault();

        if (e.shiftKey) onSelect(layer.id, 'range');
        else if (e.metaKey || e.ctrlKey) onSelect(layer.id, 'toggle');
        else onSelect(layer.id, 'single');
      }}
    >
      <span style={{ display: 'grid', gap: '2px' }}>
        <span style={{ color: color('foreground'), fontSize: font('body-compact') }}>{layer.name}</span>
        {layer.parentName !== undefined && (
          <span style={{ color: color('muted'), fontSize: font('label') }}>Child of {layer.parentName}</span>
        )}
      </span>
    </span>
  );
}

function LayerRow(props: LayerRowProps): JSX.Element {
  const { layer, isSelected, isHovered, dropTarget, editingId, editValue } = props;
  const depth = layer.depth ?? 0;
  const isDropBefore = dropTarget?.id === layer.id && dropTarget.position === 'before';
  const isDropInside = dropTarget?.id === layer.id && dropTarget.position === 'inside';
  const isDropAfter = dropTarget?.id === layer.id && dropTarget.position === 'after';

  return (
    <li
      onMouseEnter={(): void => {
        props.onMouseEnter(layer.id);
      }}
      onMouseLeave={props.onMouseLeave}
      onDragOver={(e): void => {
        props.onDragOver(layer.id, e);
      }}
      onDrop={props.onDrop}
      style={{
        alignItems: 'center',
        backgroundColor: computeRowBackground(isSelected, isDropInside, isHovered),
        borderRadius: '0.75rem',
        borderTop: isDropBefore ? `2px solid ${color('accent')}` : undefined,
        borderBottom: isDropAfter ? `2px solid ${color('accent')}` : undefined,
        boxShadow: isDropBefore || isDropInside ? `inset 0 0 0 1px ${color('accent')}` : undefined,
        display: 'grid',
        gap: sp('sp-02'),
        gridTemplateColumns: 'auto auto auto 1fr auto auto auto',
        padding: `${sp('sp-02')} ${sp('sp-03')}`,
        paddingLeft: depth > 0 ? `calc(${sp('sp-03')} + ${String(depth * INDENT_PER_LEVEL)}px)` : sp('sp-03'),
        position: 'relative',
      }}
    >
      {isDropBefore && <DropIndicator testId={`layer-drop-parent-indicator-${layer.id}`} label="Parent on drop" />}
      {isDropInside && <DropIndicator testId={`layer-drop-inside-indicator-${layer.id}`} label="Drop inside group" />}

      <span
        draggable
        aria-label={`Drag ${layer.name}`}
        role="img"
        style={{ cursor: 'grab', display: 'flex' }}
        onDragStart={(e): void => {
          props.onDragStart(layer.id, e);
        }}
        onDragEnd={props.onDragEnd}
      >
        <GripVertical size={ICON_SIZE} />
      </span>

      <ExpandCollapseButton layer={layer} onToggleExpand={props.onToggleExpand} />

      <LayerTypeIcon type={layer.type} />

      {editingId === layer.id ? (
        <RenameInput
          layer={layer}
          editValue={editValue}
          onCommitRename={props.onCommitRename}
          onCancelRename={props.onCancelRename}
          onEditChange={props.onEditChange}
        />
      ) : (
        <LayerNameLabel
          layer={layer}
          onClick={props.onClick}
          onSelect={props.onSelect}
          onStartRename={props.onStartRename}
        />
      )}

      {props.onToggleVisibility !== undefined && (
        <Button
          aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={(): void => {
            props.onToggleVisibility?.(layer.id);
          }}
        >
          {layer.visible ? <Eye size={ICON_SIZE} /> : <EyeOff size={ICON_SIZE} />}
        </Button>
      )}

      <Button
        aria-label={`Toggle lock ${layer.name}`}
        isIconOnly
        size="sm"
        variant="ghost"
        onPress={(): void => {
          props.onToggleLock(layer.id);
        }}
      >
        {layer.locked ? <Lock size={ICON_SIZE} /> : <Unlock size={ICON_SIZE} />}
      </Button>

      <Button
        aria-label={`Delete ${layer.name}`}
        isIconOnly
        size="sm"
        style={{ opacity: isHovered ? 1 : 0, pointerEvents: isHovered ? 'auto' : 'none' }}
        variant="ghost"
        onPress={(): void => {
          props.onDelete(layer.id);
        }}
      >
        <Trash2 size={ICON_SIZE} />
      </Button>
    </li>
  );
}
