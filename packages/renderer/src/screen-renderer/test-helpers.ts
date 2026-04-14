import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { createDefaultStyle } from '@broadset/model';

export function createElement(
  overrides: Partial<BroadsetElement> & Pick<BroadsetElement, 'id' | 'type'>,
): BroadsetElement {
  return {
    id: overrides.id,
    type: overrides.type,
    name: overrides.name ?? overrides.id,
    locked: false,
    position: overrides.position ?? { x: 0, y: 0 },
    width: overrides.width ?? 160,
    height: overrides.height ?? 80,
    rotation: overrides.rotation ?? 0,
    content: overrides.content ?? '',
    style: {
      ...createDefaultStyle(),
      ...(overrides.style ?? {}),
    },
    parentId: overrides.parentId ?? null,
    groupId: overrides.groupId ?? null,
    assetId: overrides.assetId ?? null,
    dataField: overrides.dataField ?? null,
    visibleWhen: overrides.visibleWhen ?? null,
    repeater: overrides.repeater ?? null,
    typeConfig: overrides.typeConfig ?? null,
    componentRef: overrides.componentRef ?? null,
    autoSize: overrides.autoSize ?? 'fixed',
    textPathElementId: overrides.textPathElementId ?? null,
    booleanOperation: overrides.booleanOperation ?? null,
    extensions: overrides.extensions ?? {},
  };
}

export function createDocument(elements: readonly BroadsetElement[]): BroadsetDocument {
  return {
    id: 'doc-renderer-test',
    name: 'Renderer Test Document',
    documentMode: 'screen',
    canvas: {
      width: 1280,
      height: 720,
      unit: 'px',
      dpi: 96,
      padding: [0, 0, 0, 0],
      backgroundColor: '#101828',
      backgroundMode: 'solid',
    },
    elements,
    animations: [],
    pages: [{ id: 'page-1', name: 'Default', overrides: [], locale: null, extensions: {} }],
    dataSchema: { fields: [] },
    extensions: {},
  };
}
