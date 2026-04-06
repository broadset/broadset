export interface ElementDefaults {
  readonly width: number;
  readonly height: number;
  readonly content: string;
}

export interface PluginDefaults {
  readonly type: string;
  readonly defaults?: {
    readonly width?: number;
    readonly height?: number;
    readonly content?: string;
  };
}

const SYSTEM_FALLBACK: ElementDefaults = {
  width: 80,
  height: 50,
  content: '',
};

const BUILT_IN_DEFAULTS: Readonly<Record<string, ElementDefaults>> = {
  text: { width: 80, height: 20, content: 'New Text' },
  image: { width: 120, height: 90, content: '' },
  svg: { width: 120, height: 90, content: '' },
  path: { width: 80, height: 50, content: '' },
  rectangle: { width: 80, height: 50, content: '' },
  ellipse: { width: 50, height: 50, content: '' },
  qrcode: { width: 40, height: 40, content: 'https://example.com' },
  group: { width: 120, height: 80, content: '' },
  video: { width: 320, height: 180, content: '' },
  clock: { width: 180, height: 56, content: '12:34' },
  ticker: { width: 320, height: 48, content: '[]' },
};

export function getElementDefaults(type: string, plugins: readonly PluginDefaults[] = []): ElementDefaults {
  const plugin = plugins.find((candidate) => candidate.type === type);

  if (plugin?.defaults !== undefined) {
    return {
      width: plugin.defaults.width ?? SYSTEM_FALLBACK.width,
      height: plugin.defaults.height ?? SYSTEM_FALLBACK.height,
      content: plugin.defaults.content ?? SYSTEM_FALLBACK.content,
    };
  }

  if (plugin !== undefined) {
    return SYSTEM_FALLBACK;
  }

  return BUILT_IN_DEFAULTS[type] ?? SYSTEM_FALLBACK;
}
