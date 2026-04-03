import { z } from 'zod';

// ---------------------------------------------------------------------------
// Font types
// ---------------------------------------------------------------------------

const fontDefinitionSchema = z.object({
  family: z.string().min(1),
});

type FontDefinition = z.infer<typeof fontDefinitionSchema>;

// ---------------------------------------------------------------------------
// Fallback system fonts
// ---------------------------------------------------------------------------

export const FALLBACK_SYSTEM_FONTS: readonly FontDefinition[] = [
  { family: 'Arial' },
  { family: 'Courier New' },
  { family: 'Times New Roman' },
  { family: 'Georgia' },
] as const;

export function resolveFonts(fonts: readonly FontDefinition[]): readonly FontDefinition[] {
  return fonts.length > 0 ? fonts : FALLBACK_SYSTEM_FONTS;
}

// ---------------------------------------------------------------------------
// Document size preset
// ---------------------------------------------------------------------------

const documentSizeSchema = z.object({
  label: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
});

// ---------------------------------------------------------------------------
// Component plugin
// ---------------------------------------------------------------------------

const componentPluginSchema = z.object({
  type: z.string().min(1),
  label: z.string().min(1),
  rendererFactory: z.function(),
  icon: z.string().optional(),
  defaults: z
    .object({
      width: z.number().optional(),
      height: z.number().optional(),
      content: z.string().optional(),
    })
    .optional(),
  propertyPanel: z.unknown().optional(),
  capabilities: z.record(z.string(), z.boolean()).optional(),
});

// ---------------------------------------------------------------------------
// EditorConfig schema
// ---------------------------------------------------------------------------

export const editorConfigSchema = z.object({
  allowedFonts: z.array(fontDefinitionSchema),
  defaultPalette: z.array(z.string()).optional(),
  allowedDocumentSizes: z.array(documentSizeSchema).optional(),
  requiredElements: z.array(z.string()).optional(),
  mediaSource: z.unknown().optional(),
  shortcuts: z.unknown().optional(),
  gridDefaults: z.unknown().optional(),
  maxUndoSteps: z.number().int().positive().optional(),
  components: z.array(componentPluginSchema).optional(),
  onChanges: z.function().optional(),
  onSave: z.function().optional(),
});

export type EditorConfig = z.infer<typeof editorConfigSchema>;

// ---------------------------------------------------------------------------
// Feature config
// ---------------------------------------------------------------------------

export interface EditorFeatureConfig {
  transforms3d: boolean;
  clipChildren: boolean;
  animations: boolean;
  importSvg: boolean;
  importPsd: boolean;
  importPptx: boolean;
  exportHtml: boolean;
  exportSvg: boolean;
  exportPdf: boolean;
  exportPsd: boolean;
  exportPptx: boolean;
  exportPng: boolean;
  exportJpeg: boolean;
  exportSvgEmbedded: boolean;
  exportOgraf: boolean;
  exportMp4: boolean;
  exportWebm: boolean;
  broadcastPreview: boolean;
}

export const featureConfigSchema: z.ZodType<EditorFeatureConfig> = z.object({
  transforms3d: z.boolean(),
  clipChildren: z.boolean(),
  animations: z.boolean(),
  importSvg: z.boolean(),
  importPsd: z.boolean(),
  importPptx: z.boolean(),
  exportHtml: z.boolean(),
  exportSvg: z.boolean(),
  exportPdf: z.boolean(),
  exportPsd: z.boolean(),
  exportPptx: z.boolean(),
  exportPng: z.boolean(),
  exportJpeg: z.boolean(),
  exportSvgEmbedded: z.boolean(),
  exportOgraf: z.boolean(),
  exportMp4: z.boolean(),
  exportWebm: z.boolean(),
  broadcastPreview: z.boolean(),
});

type DocumentMode = 'screen' | 'print';

const ALL_ENABLED: EditorFeatureConfig = {
  transforms3d: true,
  clipChildren: true,
  animations: true,
  importSvg: true,
  importPsd: true,
  importPptx: true,
  exportHtml: true,
  exportSvg: true,
  exportPdf: true,
  exportPsd: true,
  exportPptx: true,
  exportPng: true,
  exportJpeg: true,
  exportSvgEmbedded: true,
  exportOgraf: true,
  exportMp4: true,
  exportWebm: true,
  broadcastPreview: true,
};

export function createDefaultFeatureConfig(mode: DocumentMode): EditorFeatureConfig {
  if (mode === 'print') {
    return {
      ...ALL_ENABLED,
      transforms3d: false,
      animations: false,
      broadcastPreview: false,
    };
  }

  return { ...ALL_ENABLED };
}

// ---------------------------------------------------------------------------
// Grid settings
// ---------------------------------------------------------------------------

export interface GridSettings {
  gridSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
  snapThreshold: number;
}

export function createDefaultGridSettings(): GridSettings {
  return {
    gridSize: 5,
    showGrid: false,
    snapToGrid: false,
    snapThreshold: 5,
  };
}

// ---------------------------------------------------------------------------
// Canvas settings
// ---------------------------------------------------------------------------

export interface Guide {
  id: string;
  type: 'h' | 'v';
  pos: number;
  locked: boolean;
}

export interface CanvasSettings {
  units: 'px' | 'mm' | 'in';
  viewMode: 'broadcast' | 'print' | 'none';
  showRulers: boolean;
  originX: number;
  originY: number;
  perspective: number;
  zoom: number;
  panX: number;
  panY: number;
  guides: readonly Guide[];
  backgroundPdf?: string | undefined;
}

export function createDefaultCanvasSettings(): CanvasSettings {
  return {
    units: 'px',
    viewMode: 'none',
    showRulers: true,
    originX: 0,
    originY: 0,
    perspective: 1000,
    zoom: 1,
    panX: 0,
    panY: 0,
    guides: [],
  };
}

// ---------------------------------------------------------------------------
// Unit conversion — 96 DPI standard web convention
// ---------------------------------------------------------------------------

const MM_PER_INCH = 25.4;
const PX_PER_INCH = 96;

export function pxToMm(px: number): number {
  return (px * MM_PER_INCH) / PX_PER_INCH;
}

export function mmToPx(mm: number): number {
  return (mm * PX_PER_INCH) / MM_PER_INCH;
}

// ---------------------------------------------------------------------------
// Color normalization
// ---------------------------------------------------------------------------

const CSS_NAMED_COLORS: Readonly<Record<string, string>> = {
  black: '#000000',
  silver: '#c0c0c0',
  gray: '#808080',
  white: '#ffffff',
  maroon: '#800000',
  red: '#ff0000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  green: '#008000',
  lime: '#00ff00',
  olive: '#808000',
  yellow: '#ffff00',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  aqua: '#00ffff',
  orange: '#ffa500',
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  blanchedalmond: '#ffebcd',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  greenyellow: '#adff2f',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  oldlace: '#fdf5e6',
  olivedrab: '#6b8e23',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  whitesmoke: '#f5f5f5',
  yellowgreen: '#9acd32',
  rebeccapurple: '#663399',
  transparent: '#00000000',
};

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function byteToHex(b: number): string {
  return clampByte(b).toString(16).padStart(2, '0');
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sNorm = s / 100;
  const lNorm = l / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const hPrime = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  const m = lNorm - c / 2;

  let r1: number;
  let g1: number;
  let b1: number;

  if (hPrime < 1) {
    r1 = c;
    g1 = x;
    b1 = 0;
  } else if (hPrime < 2) {
    r1 = x;
    g1 = c;
    b1 = 0;
  } else if (hPrime < 3) {
    r1 = 0;
    g1 = c;
    b1 = x;
  } else if (hPrime < 4) {
    r1 = 0;
    g1 = x;
    b1 = c;
  } else if (hPrime < 5) {
    r1 = x;
    g1 = 0;
    b1 = c;
  } else {
    r1 = c;
    g1 = 0;
    b1 = x;
  }

  return [clampByte((r1 + m) * 255), clampByte((g1 + m) * 255), clampByte((b1 + m) * 255)];
}

export function normalizeColor(input: string): string {
  const trimmed = input.trim().toLowerCase();

  // Named CSS color
  const named = CSS_NAMED_COLORS[trimmed];

  if (named !== undefined) {
    return named;
  }

  // Hex formats
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);

    if (hex.length === 3) {
      const expanded = hex
        .split('')
        .map((c) => c + c)
        .join('');

      return `#${expanded}`;
    }

    if (hex.length === 4) {
      const expanded = hex
        .split('')
        .map((c) => c + c)
        .join('');

      return `#${expanded}`;
    }

    return trimmed;
  }

  // rgb(r, g, b) / rgba(r, g, b, a)
  const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(trimmed);

  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    const a = rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : undefined;

    const hex = `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;

    if (a !== undefined) {
      return `${hex}${byteToHex(Math.round(a * 255))}`;
    }

    return hex;
  }

  // hsl(h, s%, l%) / hsla(h, s%, l%, a)
  const hslMatch = /^hsla?\(\s*(\d+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(trimmed);

  if (hslMatch) {
    const h = Number(hslMatch[1]);
    const s = Number(hslMatch[2]);
    const l = Number(hslMatch[3]);
    const a = hslMatch[4] !== undefined ? Number(hslMatch[4]) : undefined;
    const [r, g, b] = hslToRgb(h, s, l);
    const hex = `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;

    if (a !== undefined) {
      return `${hex}${byteToHex(Math.round(a * 255))}`;
    }

    return hex;
  }

  return trimmed;
}
