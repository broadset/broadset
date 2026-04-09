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
  image: { width: 60, height: 60, content: '' },
  svg: { width: 60, height: 60, content: '' },
  path: { width: 80, height: 50, content: '' },
  rectangle: { width: 80, height: 50, content: '' },
  ellipse: { width: 50, height: 50, content: '' },
  qrcode: { width: 40, height: 40, content: 'https://example.com' },
  group: { width: 120, height: 80, content: '' },
  video: { width: 120, height: 68, content: '' },
  clock: { width: 160, height: 50, content: 'HH:mm:ss' },
  ticker: { width: 400, height: 40, content: '["Item 1"]' },
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
