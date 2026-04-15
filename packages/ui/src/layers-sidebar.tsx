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
/*  Layer icon map                                                     */
/* ------------------------------------------------------------------ */

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
  ticker: LetterText,
} as const;

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
  readonly onSelect: (id: string, mode: 'single' | 'toggle' | 'range') => void;
  readonly onToggleLock: (id: string) => void;
  readonly onToggleVisibility?: ((id: string) => void) | undefined;
  readonly onDelete: (id: string) => void;
  readonly onRename?: ((id: string, name: string) => void) | undefined;
  readonly onToggleExpand?: ((id: string) => void) | undefined;
  readonly onReorder?:
    | ((dragId: string, targetId: string, position: 'before' | 'inside' | 'after') => void)
    | undefined;
}

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
        {layers.map((layer) => {
          const LayerIcon =
            layer.type in LAYER_ICON_MAP ? LAYER_ICON_MAP[layer.type as keyof typeof LAYER_ICON_MAP] : Square;
          const isSelected = selectedIds.includes(layer.id);
          const isHovered = hoveredId === layer.id;
          const depth = layer.depth ?? 0;
          const isDropBefore = dropTarget?.id === layer.id && dropTarget.position === 'before';
          const isDropInside = dropTarget?.id === layer.id && dropTarget.position === 'inside';
          const isDropAfter = dropTarget?.id === layer.id && dropTarget.position === 'after';

          let bgColor = 'transparent';

          if (isSelected) {
            bgColor = color('surface-secondary');
          } else if (isDropInside) {
            bgColor = color('surface-secondary');
          } else if (isHovered) {
            bgColor = color('surface');
          }

          return (
            <li
              key={layer.id}
              onMouseEnter={() => {
                setHoveredId(layer.id);
              }}
              onMouseLeave={() => {
                setHoveredId(null);
              }}
              onDragOver={(e) => {
                handleDragOver(layer.id, e);
              }}
              onDrop={() => {
                handleDrop();
              }}
              style={{
                alignItems: 'center',
                backgroundColor: bgColor,
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
              {isDropBefore ?
                <span
                  data-testid={`layer-drop-parent-indicator-${layer.id}`}
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
                  Parent on drop
                </span>
              : null}

              {isDropInside ?
                <span
                  data-testid={`layer-drop-inside-indicator-${layer.id}`}
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
                  Drop inside group
                </span>
              : null}

              {/* Grip handle for drag initiation */}
              <span
                draggable
                aria-label={`Drag ${layer.name}`}
                role="img"
                style={{ cursor: 'grab', display: 'flex' }}
                onDragStart={(e) => {
                  handleDragStart(layer.id, e);
                }}
                onDragEnd={handleDragEnd}
              >
                <GripVertical size={ICON_SIZE} />
              </span>

              {/* Expand/collapse chevron for groups */}
              {layer.hasChildren === true ?
                <Button
                  aria-label={layer.expanded === true ? `Collapse ${layer.name}` : `Expand ${layer.name}`}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    onToggleExpand?.(layer.id);
                  }}
                >
                  {layer.expanded === true ?
                    <ChevronDown size={ICON_SIZE} />
                  : <ChevronRight size={ICON_SIZE} />}
                </Button>
              : <span style={{ width: ICON_SIZE + 8 }} />}

              <LayerIcon size={ICON_SIZE} />

              {editingId === layer.id ?
                <Input
                  aria-label="Rename layer"
                  value={editValue}
                  onBlur={() => {
                    commitRename(layer.id);
                  }}
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
              : <span
                  aria-label={`Select ${layer.name}`}
                  role="button"
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  tabIndex={0}
                  onClick={(e) => {
                    handleClick(layer.id, e);
                  }}
                  onDoubleClick={() => {
                    startRename(layer.id, layer.name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();

                      if (e.shiftKey) {
                        onSelect(layer.id, 'range');
                      } else if (e.metaKey || e.ctrlKey) {
                        onSelect(layer.id, 'toggle');
                      } else {
                        onSelect(layer.id, 'single');
                      }
                    }
                  }}
                >
                  <span style={{ display: 'grid', gap: '2px' }}>
                    <span style={{ color: color('foreground'), fontSize: font('body-compact') }}>{layer.name}</span>
                    {layer.parentName === undefined ? null : (
                      <span style={{ color: color('muted'), fontSize: font('label') }}>
                        Child of {layer.parentName}
                      </span>
                    )}
                  </span>
                </span>
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
                style={{ opacity: isHovered ? 1 : 0, pointerEvents: isHovered ? 'auto' : 'none' }}
                variant="ghost"
                onPress={() => {
                  onDelete(layer.id);
                }}
              >
                <Trash2 size={ICON_SIZE} />
              </Button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
