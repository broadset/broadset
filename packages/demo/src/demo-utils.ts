import type { ResizeHandle } from '@broadset/editor';
import { type BroadsetDocument, broadsetDocumentSchema, type BroadsetElement } from '@broadset/model';
import type { LayerInfo, PanelElement } from '@broadset/ui';

import {
  DEFAULT_SIDEBAR_WIDTH,
  DOCUMENT_STORAGE_KEY,
  MAX_CANVAS_ZOOM,
  MAX_SIDEBAR_WIDTH,
  MIN_CANVAS_ZOOM,
  MIN_SIDEBAR_WIDTH,
  MIN_TRANSFORM_SIZE,
  SIDEBAR_STORAGE_KEY,
  type SidebarPreferences,
} from './demo-types';
import { DEMO_DOCUMENT } from './sampleDocument';

export function normalizeTransformRect(
  rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  handle: ResizeHandle,
): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  let { x, y, width, height } = rect;

  if (width < MIN_TRANSFORM_SIZE) {
    if (handle.includes('w')) {
      x += width - MIN_TRANSFORM_SIZE;
    }

    width = MIN_TRANSFORM_SIZE;
  }

  if (height < MIN_TRANSFORM_SIZE) {
    if (handle.includes('n')) {
      y += height - MIN_TRANSFORM_SIZE;
    }

    height = MIN_TRANSFORM_SIZE;
  }

  return { x, y, width, height };
}

export function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

export function clampCanvasZoom(zoom: number): number {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Math.round(zoom * 100) / 100));
}

export function loadSavedDocument(): BroadsetDocument {
  try {
    if (typeof window === 'undefined') {
      return DEMO_DOCUMENT;
    }

    const stored = window.localStorage.getItem(DOCUMENT_STORAGE_KEY);

    if (stored === null) {
      return DEMO_DOCUMENT;
    }

    return broadsetDocumentSchema.parse(JSON.parse(stored));
  } catch {
    return DEMO_DOCUMENT;
  }
}

export function loadSidebarPreferences(): SidebarPreferences {
  const defaults: SidebarPreferences = {
    isOpen: true,
    tab: 'properties',
    width: DEFAULT_SIDEBAR_WIDTH,
  };

  try {
    if (typeof window === 'undefined') {
      return defaults;
    }

    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);

    if (stored === null) {
      return defaults;
    }

    const parsed = JSON.parse(stored) as Partial<Record<'isOpen' | 'tab' | 'width', unknown>>;
    const storedTab = parsed['tab'];

    return {
      isOpen: typeof parsed['isOpen'] === 'boolean' ? parsed['isOpen'] : defaults.isOpen,
      tab:
        (
          storedTab === 'layers' ||
          storedTab === 'properties' ||
          storedTab === 'animation' ||
          storedTab === 'preflight' ||
          storedTab === 'template-groups'
        ) ?
          storedTab
        : defaults.tab,
      width: typeof parsed['width'] === 'number' ? clampSidebarWidth(parsed['width']) : defaults.width,
    };
  } catch {
    return defaults;
  }
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA')
  );
}

export function downloadJsonFile(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

export function toPanelElement(element: BroadsetElement): PanelElement {
  const borderRadiusValue: readonly [number, number, number, number] =
    element.style.borderRadius ?? ([0, 0, 0, 0] as const);

  const paddingValue: readonly [number, number, number, number] = element.style.padding ?? ([0, 0, 0, 0] as const);

  return {
    id: element.id,
    type: element.type,
    name: element.name,
    content: element.content,
    x: element.position.x,
    y: element.position.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    backgroundColor: element.style.backgroundColor ?? '',
    backgroundGradient:
      typeof element.style.backgroundGradient === 'string' ? element.style.backgroundGradient
      : element.style.backgroundGradient === undefined ? ''
      : JSON.stringify(element.style.backgroundGradient),
    borderWidth: element.style.borderWidth ?? 0,
    borderColor: element.style.borderColor ?? '',
    borderStyle: typeof element.style.borderStyle === 'string' ? element.style.borderStyle : 'solid',
    borderRadius: borderRadiusValue,
    opacity: element.style.opacity,
    blendMode: typeof element.style.mixBlendMode === 'string' ? element.style.mixBlendMode : 'normal',
    mixBlendMode: typeof element.style.mixBlendMode === 'string' ? element.style.mixBlendMode : 'normal',
    isolation: element.style.isolation ?? 'auto',
    boxShadow: element.style.boxShadow ?? '',
    filter: element.style.filter ?? '',
    backdropFilter: element.style.backdropFilter ?? '',
    fontFamily: element.style.fontFamily ?? '',
    fontSize: element.style.fontSize ?? 16,
    fontColor: element.style.fontColor ?? '#000000',
    fontWeight: element.style.fontWeight ?? 400,
    fontStyle: element.style.fontStyle ?? 'normal',
    textAlignment: element.style.textAlignment ?? 'left',
    verticalAlignment: element.style.verticalAlignment ?? 'top',
    textDecoration: element.style.textDecoration ?? 'none',
    textTransform: element.style.textTransform ?? 'none',
    letterSpacing: element.style.letterSpacing ?? 0,
    lineHeight:
      typeof element.style.lineHeight === 'number' ?
        String(element.style.lineHeight)
      : (element.style.lineHeight ?? 'normal'),
    wordSpacing: element.style.wordSpacing ?? 0,
    textStroke: element.style.textStroke ?? '',
    textShadow: element.style.textShadow ?? '',
    writingMode: element.style.writingMode ?? 'horizontal-tb',
    fontVariationSettings: element.style.fontVariationSettings ?? '',
    padding: paddingValue,
    stroke: element.style.stroke ?? '',
    strokeWidth: element.style.strokeWidth ?? 1,
    strokeDasharray: element.style.strokeDasharray ?? '',
    strokeDashoffset: element.style.strokeDashoffset ?? 0,
    strokeLinecap: element.style.strokeLinecap ?? 'butt',
    strokeLinejoin: element.style.strokeLinejoin ?? 'miter',
    strokeOpacity: element.style.strokeOpacity ?? 1,
    fill: element.style.fill ?? '',
    fillOpacity: element.style.fillOpacity ?? 1,
    fillRule: element.style.fillRule ?? 'nonzero',
    trimStart: element.style.trimStart ?? 0,
    trimEnd: element.style.trimEnd ?? 1,
    trimOffset: element.style.trimOffset ?? 0,
    maskType: element.style.maskType ?? 'none',
    customClipPath: element.style.customClipPath ?? '',
    clipChildren: element.style.clipChildren ?? false,
    rotateX: element.style.rotateX ?? 0,
    rotateY: element.style.rotateY ?? 0,
    rotateZ: element.style.rotateZ ?? 0,
    translateZ: element.style.translateZ ?? 0,
    objectFit: element.style.objectFit ?? 'fill',
    autoSize: element.autoSize,
    errorCorrection: 'M',
    qrForegroundColor: '#000000',
    qrBackgroundColor: '#ffffff',
    booleanOperation: element.booleanOperation,
  };
}

export function toLayerInfo(element: BroadsetElement, visible: boolean): LayerInfo {
  return {
    id: element.id,
    type: element.type,
    name: element.name,
    locked: element.locked,
    visible,
  };
}

export function greatestCommonDivisor(left: number, right: number): number {
  if (right === 0) {
    return left;
  }

  return greatestCommonDivisor(right, left % right);
}

export function formatResolutionLabel(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);

  return `${String(width)}×${String(height)} — ${String(width / divisor)}:${String(height / divisor)}`;
}
