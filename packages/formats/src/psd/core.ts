import type {
  BroadsetDocument,
  BroadsetElement,
  BroadsetElementStyle,
  BuiltInElementType,
  Canvas,
} from '@broadset/model';
import { BUILT_IN_ELEMENT_TYPES } from '@broadset/model';
import type { BezierKnot, BezierPath, BlendMode, Layer, Psd } from 'ag-psd';
import { initializeCanvas, readPsd, writePsdUint8Array } from 'ag-psd';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Default fill rule for PSD vector masks */
const DEFAULT_FILL_RULE = 'even-odd' as const;

/** CSS blend mode → PSD blend mode mapping */
const BLEND_MODE_MAP: Readonly<Record<string, BlendMode>> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color dodge',
  'color-burn': 'color burn',
  'hard-light': 'hard light',
  'soft-light': 'soft light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};

/** PSD blend mode → CSS blend mode mapping */
const REVERSE_BLEND_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(BLEND_MODE_MAP).map(([css, psd]) => [psd, css]),
);

/** PSD coordinates are normalized to [0, 1] relative to image size */
const PSD_COORD_MAX = 1;

/** Maximum value for an 8-bit colour channel */
const MAX_CHANNEL = 255;

/* ------------------------------------------------------------------ */
/*  Color Helpers                                                      */
/* ------------------------------------------------------------------ */

interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

function isRgbaColor(value: unknown): value is RgbaColor {
  return typeof value === 'object' && value !== null && 'r' in value && 'g' in value && 'b' in value;
}

function parseHexColor(hex: string): RgbaColor | undefined {
  const cleaned = hex.replace(/^#/, '');

  if (cleaned.length === 3) {
    const r = parseInt(`${cleaned[0] ?? '0'}${cleaned[0] ?? '0'}`, 16);
    const g = parseInt(`${cleaned[1] ?? '0'}${cleaned[1] ?? '0'}`, 16);
    const b = parseInt(`${cleaned[2] ?? '0'}${cleaned[2] ?? '0'}`, 16);

    return { r, g, b, a: 1 };
  }

  if (cleaned.length === 6) {
    return {
      r: parseInt(cleaned.slice(0, 2), 16),
      g: parseInt(cleaned.slice(2, 4), 16),
      b: parseInt(cleaned.slice(4, 6), 16),
      a: 1,
    };
  }

  if (cleaned.length === 8) {
    return {
      r: parseInt(cleaned.slice(0, 2), 16),
      g: parseInt(cleaned.slice(2, 4), 16),
      b: parseInt(cleaned.slice(4, 6), 16),
      a: parseInt(cleaned.slice(6, 8), 16) / MAX_CHANNEL,
    };
  }

  return undefined;
}

function rgbaToHex(r: number, g: number, b: number, a: number = 1): string {
  const hex = [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');

  if (a < 1) {
    return `#${hex}${Math.round(a * MAX_CHANNEL)
      .toString(16)
      .padStart(2, '0')}`;
  }

  return `#${hex}`;
}

/* ------------------------------------------------------------------ */
/*  Box Shadow Parser                                                  */
/* ------------------------------------------------------------------ */

interface ParsedShadow {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly spread: number;
  readonly color: RgbaColor;
}

function parseBoxShadow(shadow: string): ParsedShadow | undefined {
  // Basic CSS shadow: 4px 4px 8px rgba(0,0,0,0.5) or 4px 4px 8px #000
  const rgbaMatch = shadow.match(
    /(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?\s+rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
  );

  if (rgbaMatch) {
    return {
      offsetX: parseFloat(rgbaMatch[1] ?? '0'),
      offsetY: parseFloat(rgbaMatch[2] ?? '0'),
      blur: parseFloat(rgbaMatch[3] ?? '0'),
      spread: parseFloat(rgbaMatch[4] ?? '0'),
      color: {
        r: parseInt(rgbaMatch[5] ?? '0', 10),
        g: parseInt(rgbaMatch[6] ?? '0', 10),
        b: parseInt(rgbaMatch[7] ?? '0', 10),
        a: parseFloat(rgbaMatch[8] ?? '1'),
      },
    };
  }

  const hexMatch = shadow.match(
    /(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?\s+(#[\da-fA-F]{3,8})/,
  );

  if (hexMatch) {
    const color = parseHexColor(hexMatch[5] ?? '#000000');

    return {
      offsetX: parseFloat(hexMatch[1] ?? '0'),
      offsetY: parseFloat(hexMatch[2] ?? '0'),
      blur: parseFloat(hexMatch[3] ?? '0'),
      spread: parseFloat(hexMatch[4] ?? '0'),
      color: color ?? { r: 0, g: 0, b: 0, a: 1 },
    };
  }

  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Filter Glow Parser                                                 */
/* ------------------------------------------------------------------ */

interface ParsedGlow {
  readonly blur: number;
  readonly color: RgbaColor;
}

function parseFilterGlow(filter: string): ParsedGlow | undefined {
  // CSS filter: drop-shadow(0 0 10px rgba(255,0,0,0.8))
  const match = filter.match(
    /drop-shadow\(\s*0\s+0\s+(\d+(?:\.\d+)?)px\s+rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)\s*\)/,
  );

  if (match) {
    return {
      blur: parseFloat(match[1] ?? '0'),
      color: {
        r: parseInt(match[2] ?? '0', 10),
        g: parseInt(match[3] ?? '0', 10),
        b: parseInt(match[4] ?? '0', 10),
        a: parseFloat(match[5] ?? '1'),
      },
    };
  }

  return undefined;
}

/* ------------------------------------------------------------------ */
/*  SVG Path to PSD Vector Mask                                        */
/* ------------------------------------------------------------------ */

interface SvgCommand {
  readonly cmd: string;
  readonly args: readonly number[];
}

function parseSvgPath(d: string): readonly SvgCommand[] {
  const commands: SvgCommand[] = [];
  const re = /([MLCQZHVSmlcqzhvs])([^MLCQZHVSmlcqzhvs]*)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(d)) !== null) {
    const cmd = m[1] ?? '';
    const argsStr = (m[2] ?? '').trim();
    const args =
      argsStr ?
        argsStr
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => !Number.isNaN(n))
      : [];

    commands.push({ cmd, args });
  }

  return commands;
}

/**
 * Convert SVG path data to a PSD BezierPath for vector mask use.
 * Returns null for invalid or unsupported path data.
 */
export function svgPathToPsdVectorMask(d: string, width: number, height: number): BezierPath | null {
  if (!d.trim()) return null;

  const commands = parseSvgPath(d);

  if (commands.length === 0) return null;

  // Verify first command is M (moveTo)
  const firstCmd = commands[0];

  if (!firstCmd || (firstCmd.cmd !== 'M' && firstCmd.cmd !== 'm')) return null;

  const knots: BezierKnot[] = [];
  let isClosed = false;

  const scaleX = width > 0 ? PSD_COORD_MAX / width : 1;
  const scaleY = height > 0 ? PSD_COORD_MAX / height : 1;

  for (const { cmd, args } of commands) {
    switch (cmd) {
      case 'M':
        if (args.length >= 2) {
          const mx = args[0] ?? 0;
          const my = args[1] ?? 0;

          knots.push({
            linked: true,
            points: [
              my * scaleY,
              mx * scaleX, // preceding control
              my * scaleY,
              mx * scaleX, // anchor
              my * scaleY,
              mx * scaleX, // leaving control
            ],
          });
        }

        break;

      case 'L':
        for (let i = 0; i + 1 < args.length; i += 2) {
          const lx = args[i] ?? 0;
          const ly = args[i + 1] ?? 0;

          knots.push({
            linked: true,
            points: [ly * scaleY, lx * scaleX, ly * scaleY, lx * scaleX, ly * scaleY, lx * scaleX],
          });
        }

        break;

      case 'C':
        for (let i = 0; i + 5 < args.length; i += 6) {
          const cp1x = args[i] ?? 0;
          const cp1y = args[i + 1] ?? 0;
          const cp2x = args[i + 2] ?? 0;
          const cp2y = args[i + 3] ?? 0;
          const ex = args[i + 4] ?? 0;
          const ey = args[i + 5] ?? 0;

          // Update leaving control of previous knot
          if (knots.length > 0) {
            const prev = knots[knots.length - 1];

            if (prev) {
              const newPoints = [...prev.points];

              newPoints[4] = cp1y * scaleY;
              newPoints[5] = cp1x * scaleX;
              knots[knots.length - 1] = { linked: false, points: newPoints };
            }
          }

          knots.push({
            linked: false,
            points: [
              cp2y * scaleY,
              cp2x * scaleX, // preceding control
              ey * scaleY,
              ex * scaleX, // anchor
              ey * scaleY,
              ex * scaleX, // leaving control
            ],
          });
        }

        break;

      case 'Z':
      case 'z':
        isClosed = true;

        break;

      default:
        // Unsupported command — skip but don't fail
        break;
    }
  }

  if (knots.length < 2) return null;

  return {
    open: !isClosed,
    knots,
    fillRule: DEFAULT_FILL_RULE,
  };
}

/* ------------------------------------------------------------------ */
/*  Rounded Rectangle Vector Mask                                      */
/* ------------------------------------------------------------------ */

function buildRoundedRectMask(
  width: number,
  height: number,
  radii: readonly [number, number, number, number],
): BezierPath {
  const [tl, tr, br, bl] = radii;
  const scaleX = PSD_COORD_MAX / width;
  const scaleY = PSD_COORD_MAX / height;

  // Simplified rounded rect as 8 knots (2 per corner)
  const knots: BezierKnot[] = [];

  // Top-left corner
  knots.push({
    linked: true,
    points: [0, tl * scaleX, 0, tl * scaleX, 0, tl * scaleX],
  });
  knots.push({
    linked: true,
    points: [tl * scaleY, 0, tl * scaleY, 0, tl * scaleY, 0],
  });

  // Bottom-left corner
  knots.push({
    linked: true,
    points: [(height - bl) * scaleY, 0, (height - bl) * scaleY, 0, (height - bl) * scaleY, 0],
  });
  knots.push({
    linked: true,
    points: [height * scaleY, bl * scaleX, height * scaleY, bl * scaleX, height * scaleY, bl * scaleX],
  });

  // Bottom-right corner
  knots.push({
    linked: true,
    points: [
      height * scaleY,
      (width - br) * scaleX,
      height * scaleY,
      (width - br) * scaleX,
      height * scaleY,
      (width - br) * scaleX,
    ],
  });
  knots.push({
    linked: true,
    points: [
      (height - br) * scaleY,
      width * scaleX,
      (height - br) * scaleY,
      width * scaleX,
      (height - br) * scaleY,
      width * scaleX,
    ],
  });

  // Top-right corner
  knots.push({
    linked: true,
    points: [tr * scaleY, width * scaleX, tr * scaleY, width * scaleX, tr * scaleY, width * scaleX],
  });
  knots.push({
    linked: true,
    points: [0, (width - tr) * scaleX, 0, (width - tr) * scaleX, 0, (width - tr) * scaleX],
  });

  return {
    open: false,
    knots,
    fillRule: DEFAULT_FILL_RULE,
  };
}

/* ------------------------------------------------------------------ */
/*  Data URI Helpers                                                   */
/* ------------------------------------------------------------------ */

function decodeDataUri(uri: string): { readonly mime: string; readonly bytes: Uint8Array } | undefined {
  const match = uri.match(/^data:([^;,]+)(?:;([^,]*))?,(.*)/s);

  if (!match) return undefined;

  const mime = match[1] ?? '';
  const encoding = match[2] ?? '';
  const data = match[3] ?? '';

  if (encoding === 'base64') {
    try {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      return { mime, bytes };
    } catch {
      return undefined;
    }
  }

  return { mime, bytes: new TextEncoder().encode(decodeURIComponent(data)) };
}

function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `data:${mime};base64,${btoa(binary)}`;
}

/* ------------------------------------------------------------------ */
/*  Element → PSD Layer Conversion                                     */
/* ------------------------------------------------------------------ */

let guidCounter = 0;

/** Convert an element ID to a GUID-format string required by ag-psd for placedLayer */
function elementIdToGuid(id: string): string {
  // Generate a deterministic GUID from the element ID
  guidCounter++;

  const hex = guidCounter.toString(16).padStart(12, '0');
  const hash = simpleHash(id).toString(16).padStart(8, '0');

  return `${hash}-0000-4000-8000-${hex}`;
}

function simpleHash(s: string): number {
  let hash = 0;

  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }

  return Math.abs(hash);
}

function elementToLayer(el: BroadsetElement): Layer {
  const layer: Layer = {
    name: el.name,
    left: Math.round(el.position.x),
    top: Math.round(el.position.y),
    right: Math.round(el.position.x + el.width),
    bottom: Math.round(el.position.y + el.height),
    opacity: el.style.opacity,
    hidden: false,
  };

  // Blend mode mapping
  if (el.style.mixBlendMode) {
    const psdMode = BLEND_MODE_MAP[el.style.mixBlendMode];

    if (psdMode) {
      layer.blendMode = psdMode;
    }
  }

  // Border radius → vector mask
  if (el.style.borderRadius) {
    const [a, b, c, d] = el.style.borderRadius;
    const maskPath = buildRoundedRectMask(el.width, el.height, [a, b, c, d]);

    layer.vectorMask = { paths: [maskPath] };
  }

  // Custom clip-path → additional vector mask path
  if (el.style.customClipPath) {
    // Only polygon clip-paths can be converted to vector mask
    const polyMatch = el.style.customClipPath.match(/polygon\(([^)]+)\)/);

    if (polyMatch) {
      const clipPath = polygonToVectorMask(polyMatch[1] ?? '', el.width, el.height);

      if (clipPath) {
        const existing = layer.vectorMask?.paths ?? [];

        layer.vectorMask = {
          paths: [...existing, { ...clipPath, operation: 'intersect' }],
        };
      }
    }
  }

  // Box shadow → layer effects
  if (el.style.boxShadow) {
    const shadow = parseBoxShadow(el.style.boxShadow);

    if (shadow) {
      layer.effects = {
        ...layer.effects,
        dropShadow: [
          {
            present: true,
            enabled: true,
            color: { r: shadow.color.r, g: shadow.color.g, b: shadow.color.b },
            opacity: shadow.color.a,
            angle: Math.round(Math.atan2(shadow.offsetY, shadow.offsetX) * (180 / Math.PI)),
            distance: { units: 'Pixels', value: Math.sqrt(shadow.offsetX ** 2 + shadow.offsetY ** 2) },
            size: { units: 'Pixels', value: shadow.blur },
            ...(shadow.spread ? { choke: { units: 'Pixels', value: shadow.spread } } : undefined),
          },
        ],
      };
    }
  }

  // CSS filter glow → outer glow effect
  if (el.style.filter) {
    const glow = parseFilterGlow(el.style.filter);

    if (glow) {
      layer.effects = {
        ...layer.effects,
        outerGlow: {
          present: true,
          enabled: true,
          color: { r: glow.color.r, g: glow.color.g, b: glow.color.b },
          opacity: glow.color.a,
          size: { units: 'Pixels', value: glow.blur },
        },
      };
    }
  }

  // Element-type-specific content
  switch (el.type) {
    case 'text':
      {
        const color = el.style.fontColor ? parseHexColor(el.style.fontColor) : undefined;

        layer.text = {
          text: el.content,
          style:
            color ? { fontSize: el.style.fontSize ?? 12, fillColor: color } : { fontSize: el.style.fontSize ?? 12 },
        };
      }

      break;

    case 'image':
      if (el.content) {
        // Try data URI first
        const decoded = decodeDataUri(el.content);
        // Try pre-fetched URL content (set by exportPsdBytesAsync before conversion)
        const urlContent = prefetchedUrlImages.get(el.id);
        const imageBytes = decoded ?? urlContent;

        if (imageBytes) {
          // Create pixel data for the image
          const w = Math.max(1, Math.round(el.width));
          const h = Math.max(1, Math.round(el.height));
          const guid = elementIdToGuid(el.id);

          layer.imageData = {
            width: w,
            height: h,
            data: createSolidPixels(w, h, { r: 200, g: 200, b: 200, a: 255 }),
          };

          // Store as linked file (smart object)
          layer.placedLayer = {
            id: guid,
            type: 'raster',
            width: w,
            height: h,
            transform: [
              el.position.x,
              el.position.y,
              el.position.x + el.width,
              el.position.y,
              el.position.x + el.width,
              el.position.y + el.height,
              el.position.x,
              el.position.y + el.height,
            ],
          };

          // Store original image data for linked file recovery
          pendingLinkedFiles.push({
            id: guid,
            name: el.name || 'image',
            data: imageBytes.bytes,
            type: imageBytes.mime,
          });
        }
      }

      break;

    case 'path':
      if (el.content) {
        const pathMask = svgPathToPsdVectorMask(el.content, el.width, el.height);

        if (pathMask) {
          const isOpen = pathMask.open;

          layer.vectorMask = { paths: [pathMask] };

          // Open paths → stroke-only
          if (isOpen) {
            layer.vectorStroke = {
              fillEnabled: false,
              strokeEnabled: true,
            };

            if (el.style.borderColor) {
              const strokeColor = parseHexColor(el.style.borderColor);

              if (strokeColor) {
                layer.vectorFill = {
                  type: 'color',
                  color: strokeColor,
                };
              }
            }
          }
        }
      }

      break;

    case 'rectangle':
    case 'ellipse':
      // Solid fill rectangle/ellipse — create pixel data
      if (el.style.backgroundColor) {
        const color = parseHexColor(el.style.backgroundColor);
        const w = Math.max(1, Math.round(el.width));
        const h = Math.max(1, Math.round(el.height));

        if (color) {
          layer.imageData = {
            width: w,
            height: h,
            data: createSolidPixels(w, h, {
              r: color.r,
              g: color.g,
              b: color.b,
              a: Math.round(color.a * 255),
            }),
          };
        }
      }

      break;

    default:
      break;
  }

  return layer;
}

function createSolidPixels(
  width: number,
  height: number,
  color: { readonly r: number; readonly g: number; readonly b: number; readonly a: number },
): Uint8Array {
  const data = new Uint8Array(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;

    data[offset] = color.r;
    data[offset + 1] = color.g;
    data[offset + 2] = color.b;
    data[offset + 3] = color.a;
  }

  return data;
}

function polygonToVectorMask(coords: string, width: number, height: number): BezierPath | null {
  const points = coords.split(',').map((p) => p.trim());
  const knots: BezierKnot[] = [];

  for (const point of points) {
    const parts = point.split(/\s+/);
    const xStr = parts[0];
    const yStr = parts[1];

    if (!xStr || !yStr) continue;

    const x = parseFloat(xStr);
    const y = parseFloat(yStr);

    if (isNaN(x) || isNaN(y)) continue;

    const xScaled = (x / 100) * width;
    const yScaled = (y / 100) * height;
    const sx = PSD_COORD_MAX / width;
    const sy = PSD_COORD_MAX / height;

    knots.push({
      linked: true,
      points: [yScaled * sy, xScaled * sx, yScaled * sy, xScaled * sx, yScaled * sy, xScaled * sx],
    });
  }

  if (knots.length < 3) return null;

  return {
    open: false,
    knots,
    fillRule: DEFAULT_FILL_RULE,
  };
}

/* ------------------------------------------------------------------ */
/*  Linked file tracking for smart objects                             */
/* ------------------------------------------------------------------ */

interface LinkedFileEntry {
  readonly id: string;
  readonly name: string;
  readonly data: Uint8Array;
  readonly type: string;
}

let pendingLinkedFiles: LinkedFileEntry[] = [];

/** Pre-fetched URL image data, keyed by element ID. Populated by exportPsdBytesAsync. */
let prefetchedUrlImages: Map<string, { readonly mime: string; readonly bytes: Uint8Array }> = new Map();

/* ------------------------------------------------------------------ */
/*  URL Image Fetching                                                 */
/* ------------------------------------------------------------------ */

function isUrl(content: string): boolean {
  return content.startsWith('http://') || content.startsWith('https://');
}

async function fetchImageAsBytes(
  url: string,
  fetchFn: typeof globalThis.fetch,
): Promise<{ readonly mime: string; readonly bytes: Uint8Array } | undefined> {
  try {
    const response = await fetchFn(url);

    if (!response.ok) return undefined;

    const contentType = response.headers.get('content-type') ?? 'image/png';
    const mime = contentType.split(';')[0]?.trim() ?? 'image/png';
    const arrayBuffer = await response.arrayBuffer();

    return { mime, bytes: new Uint8Array(arrayBuffer) };
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  Export                                                              */
/* ------------------------------------------------------------------ */

/**
 * Export a BroadsetDocument to PSD bytes.
 * Animated elements are exported at their rest state (t=0).
 * URL images are skipped — use exportPsdBytesAsync for URL image support.
 */
export function exportPsdBytes(doc: BroadsetDocument): Uint8Array {
  prefetchedUrlImages = new Map();

  return exportPsdBytesCore(doc);
}

/**
 * Export a BroadsetDocument to PSD bytes, fetching URL images via the
 * provided fetch function. Falls back to data URIs for non-URL content.
 */
export async function exportPsdBytesAsync(
  doc: BroadsetDocument,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<Uint8Array> {
  prefetchedUrlImages = new Map();

  // Pre-fetch all URL images before starting the sync export core
  const urlElements = doc.elements.filter((el) => el.type === 'image' && el.content && isUrl(el.content));

  const fetchResults = await Promise.all(
    urlElements.map(async (el) => {
      const result = await fetchImageAsBytes(el.content, fetchFn);

      return { id: el.id, result };
    }),
  );

  for (const { id, result } of fetchResults) {
    if (result) {
      prefetchedUrlImages.set(id, result);
    }
  }

  return exportPsdBytesCore(doc);
}

function exportPsdBytesCore(doc: BroadsetDocument): Uint8Array {
  ensureCanvasInitialized();
  guidCounter = 0;
  pendingLinkedFiles = [];

  const width = Math.round(canvasToPixels(doc.canvas, doc.canvas.width));
  const height = Math.round(canvasToPixels(doc.canvas, doc.canvas.height));

  const psd: Psd = {
    width,
    height,
    colorMode: 3, // RGB
    children: [],
  };

  // Handle multi-page as artboards
  // Broadset elements live at document level with per-page overrides.
  // Each page gets all elements, with visibility overrides applied.
  if (doc.pages.length > 1) {
    const artboardLayers: Layer[] = [];

    for (const page of doc.pages) {
      const visibleElements = doc.elements.filter((el) => {
        // Check page-level visibility overrides
        const override = page.overrides.find((o) => o.elementId === el.id && o.visible !== undefined);

        if (override?.visible !== undefined) {
          return override.visible;
        }

        return true; // Default: element is visible on all pages
      });

      const artboardLayer: Layer = {
        name: page.name,
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        artboard: {
          rect: { top: 0, left: 0, bottom: height, right: width },
        },
        children: visibleElements.map((el) => elementToLayer(el)),
      };

      artboardLayers.push(artboardLayer);
    }

    psd.children = artboardLayers;
  } else {
    // Single page: elements as direct children
    psd.children = doc.elements.map((el) => elementToLayer(el));
  }

  // Attach linked files for smart objects
  if (pendingLinkedFiles.length > 0) {
    psd.linkedFiles = pendingLinkedFiles.map((lf) => ({
      id: lf.id,
      name: lf.name,
      data: lf.data,
    }));
  }

  return writePsdUint8Array(psd);
}

function canvasToPixels(canvas: Canvas, value: number): number {
  switch (canvas.unit) {
    case 'px':
      return value;
    case 'mm':
      return (value / 25.4) * canvas.dpi;
    case 'in':
      return value * canvas.dpi;
  }
}

/* ------------------------------------------------------------------ */
/*  Canvas initialization for Node.js                                  */
/* ------------------------------------------------------------------ */

let canvasInitialized = false;

function ensureCanvasInitialized(): void {
  if (canvasInitialized) return;

  canvasInitialized = true;

  // ag-psd requires createCanvas/createImageData for reading pixel data.
  // In Node.js (no DOM), provide a minimal polyfill.
  initializeCanvas(
    (width: number, height: number) => {
      // Minimal canvas-like object for ag-psd write operations
      const data = new Uint8ClampedArray(width * height * 4);

      return {
        width,
        height,
        getContext: () => ({
          drawImage: () => {
            /* noop */
          },
          getImageData: () => ({ data, width, height }),
          putImageData: () => {
            /* noop */
          },
          canvas: { width, height },
          createImageData: (w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
          }),
          clearRect: () => {
            /* noop */
          },
          fillRect: () => {
            /* noop */
          },
          save: () => {
            /* noop */
          },
          restore: () => {
            /* noop */
          },
        }),
        toBuffer: () => new Uint8Array(0),
      } as unknown as HTMLCanvasElement;
    },
    (width: number, height: number) =>
      ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
        colorSpace: 'srgb',
      }) as ImageData,
  );
}

/* ------------------------------------------------------------------ */
/*  Import                                                             */
/* ------------------------------------------------------------------ */

let importIdCounter = 0;
let importLinkedFiles: Map<string, { readonly data: Uint8Array; readonly type: string }> = new Map();

function isValidElementType(type: string): type is BuiltInElementType {
  return (BUILT_IN_ELEMENT_TYPES as readonly string[]).includes(type);
}

function createImportedElement(
  type: string,
  content: string,
  position: { readonly x: number; readonly y: number },
  width: number,
  height: number,
  style: Partial<BroadsetElementStyle> = {},
): BroadsetElement {
  const validType = isValidElementType(type) ? type : 'rectangle';

  importIdCounter++;

  return {
    id: `psd-import-${String(importIdCounter)}`,
    type: validType,
    name: validType,
    locked: false,
    position,
    width,
    height,
    rotation: 0,
    content,
    style: { opacity: 1, ...style },
    parentId: null,
    groupId: null,
    assetId: null,
    dataField: null,
    visibleWhen: null,
    repeater: null,
    typeConfig: null,
    componentRef: null,
    autoSize: 'fixed',
    textPathElementId: null,
    booleanOperation: null,
    extensions: {},
  } as BroadsetElement;
}

function layerToElement(layer: Layer): BroadsetElement | undefined {
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const right = layer.right ?? left;
  const bottom = layer.bottom ?? top;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  const position = { x: left, y: top };
  const style: Record<string, unknown> = {};

  // Opacity (ag-psd normalizes to 0-1)
  if (layer.opacity !== undefined) {
    style['opacity'] = layer.opacity;
  }

  // Blend mode
  if (layer.blendMode) {
    const cssMode = REVERSE_BLEND_MAP[layer.blendMode];

    if (cssMode) {
      style['mixBlendMode'] = cssMode;
    }
  }

  // Layer effects → CSS properties
  if (layer.effects) {
    const shadow = layer.effects.dropShadow?.[0];

    if (shadow?.enabled) {
      const angle = (shadow.angle ?? 0) * (Math.PI / 180);
      const dist = shadow.distance?.value ?? 0;
      const blur = shadow.size?.value ?? 0;
      const color = shadow.color;
      const opacity = shadow.opacity ?? 1;
      const ox = Math.round(Math.cos(angle) * dist);
      const oy = Math.round(Math.sin(angle) * dist);

      if (color && isRgbaColor(color)) {
        style['boxShadow'] =
          `${String(ox)}px ${String(oy)}px ${String(blur)}px rgba(${String(color.r)},${String(color.g)},${String(color.b)},${String(opacity)})`;
      }
    }

    // Outer glow → CSS filter drop-shadow
    const glow = layer.effects.outerGlow;

    if (glow?.enabled) {
      const glowBlur = glow.size?.value ?? 0;
      const glowColor = glow.color;
      const glowOpacity = glow.opacity ?? 1;

      if (glowColor && isRgbaColor(glowColor)) {
        style['filter'] =
          `drop-shadow(0 0 ${String(glowBlur)}px rgba(${String(glowColor.r)},${String(glowColor.g)},${String(glowColor.b)},${String(glowOpacity)}))`;
      }
    }
  }

  // Vector mask → borderRadius or customClipPath
  if (layer.vectorMask?.paths) {
    const firstPath = layer.vectorMask.paths[0];

    if (firstPath && !firstPath.open && firstPath.knots.length === 8) {
      // Heuristic: 8-knot closed path is likely a rounded rect
      const knot0 = firstPath.knots[0];

      if (knot0) {
        const radiusPx = Math.round(((knot0.points[1] ?? 0) / PSD_COORD_MAX) * width);

        style['borderRadius'] = [radiusPx, radiusPx, radiusPx, radiusPx];
      }
    } else if (firstPath && !firstPath.open) {
      // Non-rounded closed path → convert to polygon clip-path
      const points = firstPath.knots.map((knot) => {
        const px = ((knot.points[1] ?? 0) / PSD_COORD_MAX) * 100;
        const py = ((knot.points[0] ?? 0) / PSD_COORD_MAX) * 100;

        return `${String(Math.round(px))}% ${String(Math.round(py))}%`;
      });

      if (points.length >= 3) {
        style['customClipPath'] = `polygon(${points.join(', ')})`;
      }
    }
  }

  // Text layer
  if (layer.text) {
    return createImportedElement('text', layer.text.text, position, width, height, {
      ...style,
      ...(layer.text.style?.fontSize ? { fontSize: layer.text.style.fontSize } : undefined),
      ...(layer.text.style?.fillColor && isRgbaColor(layer.text.style.fillColor) ?
        {
          fontColor: rgbaToHex(
            layer.text.style.fillColor.r,
            layer.text.style.fillColor.g,
            layer.text.style.fillColor.b,
          ),
        }
      : undefined),
    } as Partial<BroadsetElementStyle>);
  }

  // Smart object / placed layer → image
  if (layer.placedLayer) {
    let content = '';

    // Try to recover data from linked files (passed via closure)
    const linkedFileData = importLinkedFiles.get(layer.placedLayer.id);

    if (linkedFileData) {
      content = bytesToDataUri(linkedFileData.data, linkedFileData.type);
    } else if (layer.imageData) {
      content = bytesToDataUri(
        layer.imageData.data instanceof Uint8Array ? layer.imageData.data : new Uint8Array(layer.imageData.data),
        'image/png',
      );
    }

    return createImportedElement('image', content, position, width, height, style as Partial<BroadsetElementStyle>);
  }

  // Rectangle with borderRadius (detected from 8-knot closed vectorMask above)
  if (style['borderRadius']) {
    return createImportedElement('rectangle', '', position, width, height, style as Partial<BroadsetElementStyle>);
  }

  // Path layer (has vectorMask with open path or non-rounded-rect shape)
  if (layer.vectorMask?.paths) {
    const firstPath = layer.vectorMask.paths[0];

    if (firstPath && firstPath.open) {
      // Open path → path element
      const d = bezierPathToSvgD(firstPath, width, height);

      if (d) {
        return createImportedElement('path', d, position, width, height, style as Partial<BroadsetElementStyle>);
      }
    }
  }

  // Image layer (has imageData but no text/placed)
  if (layer.imageData) {
    const hasColor = detectLayerColor(layer);
    const bgColor = hasColor ? rgbaToHex(hasColor.r, hasColor.g, hasColor.b, hasColor.a) : undefined;

    return createImportedElement('rectangle', '', position, width, height, {
      ...style,
      ...(bgColor ? { backgroundColor: bgColor } : undefined),
    } as Partial<BroadsetElementStyle>);
  }

  // Layer group with actual children
  if (layer.children && layer.children.length > 0) {
    return undefined;
  }

  // Fallback — generic rectangle
  return createImportedElement('rectangle', '', position, width, height, style as Partial<BroadsetElementStyle>);
}

function detectLayerColor(layer: Layer): RgbaColor | undefined {
  if (!layer.imageData) return undefined;

  const data = layer.imageData.data;

  if (data.length < 4) return undefined;

  // Sample first pixel
  return {
    r: data[0] ?? 0,
    g: data[1] ?? 0,
    b: data[2] ?? 0,
    a: (data[3] ?? 255) / 255,
  };
}

function bezierPathToSvgD(path: BezierPath, width: number, height: number): string | undefined {
  if (path.knots.length < 2) return undefined;

  const parts: string[] = [];
  // BezierKnot.points layout: [precedingCtrlY, precedingCtrlX, anchorY, anchorX, leavingCtrlY, leavingCtrlX]
  const PRECEDING_Y = 0;
  const PRECEDING_X = 1;
  const ANCHOR_Y = 2;
  const ANCHOR_X = 3;
  const LEAVING_Y = 4;
  const LEAVING_X = 5;

  const toX = (v: number): number => Math.round((v / PSD_COORD_MAX) * width);
  const toY = (v: number): number => Math.round((v / PSD_COORD_MAX) * height);

  for (let i = 0; i < path.knots.length; i++) {
    const knot = path.knots[i];

    if (!knot) continue;

    const ax = toX(knot.points[ANCHOR_X] ?? 0);
    const ay = toY(knot.points[ANCHOR_Y] ?? 0);

    if (i === 0) {
      parts.push(`M ${String(ax)} ${String(ay)}`);
    } else {
      // Check if previous knot's leaving control or this knot's preceding control
      // differ from their anchor points — if so, emit a cubic bezier C command
      const prevKnot = path.knots[i - 1];

      if (prevKnot && !knot.linked) {
        const cp1x = toX(prevKnot.points[LEAVING_X] ?? 0);
        const cp1y = toY(prevKnot.points[LEAVING_Y] ?? 0);
        const cp2x = toX(knot.points[PRECEDING_X] ?? 0);
        const cp2y = toY(knot.points[PRECEDING_Y] ?? 0);
        const prevAx = toX(prevKnot.points[ANCHOR_X] ?? 0);
        const prevAy = toY(prevKnot.points[ANCHOR_Y] ?? 0);

        // Only emit C if control points differ from anchors (actual curve)
        if (cp1x !== prevAx || cp1y !== prevAy || cp2x !== ax || cp2y !== ay) {
          parts.push(`C ${String(cp1x)} ${String(cp1y)} ${String(cp2x)} ${String(cp2y)} ${String(ax)} ${String(ay)}`);
          continue;
        }
      }

      parts.push(`L ${String(ax)} ${String(ay)}`);
    }
  }

  if (!path.open) {
    parts.push('Z');
  }

  return parts.join(' ');
}

/**
 * Import a PSD file and recover BroadsetDocument elements.
 */
export function importPsd(data: Uint8Array): BroadsetDocument {
  // Initialize canvas for Node.js environments (ag-psd needs createImageData)
  ensureCanvasInitialized();

  const psd = readPsd(data.buffer as ArrayBuffer, {
    skipCompositeImageData: true,
    skipThumbnail: true,
    useImageData: true,
  });

  importIdCounter = 0;

  // Build linked file map for smart object recovery
  importLinkedFiles = new Map();

  for (const lf of psd.linkedFiles ?? []) {
    if (lf.id && lf.data) {
      importLinkedFiles.set(lf.id, {
        data: lf.data,
        type: lf.type ?? 'image/png',
      });
    }
  }

  const canvas: Canvas = {
    width: psd.width,
    height: psd.height,
    unit: 'px',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
  };

  const elements: BroadsetElement[] = [];
  const pages: Array<{
    readonly id: string;
    readonly name: string;
    readonly overrides: readonly [];
    readonly locale: null;
    readonly extensions: Readonly<Record<string, unknown>>;
  }> = [];

  // Check for artboards
  const artboardLayers = (psd.children ?? []).filter((child) => child.artboard);

  if (artboardLayers.length > 0) {
    // Artboard import: each artboard → page
    for (const artboard of artboardLayers) {
      pages.push({
        id: `page-${String(pages.length + 1)}`,
        name: artboard.name ?? `Page ${String(pages.length + 1)}`,
        overrides: [],
        locale: null,
        extensions: {},
      });

      // Import child layers from this artboard
      for (const child of artboard.children ?? []) {
        const el = layerToElement(child);

        if (el) elements.push(el);
      }
    }
  } else {
    // No artboards: import all children as elements
    pages.push({
      id: 'page-1',
      name: 'Page 1',
      overrides: [],
      locale: null,
      extensions: {},
    });

    for (const child of psd.children ?? []) {
      const el = layerToElement(child);

      if (el) elements.push(el);
    }
  }

  return {
    id: 'imported-psd',
    name: 'Imported PSD',
    documentMode: 'screen',
    canvas,
    elements,
    pages,
    animations: [],
    dataSchema: { fields: [] },
  } as BroadsetDocument;
}
