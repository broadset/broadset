import type { ElementUpdate, ResizeHandle } from '@broadset/editor';

export const DOCUMENT_STORAGE_KEY = 'broadset:demo-document:v1';
export const RULER_SIZE = 20;
export const FLOATING_OFFSET = 8;
export const CONTEXT_MENU_WIDTH = 220;
export const CONTEXT_MENU_HEIGHT = 280;
export const SIDEBAR_EDGE_INSET = 72;
export const DEFAULT_SIDEBAR_WIDTH = 320;
export const MAX_SIDEBAR_WIDTH = 800;
export const MIN_SIDEBAR_WIDTH = 256;
export const SIDEBAR_TOP_OFFSET = 72;
export const MAX_CANVAS_ZOOM = 4;
export const MIN_CANVAS_ZOOM = 0.1;
export const ZOOM_STEP = 0.1;
export const TRANSFORM_HANDLE_SIZE = 10;
export const ROTATION_HANDLE_OFFSET = 28;
export const MIN_TRANSFORM_SIZE = 12;
export const SIDEBAR_STORAGE_KEY = 'broadset:demo-sidebar-preferences:v1';

export const TOAST_DISMISS_MS = {
  error: 5000,
  info: 3000,
  success: 3000,
} as const;

export type SidebarTab = 'layers' | 'properties' | 'animation' | 'preflight' | 'template-groups';
export type ToastSeverity = keyof typeof TOAST_DISMISS_MS;
export type ActiveDialog =
  | 'about'
  | 'export'
  | 'format-import-warnings'
  | 'media-library'
  | 'new-document'
  | 'settings'
  | 'shortcuts'
  | 'template-browser'
  | null;

export interface SidebarPreferences {
  readonly isOpen: boolean;
  readonly tab: SidebarTab;
  readonly width: number;
}

export interface ContextMenuState {
  readonly elementId: string | null;
  readonly hasClipboardContents: boolean;
  readonly x: number;
  readonly y: number;
}

export type TransformGesture =
  | {
      readonly kind: 'drag';
      readonly startX: number;
      readonly startY: number;
      readonly initialPosition: { readonly x: number; readonly y: number };
      lastUpdate: ElementUpdate | null;
    }
  | {
      readonly kind: 'resize';
      readonly startX: number;
      readonly startY: number;
      readonly initialRect: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      };
      readonly handle: ResizeHandle;
      lastUpdate: ElementUpdate | null;
    }
  | {
      readonly kind: 'rotate';
      readonly startAngle: number;
      readonly initialRotation: number;
      lastUpdate: ElementUpdate | null;
    };

export const TRANSFORM_HANDLE_CURSORS: Readonly<Record<ResizeHandle, React.CSSProperties['cursor']>> = {
  e: 'ew-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  nw: 'nwse-resize',
  s: 'ns-resize',
  se: 'nwse-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};
