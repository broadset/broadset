import type { BroadsetElementStyleInput } from '@broadset/model';

export interface ElementDefaults {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly content: string;
  readonly style: Partial<BroadsetElementStyleInput>;
}

export interface PluginDefaults {
  readonly type: string;
  readonly label?: string;
  readonly defaults?: {
    readonly name?: string;
    readonly width?: number;
    readonly height?: number;
    readonly content?: string;
    readonly style?: Partial<BroadsetElementStyleInput>;
  };
}

const DEFAULT_SHAPE_FILL = '#94a3b8';
const DEFAULT_TEXT_COLOR = '#0f172a';
const DEFAULT_PATH_STROKE = '#0f172a';
const DEFAULT_PATH_STROKE_WIDTH = 2;
const DEFAULT_BORDER_COLOR = '#475569';
const DEFAULT_BORDER_WIDTH = 1;

const FALLBACK_SHAPE_FILL_STYLE = { backgroundColor: DEFAULT_SHAPE_FILL } as const;

const SYSTEM_FALLBACK: ElementDefaults = {
  name: 'Element',
  width: 80,
  height: 50,
  content: '',
  style: FALLBACK_SHAPE_FILL_STYLE,
};

const BUILT_IN_DEFAULTS: Readonly<Record<string, ElementDefaults>> = {
  text: {
    name: 'Text',
    width: 80,
    height: 20,
    content: 'New Text',
    style: { fontColor: DEFAULT_TEXT_COLOR },
  },
  image: {
    name: 'Image',
    width: 60,
    height: 60,
    content: '',
    style: {},
  },
  svg: {
    name: 'SVG',
    width: 60,
    height: 60,
    content: '',
    style: {},
  },
  path: {
    name: 'Path',
    width: 80,
    height: 50,
    content: '',
    style: { stroke: DEFAULT_PATH_STROKE, strokeWidth: DEFAULT_PATH_STROKE_WIDTH },
  },
  rectangle: {
    name: 'Rectangle',
    width: 80,
    height: 50,
    content: '',
    style: FALLBACK_SHAPE_FILL_STYLE,
  },
  ellipse: {
    name: 'Ellipse',
    width: 50,
    height: 50,
    content: '',
    style: FALLBACK_SHAPE_FILL_STYLE,
  },
  qrcode: {
    name: 'QR Code',
    width: 40,
    height: 40,
    content: 'https://example.com',
    style: {},
  },
  group: {
    name: 'Group',
    width: 120,
    height: 80,
    content: '',
    style: {
      borderColor: DEFAULT_BORDER_COLOR,
      borderWidth: DEFAULT_BORDER_WIDTH,
      borderStyle: 'dashed',
    },
  },
  video: {
    name: 'Video',
    width: 120,
    height: 68,
    content: '',
    style: {},
  },
  clock: {
    name: 'Clock',
    width: 160,
    height: 50,
    content: 'HH:mm:ss',
    style: { fontColor: DEFAULT_TEXT_COLOR },
  },
  ticker: {
    name: 'Ticker',
    width: 400,
    height: 40,
    content: '["Item 1"]',
    style: { fontColor: DEFAULT_TEXT_COLOR },
  },
};

function capitalizeTypeToken(type: string): string {
  if (type === '') return SYSTEM_FALLBACK.name;

  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function getElementDefaults(type: string, plugins: readonly PluginDefaults[] = []): ElementDefaults {
  const plugin = plugins.find((candidate) => candidate.type === type);

  if (plugin !== undefined) {
    const pluginDefaults = plugin.defaults;
    const resolvedName = pluginDefaults?.name ?? plugin.label ?? capitalizeTypeToken(type);

    if (pluginDefaults !== undefined) {
      return {
        name: resolvedName,
        width: pluginDefaults.width ?? SYSTEM_FALLBACK.width,
        height: pluginDefaults.height ?? SYSTEM_FALLBACK.height,
        content: pluginDefaults.content ?? SYSTEM_FALLBACK.content,
        style: pluginDefaults.style ?? {},
      };
    }

    return { ...SYSTEM_FALLBACK, name: resolvedName };
  }

  return BUILT_IN_DEFAULTS[type] ?? { ...SYSTEM_FALLBACK, name: capitalizeTypeToken(type) };
}
