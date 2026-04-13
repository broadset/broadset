import { startClipPathEditing, startMotionPathEditing } from '@broadset/editor';
import { color, glassPanelStyle } from '@broadset/ui';
import { Card, CardContent, Dropdown } from '@heroui/react';
import { Copy, FolderOpen, Scissors, Trash2 } from 'lucide-react';

import { RULER_SIZE } from '../demo-types';
import type { DemoAppLayoutProps } from './layout-types';

export function LayoutContextMenu(props: DemoAppLayoutProps): React.JSX.Element | null {
  const {
    clipboardRef,
    contextMenu,
    contextMenuElement,
    destructiveContextActionDisabled,
    editorState,
    editorStore,
    handleCopySelection,
    handleCutSelection,
    handleDuplicateSelection,
    pasteClipboardElements,
    pushToast,
    setContextMenu,
  } = props;

  if (contextMenu === null) {
    return null;
  }

  return (
    <Card
      className="absolute z-40"
      data-testid="demo-context-menu"
      role="menu"
      style={{
        ...glassPanelStyle(),
        left: `${String(contextMenu.x - RULER_SIZE)}px`,
        top: `${String(contextMenu.y - RULER_SIZE)}px`,
        width: '220px',
      }}
      variant="secondary"
    >
      <CardContent className="p-2">
        <Dropdown.Menu aria-label="Canvas context menu">
          {contextMenuElement === null ?
            <Dropdown.Item
              key="paste-selection"
              isDisabled={clipboardRef.current.length === 0}
              onAction={pasteClipboardElements}
            >
              <span className="inline-flex w-full items-center gap-2">
                <FolderOpen size={14} />
                <span>Paste</span>
                <span style={{ marginLeft: 'auto', opacity: 0.72 }}>Ctrl+V</span>
              </span>
            </Dropdown.Item>
          : <>
              <Dropdown.Item
                key="cut-selection"
                isDisabled={destructiveContextActionDisabled}
                onAction={handleCutSelection}
              >
                <span className="inline-flex w-full items-center gap-2">
                  <Scissors size={14} />
                  <span>Cut</span>
                  <span style={{ marginLeft: 'auto', opacity: 0.72 }}>Ctrl+X</span>
                </span>
              </Dropdown.Item>
              <Dropdown.Item key="copy-selection" onAction={handleCopySelection}>
                <span className="inline-flex w-full items-center gap-2">
                  <Copy size={14} />
                  <span>Copy</span>
                  <span style={{ marginLeft: 'auto', opacity: 0.72 }}>Ctrl+C</span>
                </span>
              </Dropdown.Item>
              <Dropdown.Item
                key="paste-selection"
                isDisabled={clipboardRef.current.length === 0}
                onAction={pasteClipboardElements}
              >
                <span className="inline-flex w-full items-center gap-2">
                  <FolderOpen size={14} />
                  <span>Paste</span>
                  <span style={{ marginLeft: 'auto', opacity: 0.72 }}>Ctrl+V</span>
                </span>
              </Dropdown.Item>
              <Dropdown.Item
                key="duplicate-selection"
                isDisabled={destructiveContextActionDisabled}
                onAction={handleDuplicateSelection}
              >
                <span className="inline-flex w-full items-center gap-2">
                  <Copy size={14} />
                  <span>Duplicate</span>
                  <span style={{ marginLeft: 'auto', opacity: 0.72 }}>Ctrl+D</span>
                </span>
              </Dropdown.Item>
              <Dropdown.Item
                key="bring-to-front"
                onAction={() => {
                  editorStore.getState().reorderElement(contextMenuElement.id, 'front');
                  setContextMenu(null);
                }}
              >
                Bring to front
              </Dropdown.Item>
              <Dropdown.Item
                key="bring-forward"
                onAction={() => {
                  editorStore.getState().reorderElement(contextMenuElement.id, 'forward');
                  setContextMenu(null);
                }}
              >
                <span className="inline-flex w-full items-center justify-between">
                  <span>Bring forward</span>
                  <span style={{ opacity: 0.72 }}>]</span>
                </span>
              </Dropdown.Item>
              <Dropdown.Item
                key="send-backward"
                onAction={() => {
                  editorStore.getState().reorderElement(contextMenuElement.id, 'backward');
                  setContextMenu(null);
                }}
              >
                <span className="inline-flex w-full items-center justify-between">
                  <span>Send backward</span>
                  <span style={{ opacity: 0.72 }}>[</span>
                </span>
              </Dropdown.Item>
              <Dropdown.Item
                key="send-to-back"
                onAction={() => {
                  editorStore.getState().reorderElement(contextMenuElement.id, 'back');
                  setContextMenu(null);
                }}
              >
                Send to back
              </Dropdown.Item>

              {editorState.activeElementIds.length > 1 ?
                <>
                  <Dropdown.Item
                    key="group-selection"
                    onAction={() => {
                      editorStore.getState().groupElements();
                      setContextMenu(null);
                    }}
                  >
                    <span className="inline-flex w-full items-center justify-between">
                      <span>Group</span>
                      <span style={{ opacity: 0.72 }}>Ctrl+G</span>
                    </span>
                  </Dropdown.Item>
                  <Dropdown.Item
                    key="ungroup-selection"
                    onAction={() => {
                      editorStore.getState().ungroupElements();
                      setContextMenu(null);
                    }}
                  >
                    <span className="inline-flex w-full items-center justify-between">
                      <span>Ungroup</span>
                      <span style={{ opacity: 0.72 }}>Ctrl+Shift+G</span>
                    </span>
                  </Dropdown.Item>
                </>
              : null}

              <Dropdown.Item
                key="toggle-lock"
                onAction={() => {
                  editorStore.getState().toggleLock(contextMenuElement.id);
                  setContextMenu(null);
                }}
              >
                <span className="inline-flex w-full items-center justify-between">
                  <span>{contextMenuElement.locked ? 'Unlock' : 'Lock'}</span>
                  <span style={{ opacity: 0.72 }}>Ctrl+L</span>
                </span>
              </Dropdown.Item>
              <Dropdown.Item
                key="edit-clip-path"
                onAction={() => {
                  startClipPathEditing(editorStore, contextMenuElement.id);
                  setContextMenu(null);
                }}
              >
                Edit clip path
              </Dropdown.Item>
              <Dropdown.Item
                key="edit-path-points"
                isDisabled={contextMenuElement.type !== 'path'}
                onAction={() => {
                  if (contextMenuElement.type === 'path') {
                    editorStore.getState().enterPathEditing(contextMenuElement.id);
                    pushToast('info', 'Path point editing is now active.');
                  }

                  setContextMenu(null);
                }}
              >
                Edit path points
              </Dropdown.Item>
              <Dropdown.Item
                key="edit-motion-path"
                onAction={() => {
                  startMotionPathEditing(editorStore, contextMenuElement.id);
                  setContextMenu(null);
                }}
              >
                Edit motion path
              </Dropdown.Item>
              <Dropdown.Item
                key="delete-selection"
                isDisabled={destructiveContextActionDisabled}
                style={{ color: color('danger') }}
                onAction={() => {
                  for (const elementId of editorStore.getState().activeElementIds) {
                    editorStore.getState().removeElement(elementId);
                  }

                  setContextMenu(null);
                }}
              >
                <span className="inline-flex w-full items-center gap-2">
                  <Trash2 size={14} />
                  <span>Delete</span>
                  <span style={{ marginLeft: 'auto', opacity: 0.72 }}>Del</span>
                </span>
              </Dropdown.Item>
            </>
          }
        </Dropdown.Menu>
      </CardContent>
    </Card>
  );
}
