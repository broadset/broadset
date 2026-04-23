import type { BroadsetElementStyle, BroadsetElementStyleInput } from '../style';

export const BUILT_IN_ELEMENT_TYPES = [
  'text',
  'image',
  'svg',
  'path',
  'rectangle',
  'ellipse',
  'qrcode',
  'group',
  'video',
  'clock',
  'ticker',
] as const;

export type BuiltInElementType = (typeof BUILT_IN_ELEMENT_TYPES)[number];

export interface ElementPosition {
  readonly x: number;
  readonly y: number;
}

export interface DataFieldBinding {
  readonly fieldName: string;
  readonly overflow: 'clip' | 'ellipsis' | 'shrink' | 'scroll';
  readonly prefix?: string | undefined;
  readonly suffix?: string | undefined;
  readonly formatPattern?: string | undefined;
}

export interface RepeaterConfig {
  readonly dataArrayField: string;
  readonly direction: 'horizontal' | 'vertical' | 'grid';
  readonly gap: number;
  readonly maxItems?: number | undefined;
}

export interface ComponentRef {
  readonly componentId: string;
  readonly overrides?: Readonly<Record<string, unknown>> | undefined;
}

export interface VideoTypeConfig {
  readonly loop: boolean;
  readonly autoplay: boolean;
  readonly muted: boolean;
  readonly startTimeS: number;
  readonly endTimeS: number | null;
}

export interface ClockTypeConfig {
  readonly mode: 'realtime' | 'countdown' | 'countup' | 'stopwatch';
  readonly startValue: string | number | null;
  readonly targetValue: string | number | null;
  readonly countdownTo: string | null;
}

export interface TickerTypeConfig {
  readonly speed: number;
  readonly direction: 'left' | 'right' | 'up' | 'down';
  readonly gap: number;
  readonly paused: boolean;
}

export type ElementTypeConfig =
  | VideoTypeConfig
  | ClockTypeConfig
  | TickerTypeConfig
  | Readonly<Record<string, unknown>>;

export type AutoSizeMode = 'fixed' | 'auto-height' | 'shrink-to-fit';
export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude';

export interface BroadsetElement {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly locked: boolean;
  readonly position: ElementPosition;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly content: string;
  readonly style: BroadsetElementStyle;
  readonly parentId: string | null;
  readonly groupId: string | null;
  readonly assetId: string | null;
  readonly dataField: DataFieldBinding | null;
  readonly visibleWhen: string | null;
  readonly repeater: RepeaterConfig | null;
  readonly typeConfig: ElementTypeConfig | null;
  readonly componentRef: ComponentRef | null;
  readonly autoSize: AutoSizeMode;
  readonly textPathElementId: string | null;
  readonly booleanOperation: BooleanOperation | null;
  readonly extensions: Readonly<Record<string, unknown>>;
}

export type ElementOverrides = Readonly<
  Partial<Omit<BroadsetElement, 'style' | 'type'>> & {
    readonly style?: Partial<BroadsetElementStyleInput>;
  }
>;
