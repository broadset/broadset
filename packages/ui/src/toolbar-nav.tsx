import { Button, Chip, Dropdown, Kbd, Label, Separator, Tabs, Toolbar, Tooltip } from '@heroui/react';
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
    <Tooltip delay={0}>
      <Button aria-label={label} isDisabled={isDisabled} isIconOnly size="sm" variant={variant} onPress={onPress}>
        {children}
      </Button>
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
    <section
      aria-label="Scenes"
      className="flex items-center gap-2"
      data-testid="scene-strip"
      style={glassPanelStyle()}
    >
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

const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl+';

interface ContextMenuPosition {
  readonly x: number;
  readonly y: number;
}

export interface CanvasContextMenuProps {
  readonly isOpen: boolean;
  readonly position: ContextMenuPosition;
  readonly hasSelection: boolean;
  readonly isLocked: boolean;
  readonly isRequired: boolean;
  readonly isMultiSelect: boolean;
  readonly isGroupSelected: boolean;
  readonly isPathElement: boolean;
  readonly hasClipPathCapability: boolean;
  readonly hasClipboard: boolean;
  readonly onCut: () => void;
  readonly onCopy: () => void;
  readonly onPaste: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onBringToFront: () => void;
  readonly onBringForward: () => void;
  readonly onSendBackward: () => void;
  readonly onSendToBack: () => void;
  readonly onGroup: () => void;
  readonly onUngroup: () => void;
  readonly onToggleLock: () => void;
  readonly onEditClipPath: () => void;
  readonly onEditPathPoints: () => void;
  readonly onClose: () => void;
}

function computeDisabledKeys(props: CanvasContextMenuProps): readonly string[] {
  const disabled: string[] = [];

  if (!props.hasSelection) {
    disabled.push(
      'cut',
      'copy',
      'duplicate',
      'delete',
      'bring-to-front',
      'bring-forward',
      'send-backward',
      'send-to-back',
      'toggle-lock',
    );
  }

  if (props.isLocked) {
    disabled.push('cut', 'duplicate', 'delete');
  }

  if (props.isRequired) {
    disabled.push('delete');
  }

  if (!props.hasClipboard) {
    disabled.push('paste');
  }

  if (props.isMultiSelect && !props.isGroupSelected) {
    disabled.push('ungroup');
  }

  return disabled;
}

const ACTION_MAP: Readonly<Record<string, keyof CanvasContextMenuProps>> = {
  cut: 'onCut',
  copy: 'onCopy',
  paste: 'onPaste',
  duplicate: 'onDuplicate',
  delete: 'onDelete',
  'bring-to-front': 'onBringToFront',
  'bring-forward': 'onBringForward',
  'send-backward': 'onSendBackward',
  'send-to-back': 'onSendToBack',
  group: 'onGroup',
  ungroup: 'onUngroup',
  'toggle-lock': 'onToggleLock',
  'edit-clip-path': 'onEditClipPath',
  'edit-path': 'onEditPathPoints',
} as const;

export function CanvasContextMenu(props: CanvasContextMenuProps): JSX.Element | null {
  const disabledKeys = computeDisabledKeys(props);

  function handleAction(key: string | number): void {
    const callbackKey = ACTION_MAP[String(key)];

    if (callbackKey !== undefined) {
      const callback = props[callbackKey];

      if (typeof callback === 'function') {
        callback();
      }
    }

    props.onClose();
  }

  const pasteOnlyMenu = (
    <Dropdown.Menu aria-label="Context menu" disabledKeys={disabledKeys} onAction={handleAction}>
      <Dropdown.Item id="paste" textValue="Paste">
        <Label>Paste</Label>
        <Kbd slot="keyboard">{MOD_KEY}V</Kbd>
      </Dropdown.Item>
    </Dropdown.Menu>
  );

  const fullMenu = (
    <Dropdown.Menu aria-label="Context menu" disabledKeys={disabledKeys} onAction={handleAction}>
      <Dropdown.Item id="cut" textValue="Cut">
        <Label>Cut</Label>
        <Kbd slot="keyboard">{MOD_KEY}X</Kbd>
      </Dropdown.Item>
      <Dropdown.Item id="copy" textValue="Copy">
        <Label>Copy</Label>
        <Kbd slot="keyboard">{MOD_KEY}C</Kbd>
      </Dropdown.Item>
      <Dropdown.Item id="paste" textValue="Paste">
        <Label>Paste</Label>
        <Kbd slot="keyboard">{MOD_KEY}V</Kbd>
      </Dropdown.Item>
      <Dropdown.Item id="duplicate" textValue="Duplicate">
        <Label>Duplicate</Label>
        <Kbd slot="keyboard">{MOD_KEY}D</Kbd>
      </Dropdown.Item>

      <Separator />

      <Dropdown.Item id="delete" textValue="Delete" variant="danger">
        <Label>Delete</Label>
        <Kbd slot="keyboard">⌫</Kbd>
      </Dropdown.Item>

      <Separator />

      <Dropdown.Item id="bring-to-front" textValue="Bring to Front">
        <Label>Bring to Front</Label>
      </Dropdown.Item>
      <Dropdown.Item id="bring-forward" textValue="Bring Forward">
        <Label>Bring Forward</Label>
        <Kbd slot="keyboard">]</Kbd>
      </Dropdown.Item>
      <Dropdown.Item id="send-backward" textValue="Send Backward">
        <Label>Send Backward</Label>
        <Kbd slot="keyboard">[</Kbd>
      </Dropdown.Item>
      <Dropdown.Item id="send-to-back" textValue="Send to Back">
        <Label>Send to Back</Label>
      </Dropdown.Item>

      {props.isMultiSelect ?
        <>
          <Separator />
          <Dropdown.Item id="group" textValue="Group">
            <Label>Group</Label>
            <Kbd slot="keyboard">{MOD_KEY}G</Kbd>
          </Dropdown.Item>
          <Dropdown.Item id="ungroup" textValue="Ungroup">
            <Label>Ungroup</Label>
            <Kbd slot="keyboard">{MOD_KEY}⇧G</Kbd>
          </Dropdown.Item>
        </>
      : null}

      <Separator />

      <Dropdown.Item id="toggle-lock" textValue={props.isLocked ? 'Unlock' : 'Lock'}>
        <Label>{props.isLocked ? 'Unlock' : 'Lock'}</Label>
        <Kbd slot="keyboard">{MOD_KEY}L</Kbd>
      </Dropdown.Item>

      {props.hasClipPathCapability ?
        <Dropdown.Item id="edit-clip-path" textValue="Edit Clip Path">
          <Label>Edit Clip Path</Label>
        </Dropdown.Item>
      : null}

      {props.isPathElement ?
        <Dropdown.Item id="edit-path" textValue="Edit Path Points">
          <Label>Edit Path Points</Label>
        </Dropdown.Item>
      : null}
    </Dropdown.Menu>
  );

  return (
    <Dropdown
      isOpen={props.isOpen}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <Dropdown.Trigger>
        <span style={{ position: 'fixed', left: props.position.x, top: props.position.y, width: 0, height: 0 }} />
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom start">{props.hasSelection ? fullMenu : pasteOnlyMenu}</Dropdown.Popover>
    </Dropdown>
  );
}
