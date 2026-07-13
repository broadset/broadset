import { getEditorElementRectV1, type ProjectEditorStore, selectActiveDocumentV1 } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { color, glassPanelStyle } from '@broadset/ui';
import { Card, CardContent, Dropdown } from '@heroui/react';
import { Copy, FolderOpen, Scissors, Trash2 } from 'lucide-react';

import { useEditorSelector } from './helpers';

interface V1CanvasContextMenuProps {
  readonly editorStore: ProjectEditorStore;
  readonly elementId: projectFormatV1.Id | null;
  readonly hasClipboardContents: boolean;
  readonly onClose: () => void;
  readonly onCopy: () => void;
  readonly onCut: () => void;
  readonly onPaste: () => void;
  readonly x: number;
  readonly y: number;
}

function groupSelection(editorStore: ProjectEditorStore): void {
  const state = editorStore.getState();
  const document = selectActiveDocumentV1(state);
  const selectedIds = new Set(state.activeElementIds);
  const selected = document?.elements.filter((element) => selectedIds.has(element.id)) ?? [];
  const first = selected[0];

  if (first === undefined || selected.length < 2) return;

  // v1 grouping intentionally accepts sibling selections only; mixed-parent selections keep their hierarchy unchanged.
  if (selected.some((element) => element.parentId !== first.parentId)) return;

  const group = projectFormatV1.createElementV1({
    id: projectFormatV1.idSchema.parse(crypto.randomUUID()),
    name: 'Group',
    parentId: first.parentId,
    geometry: projectFormatV1.createElementGeometry({ width: 1, height: 1 }),
    kind: 'group',
  });
  const groupId = state.addElement(group);

  if (groupId === null) return;

  selected.forEach((element) => {
    editorStore.getState().reparentElement(element.id, groupId);
  });
  editorStore.getState().selectElement(groupId);
}

function ungroupSelection(editorStore: ProjectEditorStore): void {
  const state = editorStore.getState();
  const document = selectActiveDocumentV1(state);

  if (document === undefined) return;

  const selectedIds = new Set(state.activeElementIds);
  const selected = document.elements.filter((element) => selectedIds.has(element.id));
  const selectedGroupIds = new Set(
    selected.flatMap((element) => {
      if (element.kind === 'group') return [element.id];

      return element.parentId === null ? [] : [element.parentId];
    }),
  );
  const nextSelection: projectFormatV1.Id[] = [];

  selectedGroupIds.forEach((groupId) => {
    const group = document.elements.find((element) => element.id === groupId && element.kind === 'group');

    if (group === undefined) return;

    const children = document.elements.filter((element) => element.parentId === group.id);

    children.forEach((child) => {
      if (editorStore.getState().reparentElement(child.id, group.parentId)) nextSelection.push(child.id);
    });
    editorStore.getState().removeElement(group.id);
  });

  editorStore.getState().setActiveElements(nextSelection);
}

function createDefaultClipPath(target: projectFormatV1.Element): projectFormatV1.Element {
  const rect = getEditorElementRectV1(target);
  const pointIds = [0, 1, 2, 3].map(() => projectFormatV1.idSchema.parse(crypto.randomUUID()));
  const [topLeftId, topRightId, bottomRightId, bottomLeftId] = pointIds;

  if (
    topLeftId === undefined ||
    topRightId === undefined ||
    bottomRightId === undefined ||
    bottomLeftId === undefined
  ) {
    return target;
  }

  return projectFormatV1.createElementV1({
    id: projectFormatV1.idSchema.parse(crypto.randomUUID()),
    name: `${target.name} clip path`,
    hiddenInEditor: true,
    geometry: projectFormatV1.createElementGeometry({
      width: rect.width,
      height: rect.height,
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, rect.x, rect.y] },
    }),
    kind: 'vector',
    geometryData: {
      kind: 'path',
      fillRule: 'nonzero',
      path: {
        points: [
          { id: topLeftId, x: 0, y: 0 },
          { id: topRightId, x: rect.width, y: 0 },
          { id: bottomRightId, x: rect.width, y: rect.height },
          { id: bottomLeftId, x: 0, y: rect.height },
        ],
        segments: [
          { id: projectFormatV1.idSchema.parse(crypto.randomUUID()), kind: 'move', pointId: topLeftId },
          { id: projectFormatV1.idSchema.parse(crypto.randomUUID()), kind: 'line', pointId: topRightId },
          { id: projectFormatV1.idSchema.parse(crypto.randomUUID()), kind: 'line', pointId: bottomRightId },
          { id: projectFormatV1.idSchema.parse(crypto.randomUUID()), kind: 'line', pointId: bottomLeftId },
          { id: projectFormatV1.idSchema.parse(crypto.randomUUID()), kind: 'close' },
        ],
        closed: true,
      },
    },
  });
}

function startClipPathEditing(editorStore: ProjectEditorStore, target: projectFormatV1.Element): void {
  const existingClipId = target.appearance.clip?.kind === 'vector' ? target.appearance.clip.vectorElementId : undefined;

  if (existingClipId === undefined) {
    const clip = createDefaultClipPath(target);

    if (clip === target) return;

    editorStore.getState().updateActiveDocument((document) => ({
      ...document,
      elements: [...document.elements, clip],
    }));
    editorStore.getState().updateElement(target.id, (element) => ({
      ...element,
      appearance: {
        ...element.appearance,
        clip: { kind: 'vector', vectorElementId: clip.id, fillRule: 'nonzero' },
      },
    }));
  }

  editorStore.getState().enterClipPathEditing(target.id);
}

export function V1CanvasContextMenu({
  editorStore,
  elementId,
  hasClipboardContents,
  onClose,
  onCopy,
  onCut,
  onPaste,
  x,
  y,
}: V1CanvasContextMenuProps): React.JSX.Element {
  const state = useEditorSelector(editorStore, (current) => current);
  const document = selectActiveDocumentV1(state);
  const contextElement = document?.elements.find((element) => element.id === elementId) ?? null;
  const destructiveDisabled = contextElement?.locked === true;

  return (
    <Card
      data-testid="demo-context-menu"
      role="menu"
      style={{
        ...glassPanelStyle(),
        left: `${String(x)}px`,
        position: 'fixed',
        top: `${String(y)}px`,
        width: 220,
        zIndex: 40,
      }}
      variant="secondary"
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <CardContent className="p-2">
        <Dropdown.Menu aria-label="Canvas context menu">
          {contextElement === null ?
            <Dropdown.Item key="paste-selection" isDisabled={!hasClipboardContents} onAction={onPaste}>
              <span className="inline-flex w-full items-center gap-2">
                <FolderOpen size={14} />
                <span>Paste</span>
              </span>
            </Dropdown.Item>
          : <>
              <Dropdown.Item key="cut-selection" isDisabled={destructiveDisabled} onAction={onCut}>
                <span className="inline-flex w-full items-center gap-2">
                  <Scissors size={14} />
                  <span>Cut</span>
                </span>
              </Dropdown.Item>
              <Dropdown.Item key="copy-selection" onAction={onCopy}>
                <span className="inline-flex w-full items-center gap-2">
                  <Copy size={14} />
                  <span>Copy</span>
                </span>
              </Dropdown.Item>
              <Dropdown.Item key="paste-selection" isDisabled={!hasClipboardContents} onAction={onPaste}>
                <span className="inline-flex w-full items-center gap-2">
                  <FolderOpen size={14} />
                  <span>Paste</span>
                </span>
              </Dropdown.Item>
              <Dropdown.Item
                key="bring-forward"
                onAction={() => {
                  state.reorderElement(contextElement.id, 'forward');
                  onClose();
                }}
              >
                Bring forward
              </Dropdown.Item>
              <Dropdown.Item
                key="send-backward"
                onAction={() => {
                  state.reorderElement(contextElement.id, 'backward');
                  onClose();
                }}
              >
                Send backward
              </Dropdown.Item>
              {contextElement.kind === 'vector' && contextElement.geometryData.kind === 'path' ?
                <Dropdown.Item
                  key="edit-path-points"
                  onAction={() => {
                    state.enterPathEditing(contextElement.id);
                    onClose();
                  }}
                >
                  Edit path points
                </Dropdown.Item>
              : null}
              {contextElement.kind !== 'audio' ?
                <Dropdown.Item
                  key="edit-clip-path"
                  onAction={() => {
                    startClipPathEditing(editorStore, contextElement);
                    onClose();
                  }}
                >
                  Edit clip path
                </Dropdown.Item>
              : null}
              {state.activeElementIds.length > 1 ?
                <>
                  <Dropdown.Item
                    key="group-selection"
                    onAction={() => {
                      groupSelection(editorStore);
                      onClose();
                    }}
                  >
                    Group
                  </Dropdown.Item>
                  <Dropdown.Item
                    key="ungroup-selection"
                    onAction={() => {
                      ungroupSelection(editorStore);
                      onClose();
                    }}
                  >
                    Ungroup
                  </Dropdown.Item>
                </>
              : null}
              <Dropdown.Item
                key="toggle-lock"
                onAction={() => {
                  state.toggleLock(contextElement.id);
                  onClose();
                }}
              >
                {contextElement.locked ? 'Unlock' : 'Lock'}
              </Dropdown.Item>
              <Dropdown.Item
                key="delete-selection"
                isDisabled={destructiveDisabled}
                style={{ color: color('danger') }}
                onAction={() => {
                  state.removeElements(state.activeElementIds);
                  onClose();
                }}
              >
                <span className="inline-flex w-full items-center gap-2">
                  <Trash2 size={14} />
                  <span>Delete</span>
                </span>
              </Dropdown.Item>
            </>
          }
        </Dropdown.Menu>
      </CardContent>
    </Card>
  );
}
