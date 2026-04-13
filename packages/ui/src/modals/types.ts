interface ShortcutEntry {
  readonly action: string;
  readonly keys: readonly string[];
}

export interface MediaAsset {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly category: string;
}

export interface DocumentPreset {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly unit: string;
  readonly mode: string;
  readonly category: string;
}

export interface TemplateEntry {
  readonly id: string;
  readonly name: string;
  readonly thumbnail: string;
  readonly category: string;
}

export type ShortcutMap = Readonly<Record<string, readonly ShortcutEntry[]>>;
