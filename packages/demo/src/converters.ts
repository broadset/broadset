import type { EditorDocument, EditorPage } from '@broadset/editor';
import type { BroadsetDocument, BroadsetElement, PageElement } from '@broadset/model';
import type { LayerInfo, PanelElement } from '@broadset/ui';

import { SAMPLE_DOCUMENT } from './sampleDocument';

export function sampleToEditorDocument(): EditorDocument {
  return {
    id: SAMPLE_DOCUMENT.id,
    documentMode: SAMPLE_DOCUMENT.documentMode,
    canvas: SAMPLE_DOCUMENT.canvas,
    pages: SAMPLE_DOCUMENT.pages.map(
      (page): EditorPage => ({
        id: page.id,
        elements: page.elements.map(
          (el): BroadsetElement => ({
            id: el.id,
            type: el.type,
            position: el.position,
            width: el.width,
            height: el.height,
            rotation: el.rotation,
            content: el.content,
            parentId: el.parentId,
            groupId: el.groupId,
            screen: el.screen,
            style: el.style,
          }),
        ),
      }),
    ),
    animationRegistry: SAMPLE_DOCUMENT.animationRegistry,
  };
}

function elementToPageElement(el: BroadsetElement): PageElement {
  return {
    id: el.id,
    type: el.type,
    position: el.position,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    content: el.content,
    parentId: el.parentId,
    groupId: el.groupId,
    screen: Object.fromEntries(Object.entries(el.screen)),
    style: Object.fromEntries(Object.entries(el.style)),
  };
}

export function toRendererDoc(doc: EditorDocument): BroadsetDocument {
  return {
    id: doc.id,
    documentMode: doc.documentMode,
    canvas: doc.canvas,
    pages: doc.pages.map((page) => ({
      id: page.id,
      elements: page.elements.map(elementToPageElement),
    })),
    animationRegistry: doc.animationRegistry,
  };
}

export function elementToPanelElement(el: BroadsetElement): PanelElement {
  return {
    id: el.id,
    type: el.type,
    name: el.content || el.id,
    x: el.position.x,
    y: el.position.y,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    backgroundColor: el.style.backgroundColor ?? '',
    backgroundGradient: el.style.backgroundGradient ?? '',
    borderWidth: el.style.borderWidth ?? 0,
    borderColor: el.style.borderColor ?? '',
    borderStyle: el.style.borderStyle ?? 'none',
    borderRadius: typeof el.style.borderRadius === 'number' ? el.style.borderRadius : 0,
    opacity: el.style.opacity,
    blendMode: el.style.mixBlendMode ?? 'normal',
    boxShadow: el.style.boxShadow ?? '',
    filter: el.style.filter ?? '',
    backdropFilter: el.style.backdropFilter ?? '',
  };
}

export function elementsToLayers(elements: readonly BroadsetElement[]): readonly LayerInfo[] {
  return elements.map((el) => ({
    id: el.id,
    type: el.type,
    name: el.content || el.id,
    locked: el.screen.locked,
    visible: el.screen.visibility !== 'offscreen',
  }));
}
