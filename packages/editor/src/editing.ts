import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  type EditorConfig,
  editorConfigSchema,
  type FontDefinition,
  getCapabilityProfile,
} from '@broadset/model';

import { type ElementDefaults, getElementDefaults, type PluginDefaults } from './element-defaults';
import type { EditorStore } from './store-actions';

const COORDINATE_PRECISION = 2;

function roundCoordinate(value: number): number {
  const precisionFactor = 10 ** COORDINATE_PRECISION;

  return Math.round(value * precisionFactor) / precisionFactor;
}

export { getElementDefaults };
export type { ElementDefaults, PluginDefaults };

export function startPlacement(store: EditorStore, elementType: string): void {
  store.setState({
    pendingPlacementType: elementType,
    pathEditingElementId: null,
    pathDrawingElementId: null,
    clipPathEditingElementId: null,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: { type: 'placement', elementType },
  });
}

export function cancelPlacement(store: EditorStore): void {
  store.setState({
    pendingPlacementType: null,
    editingMode: { type: 'none' },
  });
}

export function placeElement(
  store: EditorStore,
  x: number,
  y: number,
  width?: number,
  height?: number,
  plugins: readonly PluginDefaults[] = [],
): string | null {
  const state = store.getState();
  const elementType = state.pendingPlacementType;

  if (elementType === null) {
    return null;
  }

  const defaults = getElementDefaults(elementType, plugins);
  const resolvedWidth = width ?? defaults.width;
  const resolvedHeight = height ?? defaults.height;
  const isCenterPlacement = width === undefined && height === undefined;
  const position =
    isCenterPlacement ?
      {
        x: roundCoordinate(x - resolvedWidth / 2),
        y: roundCoordinate(y - resolvedHeight / 2),
      }
    : {
        x: roundCoordinate(x),
        y: roundCoordinate(y),
      };

  const newElement = createDefaultElement(elementType, {
    position,
    width: resolvedWidth,
    height: resolvedHeight,
    content: defaults.content,
  });
  const entersPathDrawing = elementType === 'path';

  store.setState({
    document: {
      ...state.document,
      elements: [...state.document.elements, newElement],
    },
    activeElementIds: [newElement.id],
    pendingPlacementType: null,
    pathEditingElementId: null,
    pathDrawingElementId: entersPathDrawing ? newElement.id : null,
    clipPathEditingElementId: null,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: entersPathDrawing ? { type: 'path-drawing', elementId: newElement.id } : { type: 'none' },
  });

  return newElement.id;
}

export function startPathEditing(store: EditorStore, elementId: string): void {
  store.setState({
    activeElementIds: [elementId],
    pendingPlacementType: null,
    pathEditingElementId: elementId,
    pathDrawingElementId: null,
    clipPathEditingElementId: null,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: { type: 'path-editing', elementId },
  });
}

export function stopPathEditing(store: EditorStore): void {
  const state = store.getState();

  store.setState({
    pathEditingElementId: null,
    editingMode:
      state.pendingPlacementType !== null ? { type: 'placement', elementType: state.pendingPlacementType }
      : state.pathDrawingElementId !== null ? { type: 'path-drawing', elementId: state.pathDrawingElementId }
      : { type: 'none' },
  });
}

export function startPathDrawing(store: EditorStore, elementId: string): void {
  store.setState({
    activeElementIds: [elementId],
    pendingPlacementType: null,
    pathEditingElementId: null,
    pathDrawingElementId: elementId,
    clipPathEditingElementId: null,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: { type: 'path-drawing', elementId },
  });
}

export function stopPathDrawing(store: EditorStore): void {
  const state = store.getState();

  store.setState({
    pathDrawingElementId: null,
    editingMode:
      state.pendingPlacementType !== null ? { type: 'placement', elementType: state.pendingPlacementType }
      : state.pathEditingElementId !== null ? { type: 'path-editing', elementId: state.pathEditingElementId }
      : { type: 'none' },
  });
}

/**
 * Close the drawing path by appending Z and exit drawing mode (Enter behavior).
 */
export function closeAndStopPathDrawing(store: EditorStore): void {
  const state = store.getState();
  const drawingElementId = state.pathDrawingElementId;

  if (drawingElementId !== null) {
    const element = state.document.elements.find((candidate) => candidate.id === drawingElementId);

    if (element !== undefined && element.content.length > 0) {
      store.setState({
        document: {
          ...state.document,
          elements: state.document.elements.map((candidate) =>
            candidate.id === drawingElementId ? { ...candidate, content: `${candidate.content} Z` } : candidate,
          ),
        },
      });
    }
  }

  stopPathDrawing(store);
}

/**
 * Commit the current drawing path as-is and exit drawing mode (Escape behavior).
 */
export function commitAndStopPathDrawing(store: EditorStore): void {
  stopPathDrawing(store);
}

/* ================================================================== */
/*  Clip-path editing                                                 */
/* ================================================================== */

const DEFAULT_CLIP_PATH = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
const MIN_CLIP_PATH_POINTS = 3;

/** Regex that extracts individual points from a CSS `polygon(...)` value. */
const POLYGON_POINT_PATTERN = /(-?\d+(?:\.\d+)?%?)\s+(-?\d+(?:\.\d+)?%?)/g;

/**
 * Parse a CSS polygon() value into an array of `{ x, y }` numeric percentage values.
 * Returns null if the value is not a polygon.
 */
function parsePolygonPoints(clipPath: string): { readonly x: number; readonly y: number }[] | null {
  const polygonMatch = /^polygon\(([^)]*)\)$/i.exec(clipPath.trim());

  if (polygonMatch === null || polygonMatch[1] === undefined) {
    return null;
  }

  const body = polygonMatch[1];
  const points: { readonly x: number; readonly y: number }[] = [];

  for (const match of body.matchAll(POLYGON_POINT_PATTERN)) {
    const xStr = match[1];
    const yStr = match[2];

    if (xStr !== undefined && yStr !== undefined) {
      points.push({
        x: Number.parseFloat(xStr.replace('%', '')),
        y: Number.parseFloat(yStr.replace('%', '')),
      });
    }
  }

  return points;
}

/** Serialize an array of point objects back into a CSS polygon() string. */
function serializePolygon(points: ReadonlyArray<{ readonly x: number; readonly y: number }>): string {
  const pointStrings = points.map((point) => `${String(point.x)}% ${String(point.y)}%`);

  return `polygon(${pointStrings.join(', ')})`;
}

/**
 * Enter clip-path editing mode for the given element.
 * Seeds a default rectangular polygon if customClipPath is empty.
 * No-op if the element lacks the clipPath capability.
 */
export function startClipPathEditing(store: EditorStore, elementId: string): void {
  const state = store.getState();
  const element = state.document.elements.find((candidate) => candidate.id === elementId);

  if (element === undefined) {
    return;
  }

  const capabilities = getCapabilityProfile(element.type);

  if (!capabilities.clipPath) {
    return;
  }

  const needsSeeding = (element.style.customClipPath ?? '') === '';
  const nextDocument =
    needsSeeding ?
      {
        ...state.document,
        elements: state.document.elements.map((candidate) =>
          candidate.id === elementId ?
            {
              ...candidate,
              style: {
                ...candidate.style,
                customClipPath: DEFAULT_CLIP_PATH,
                maskType: 'custom' as const,
              },
            }
          : candidate,
        ),
      }
    : state.document;

  store.setState({
    document: nextDocument,
    activeElementIds: [elementId],
    pendingPlacementType: null,
    pathEditingElementId: null,
    pathDrawingElementId: null,
    clipPathEditingElementId: elementId,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: { type: 'clip-path-editing', elementId },
  });
}

/**
 * Exit clip-path editing mode and clear the tracking ID.
 */
export function stopClipPathEditing(store: EditorStore): void {
  store.setState({
    clipPathEditingElementId: null,
    editingMode: { type: 'none' },
  });
}

/**
 * Update the coordinates of a clip-path control point at the given index.
 * Coordinates are element-relative percentages.
 * No-op when not in clip-path editing mode.
 */
export function updateClipPathPoint(store: EditorStore, index: number, x: number, y: number): void {
  const state = store.getState();
  const editingElementId = state.clipPathEditingElementId;

  if (editingElementId === null) {
    return;
  }

  const element = state.document.elements.find((candidate) => candidate.id === editingElementId);

  if (element === undefined) {
    return;
  }

  const points = parsePolygonPoints(element.style.customClipPath ?? '');

  if (points === null || index < 0 || index >= points.length) {
    return;
  }

  const updated = points.map((point, idx) => (idx === index ? { x, y } : point));

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((candidate) =>
        candidate.id === editingElementId ?
          {
            ...candidate,
            style: {
              ...candidate.style,
              customClipPath: serializePolygon(updated),
            },
          }
        : candidate,
      ),
    },
  });
}

/**
 * Insert a new point after the given index in the clip-path polygon.
 * No-op when not in clip-path editing mode.
 */
export function insertClipPathPoint(store: EditorStore, afterIndex: number, x: number, y: number): void {
  const state = store.getState();
  const editingElementId = state.clipPathEditingElementId;

  if (editingElementId === null) {
    return;
  }

  const element = state.document.elements.find((candidate) => candidate.id === editingElementId);

  if (element === undefined) {
    return;
  }

  const points = parsePolygonPoints(element.style.customClipPath ?? '');

  if (points === null || afterIndex < 0 || afterIndex >= points.length) {
    return;
  }

  const updated = [...points.slice(0, afterIndex + 1), { x, y }, ...points.slice(afterIndex + 1)];

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((candidate) =>
        candidate.id === editingElementId ?
          {
            ...candidate,
            style: {
              ...candidate.style,
              customClipPath: serializePolygon(updated),
            },
          }
        : candidate,
      ),
    },
  });
}

/**
 * Remove the point at the given index from the clip-path polygon.
 * Rejected if the polygon has 3 or fewer points (minimum enforced).
 * No-op when not in clip-path editing mode.
 */
export function deleteClipPathPoint(store: EditorStore, index: number): void {
  const state = store.getState();
  const editingElementId = state.clipPathEditingElementId;

  if (editingElementId === null) {
    return;
  }

  const element = state.document.elements.find((candidate) => candidate.id === editingElementId);

  if (element === undefined) {
    return;
  }

  const points = parsePolygonPoints(element.style.customClipPath ?? '');

  if (points === null || points.length <= MIN_CLIP_PATH_POINTS || index < 0 || index >= points.length) {
    return;
  }

  const updated = points.filter((_, idx) => idx !== index);

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((candidate) =>
        candidate.id === editingElementId ?
          {
            ...candidate,
            style: {
              ...candidate.style,
              customClipPath: serializePolygon(updated),
            },
          }
        : candidate,
      ),
    },
  });
}

export function appendPathPoint(store: EditorStore, canvasX: number, canvasY: number): void {
  const state = store.getState();
  const drawingElementId = state.pathDrawingElementId;

  if (drawingElementId === null) {
    return;
  }

  const element = state.document.elements.find((candidate) => candidate.id === drawingElementId);

  if (element === undefined) {
    return;
  }

  const strokeWidth = element.style.strokeWidth ?? 1;
  const padding = strokeWidth / 2;
  const pointExpression = /([ML])\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
  const existingPoints = Array.from(element.content.matchAll(pointExpression), (match) => ({
    x: element.position.x + Number.parseFloat(match[2] ?? '0'),
    y: element.position.y + Number.parseFloat(match[3] ?? '0'),
  }));
  const nextPoints = [...existingPoints, { x: canvasX, y: canvasY }];

  const minX = Math.min(...nextPoints.map((point) => point.x)) - padding;
  const minY = Math.min(...nextPoints.map((point) => point.y)) - padding;
  const maxX = Math.max(...nextPoints.map((point) => point.x)) + padding;
  const maxY = Math.max(...nextPoints.map((point) => point.y)) + padding;

  const nextContent = nextPoints
    .map((point, index) => {
      const relativeX = roundCoordinate(point.x - minX);
      const relativeY = roundCoordinate(point.y - minY);

      return `${index === 0 ? 'M' : 'L'}${String(relativeX)},${String(relativeY)}`;
    })
    .join(' ');

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((candidate) =>
        candidate.id === drawingElementId ?
          {
            ...candidate,
            position: {
              x: roundCoordinate(minX),
              y: roundCoordinate(minY),
            },
            width: roundCoordinate(maxX - minX),
            height: roundCoordinate(maxY - minY),
            content: nextContent,
          }
        : candidate,
      ),
    },
  });
}

export function validateEditorConfig(config: unknown): EditorConfig {
  return editorConfigSchema.parse(config);
}

/**
 * Enter motion path editing mode for the given element.
 * Selects the element and clears all other overlay modes.
 */
export function startMotionPathEditing(store: EditorStore, elementId: string): void {
  store.setState({
    activeElementIds: [elementId],
    pendingPlacementType: null,
    pathEditingElementId: null,
    pathDrawingElementId: null,
    clipPathEditingElementId: null,
    motionPathEditingElementId: elementId,
    inlineTextEditingElementId: null,
    editingMode: { type: 'motion-path-editing', elementId },
  });
}

/**
 * Exit motion path editing mode and clear the tracking ID.
 */
export function stopMotionPathEditing(store: EditorStore): void {
  store.setState({
    motionPathEditingElementId: null,
    editingMode: { type: 'none' },
  });
}

// ---------------------------------------------------------------------------
// Preflight Diagnostics
// ---------------------------------------------------------------------------

export type PreflightSeverity = 'error' | 'warning' | 'info';

export type PreflightRule =
  | 'title-safe'
  | 'dpi-resolution'
  | 'bleed'
  | 'small-text'
  | 'color-mode'
  | 'unsupported-property'
  | 'missing-font';

export interface PreflightDiagnostic {
  readonly rule: PreflightRule;
  readonly severity: PreflightSeverity;
  readonly elementName: string;
  readonly message: string;
}

export interface PreflightConfig {
  readonly allowedFonts?: readonly FontDefinition[] | undefined;
  readonly bleedMarginMm?: number | undefined;
}

const TITLE_SAFE_INSET_RATIO = 0.1;
const MIN_DPI_DIMENSION_PX = 500;
const DEFAULT_BLEED_MARGIN_MM = 3;
const MIN_PRINT_FONT_SIZE_PT = 6;

const SYSTEM_FALLBACK_FONTS: ReadonlySet<string> = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
]);

const SCREEN_ONLY_STYLE_PROPERTIES: ReadonlyArray<keyof BroadsetElement['style']> = ['rotateX', 'rotateY'];

/**
 * Parse a hex color string (#RGB or #RRGGBB) into [r, g, b] components.
 * Returns undefined for unparseable input.
 */
function parseHexRgb(hex: string): readonly [number, number, number] | undefined {
  const cleaned = hex.replace('#', '');

  let r: number, g: number, b: number;

  if (cleaned.length === 3) {
    const c0 = cleaned.charAt(0);
    const c1 = cleaned.charAt(1);
    const c2 = cleaned.charAt(2);

    r = parseInt(c0 + c0, 16);
    g = parseInt(c1 + c1, 16);
    b = parseInt(c2 + c2, 16);
  } else if (cleaned.length >= 6) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
  } else {
    return undefined;
  }

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return undefined;
  }

  return [r, g, b] as const;
}

/**
 * Checks whether a color is "fluorescent" or out-of-gamut for CMYK print.
 * Supports #RGB and #RRGGBB hex formats.
 * Uses a simple heuristic: one channel at 255 and another at 0 (fully saturated).
 */
function isFluorescentColor(hex: string | undefined): boolean {
  if (hex === undefined || hex === '') {
    return false;
  }

  const rgb = parseHexRgb(hex);

  if (rgb === undefined) {
    return false;
  }

  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  // Fully saturated: one channel at 255, another at 0, high contrast
  return max === 255 && min === 0 && max - min === 255;
}

function isElementOutsideTitleSafe(el: BroadsetElement, canvasWidth: number, canvasHeight: number): boolean {
  const insetX = canvasWidth * TITLE_SAFE_INSET_RATIO;
  const insetY = canvasHeight * TITLE_SAFE_INSET_RATIO;

  const safeLeft = insetX;
  const safeTop = insetY;
  const safeRight = canvasWidth - insetX;
  const safeBottom = canvasHeight - insetY;

  const elRight = el.position.x + el.width;
  const elBottom = el.position.y + el.height;

  return el.position.x < safeLeft || el.position.y < safeTop || elRight > safeRight || elBottom > safeBottom;
}

function isElementBeyondBleed(
  el: BroadsetElement,
  canvasWidth: number,
  canvasHeight: number,
  bleedMm: number,
): boolean {
  const elRight = el.position.x + el.width;
  const elBottom = el.position.y + el.height;

  return (
    el.position.x < -bleedMm ||
    el.position.y < -bleedMm ||
    elRight > canvasWidth + bleedMm ||
    elBottom > canvasHeight + bleedMm
  );
}

/**
 * Run preflight diagnostics on a document. Returns a deterministic list of issues.
 */
export function runPreflightDiagnostics(
  document: BroadsetDocument,
  config: PreflightConfig,
): readonly PreflightDiagnostic[] {
  const issues: PreflightDiagnostic[] = [];
  const { canvas, documentMode, elements } = document;
  const isPrint = documentMode === 'print';
  const bleedMm = config.bleedMarginMm ?? DEFAULT_BLEED_MARGIN_MM;

  const allowedFontFamilies: ReadonlySet<string> = new Set(
    (config.allowedFonts ?? []).map((f) => f.family.toLowerCase()),
  );

  for (const el of elements) {
    const isTextLike = el.type === 'text' || el.type === 'ticker' || el.type === 'clock';

    // title-safe: text, image, svg outside 90% inset
    if (
      (isTextLike || el.type === 'image' || el.type === 'svg') &&
      isElementOutsideTitleSafe(el, canvas.width, canvas.height)
    ) {
      issues.push({
        rule: 'title-safe',
        severity: 'warning',
        elementName: el.name,
        message: `"${el.name}" extends beyond the title-safe area`,
      });
    }

    // dpi-resolution: images rendered > 500px
    if (el.type === 'image' && (el.width > MIN_DPI_DIMENSION_PX || el.height > MIN_DPI_DIMENSION_PX)) {
      issues.push({
        rule: 'dpi-resolution',
        severity: 'info',
        elementName: el.name,
        message: `"${el.name}" is rendered at ${String(Math.round(Math.max(el.width, el.height)))}px — recommend source resolution of at least 1.5× rendered size`,
      });
    }

    // bleed (print only): elements beyond canvas + bleed margin
    if (isPrint && isElementBeyondBleed(el, canvas.width, canvas.height, bleedMm)) {
      issues.push({
        rule: 'bleed',
        severity: 'warning',
        elementName: el.name,
        message: `"${el.name}" extends beyond canvas bounds + ${String(bleedMm)}mm bleed margin`,
      });
    }

    // small-text (print only): text < 6pt
    if (isPrint && isTextLike) {
      const fontSize = el.style.fontSize ?? 0;

      if (fontSize > 0 && fontSize < MIN_PRINT_FONT_SIZE_PT) {
        issues.push({
          rule: 'small-text',
          severity: 'warning',
          elementName: el.name,
          message: `"${el.name}" has font size ${String(fontSize)}pt — minimum recommended is ${String(MIN_PRINT_FONT_SIZE_PT)}pt for print`,
        });
      }
    }

    // color-mode (print only): fluorescent / out-of-gamut colors
    if (isPrint) {
      const bgColor = el.style.backgroundColor;
      const borderColor = el.style.borderColor;

      if (isFluorescentColor(bgColor) || isFluorescentColor(borderColor)) {
        issues.push({
          rule: 'color-mode',
          severity: 'info',
          elementName: el.name,
          message: `"${el.name}" uses a fluorescent or out-of-gamut color that may not reproduce accurately in print`,
        });
      }
    }

    // unsupported-property (print only): screen-only style properties
    if (isPrint) {
      for (const prop of SCREEN_ONLY_STYLE_PROPERTIES) {
        const value = el.style[prop];

        if (typeof value === 'number' && value !== 0) {
          issues.push({
            rule: 'unsupported-property',
            severity: 'warning',
            elementName: el.name,
            message: `"${el.name}" uses "${prop}" which is not supported in print mode`,
          });
        }
      }
    }

    // missing-font: text element with unknown font
    if (isTextLike && config.allowedFonts !== undefined) {
      const fontFamily = el.style.fontFamily;

      if (fontFamily !== undefined && fontFamily !== '') {
        const normalized = fontFamily.toLowerCase();

        if (!SYSTEM_FALLBACK_FONTS.has(normalized) && !allowedFontFamilies.has(normalized)) {
          issues.push({
            rule: 'missing-font',
            severity: 'warning',
            elementName: el.name,
            message: `"${el.name}" uses font "${fontFamily}" which is not in the allowed fonts list`,
          });
        }
      }
    }
  }

  return issues;
}
