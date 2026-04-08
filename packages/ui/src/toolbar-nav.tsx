import { Button, Chip, Tabs, Toolbar, Tooltip } from '@heroui/react';
import {
  Circle,
  Clock3,
  FileCode2,
  Folder,
  Grid3X3,
  Image,
  LetterText,
  Minus,
  PenTool,
  Plus,
  QrCode,
  Redo2,
  Save,
  Square,
  Type,
  Undo2,
  Video,
  Waypoints,
} from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { glassPanelStyle, sp } from './tokens';

const ICON_SIZE = 16;

export interface ElementTypeInfo {
  readonly type: string;
  readonly label: string;
  readonly icon?: ReactNode;
}

export const DEFAULT_ELEMENT_TYPES: readonly ElementTypeInfo[] = [
  { type: 'text', label: 'Text', icon: <Type size={ICON_SIZE} /> },
  { type: 'image', label: 'Image', icon: <Image size={ICON_SIZE} /> },
  { type: 'svg', label: 'SVG', icon: <FileCode2 size={ICON_SIZE} /> },
  { type: 'path', label: 'Path', icon: <PenTool size={ICON_SIZE} /> },
  { type: 'rectangle', label: 'Rectangle', icon: <Square size={ICON_SIZE} /> },
  { type: 'ellipse', label: 'Ellipse', icon: <Circle size={ICON_SIZE} /> },
  { type: 'qrcode', label: 'QR Code', icon: <QrCode size={ICON_SIZE} /> },
  { type: 'group', label: 'Group', icon: <Folder size={ICON_SIZE} /> },
  { type: 'video', label: 'Video', icon: <Video size={ICON_SIZE} /> },
  { type: 'clock', label: 'Clock', icon: <Clock3 size={ICON_SIZE} /> },
  { type: 'ticker', label: 'Ticker', icon: <LetterText size={ICON_SIZE} /> },
] as const;

interface ToolbarIconButtonProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly isDisabled?: boolean | undefined;
  readonly variant?: 'ghost' | 'outline' | 'primary';
  readonly onPress: () => void;
}

function ToolbarIconButton({
  label,
  children,
  isDisabled = false,
  variant = 'ghost',
  onPress,
}: ToolbarIconButtonProps): JSX.Element {
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button aria-label={label} isDisabled={isDisabled} isIconOnly size="sm" variant={variant} onPress={onPress}>
          {children}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}

export interface EditorToolbarProps {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly showGrid: boolean;
  readonly showGuides: boolean;
  readonly zoomPercent: number;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onToggleGrid: () => void;
  readonly onToggleGuides?: (() => void) | undefined;
  readonly onSave?: (() => void) | undefined;
}

export function EditorToolbar({
  canUndo,
  canRedo,
  showGrid,
  showGuides,
  zoomPercent,
  onUndo,
  onRedo,
  onToggleGrid,
  onToggleGuides,
  onSave,
}: EditorToolbarProps): JSX.Element {
  return (
    <Toolbar
      aria-label="Editor toolbar"
      className="w-full items-center justify-between gap-2 p-2"
      style={glassPanelStyle()}
    >
      <div className="flex items-center gap-2">
        {onSave !== undefined ?
          <ToolbarIconButton label="Save" variant="outline" onPress={onSave}>
            <Save size={ICON_SIZE} />
          </ToolbarIconButton>
        : null}

        <ToolbarIconButton isDisabled={!canUndo} label="Undo" onPress={onUndo}>
          <Undo2 size={ICON_SIZE} />
        </ToolbarIconButton>

        <ToolbarIconButton isDisabled={!canRedo} label="Redo" onPress={onRedo}>
          <Redo2 size={ICON_SIZE} />
        </ToolbarIconButton>
      </div>

      <div className="flex items-center gap-2">
        <ToolbarIconButton label="Toggle grid" variant={showGrid ? 'primary' : 'ghost'} onPress={onToggleGrid}>
          <Grid3X3 size={ICON_SIZE} />
        </ToolbarIconButton>

        <ToolbarIconButton
          label="Toggle guides"
          variant={showGuides ? 'primary' : 'ghost'}
          onPress={() => {
            onToggleGuides?.();
          }}
        >
          <Waypoints size={ICON_SIZE} />
        </ToolbarIconButton>

        <Chip color="default" size="sm" variant="soft">
          {String(Math.round(zoomPercent))}%
        </Chip>
      </div>
    </Toolbar>
  );
}

export interface ElementLibraryProps {
  readonly elementTypes: readonly ElementTypeInfo[];
  readonly activeType?: string | null | undefined;
  readonly onSelect: (type: string) => void;
}

export function ElementLibrary({ elementTypes, activeType = null, onSelect }: ElementLibraryProps): JSX.Element {
  return (
    <section aria-label="Element library" className="flex flex-col gap-2" style={glassPanelStyle()}>
      <div className="px-3 pt-3 text-sm font-semibold">Elements</div>
      <div
        data-columns="2"
        data-testid="element-library-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: sp('sp-03'),
          padding: `0 ${sp('sp-03')} ${sp('sp-03')}`,
        }}
      >
        {elementTypes.map((info) => (
          <Button
            key={info.type}
            aria-label={info.label}
            className="justify-start"
            size="sm"
            variant={info.type === activeType ? 'primary' : 'ghost'}
            onPress={() => {
              onSelect(info.type);
            }}
          >
            <span className="inline-flex items-center gap-2">
              {info.icon ?? <Square size={ICON_SIZE} />}
              {info.label}
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}

export interface PageInfo {
  readonly id: string;
  readonly name?: string | undefined;
}

export interface PageSorterProps {
  readonly pages: readonly PageInfo[];
  readonly activePageIndex: number;
  readonly onPageSelect: (index: number) => void;
  readonly onPageAdd: () => void;
  readonly onPageRemove: (index: number) => void;
}

export function PageSorter({
  pages,
  activePageIndex,
  onPageSelect,
  onPageAdd,
  onPageRemove,
}: PageSorterProps): JSX.Element {
  return (
    <section aria-label="Scenes" className="flex items-center gap-2" style={glassPanelStyle()}>
      <Tabs
        aria-label="Scenes"
        selectedKey={String(activePageIndex)}
        onSelectionChange={(key) => {
          onPageSelect(Number(key));
        }}
      >
        <Tabs.List>
          {pages.map((page, index) => (
            <Tabs.Tab id={String(index)} key={page.id}>
              {`Scene ${String(index + 1)}`}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <ToolbarIconButton label="Add scene" onPress={onPageAdd}>
        <Plus size={ICON_SIZE} />
      </ToolbarIconButton>

      {pages.length > 1 ?
        <ToolbarIconButton
          label="Remove scene"
          onPress={() => {
            onPageRemove(activePageIndex);
          }}
        >
          <Minus size={ICON_SIZE} />
        </ToolbarIconButton>
      : null}
    </section>
  );
}
