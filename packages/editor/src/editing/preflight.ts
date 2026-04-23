import { type BroadsetDocument, type BroadsetElement, type FontDefinition, resolveStyleColor } from '@broadset/model';

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

function isFluorescentColor(hex: string | undefined): boolean {
  if (hex === undefined || hex === '') {
    return false;
  }

  if (!hex.startsWith('#')) {
    return false;
  }

  const rgb = parseHexRgb(hex);

  if (rgb === undefined) {
    return false;
  }

  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

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

interface PreflightContext {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly isPrint: boolean;
  readonly bleedMm: number;
  readonly allowedFontFamilies: ReadonlySet<string>;
  readonly enforceAllowedFonts: boolean;
}

function isTextLikeElement(element: BroadsetElement): boolean {
  return element.type === 'text' || element.type === 'ticker' || element.type === 'clock';
}

type RuleCheck = (element: BroadsetElement, ctx: PreflightContext) => readonly PreflightDiagnostic[];

function checkTitleSafe(element: BroadsetElement, ctx: PreflightContext): readonly PreflightDiagnostic[] {
  const applies = isTextLikeElement(element) || element.type === 'image' || element.type === 'svg';

  if (!applies || !isElementOutsideTitleSafe(element, ctx.canvasWidth, ctx.canvasHeight)) {
    return [];
  }

  return [
    {
      rule: 'title-safe',
      severity: 'warning',
      elementName: element.name,
      message: `"${element.name}" extends beyond the title-safe area`,
    },
  ];
}

function checkDpiResolution(element: BroadsetElement): readonly PreflightDiagnostic[] {
  if (element.type !== 'image' || (element.width <= MIN_DPI_DIMENSION_PX && element.height <= MIN_DPI_DIMENSION_PX)) {
    return [];
  }

  const rendered = Math.round(Math.max(element.width, element.height));

  return [
    {
      rule: 'dpi-resolution',
      severity: 'info',
      elementName: element.name,
      message: `"${element.name}" is rendered at ${String(rendered)}px — recommend source resolution of at least 1.5× rendered size`,
    },
  ];
}

function checkBleed(element: BroadsetElement, ctx: PreflightContext): readonly PreflightDiagnostic[] {
  if (!ctx.isPrint || !isElementBeyondBleed(element, ctx.canvasWidth, ctx.canvasHeight, ctx.bleedMm)) {
    return [];
  }

  return [
    {
      rule: 'bleed',
      severity: 'warning',
      elementName: element.name,
      message: `"${element.name}" extends beyond canvas bounds + ${String(ctx.bleedMm)}mm bleed margin`,
    },
  ];
}

function checkSmallText(element: BroadsetElement, ctx: PreflightContext): readonly PreflightDiagnostic[] {
  if (!ctx.isPrint || !isTextLikeElement(element)) {
    return [];
  }

  const fontSize = element.style.fontSize ?? 0;

  if (fontSize <= 0 || fontSize >= MIN_PRINT_FONT_SIZE_PT) {
    return [];
  }

  return [
    {
      rule: 'small-text',
      severity: 'warning',
      elementName: element.name,
      message: `"${element.name}" has font size ${String(fontSize)}pt — minimum recommended is ${String(MIN_PRINT_FONT_SIZE_PT)}pt for print`,
    },
  ];
}

function checkColorMode(element: BroadsetElement, ctx: PreflightContext): readonly PreflightDiagnostic[] {
  if (!ctx.isPrint) {
    return [];
  }

  const hasFluorescent =
    isFluorescentColor(resolveStyleColor(element.style.backgroundColor, { resolveTheme: false })) ||
    isFluorescentColor(resolveStyleColor(element.style.borderColor, { resolveTheme: false }));

  if (!hasFluorescent) {
    return [];
  }

  return [
    {
      rule: 'color-mode',
      severity: 'info',
      elementName: element.name,
      message: `"${element.name}" uses a fluorescent or out-of-gamut color that may not reproduce accurately in print`,
    },
  ];
}

function checkUnsupportedProperty(element: BroadsetElement, ctx: PreflightContext): readonly PreflightDiagnostic[] {
  if (!ctx.isPrint) {
    return [];
  }

  return SCREEN_ONLY_STYLE_PROPERTIES.flatMap((property) => {
    const value = element.style[property];

    if (typeof value !== 'number' || value === 0) {
      return [];
    }

    return [
      {
        rule: 'unsupported-property',
        severity: 'warning',
        elementName: element.name,
        message: `"${element.name}" uses "${property}" which is not supported in print mode`,
      },
    ];
  });
}

function checkMissingFont(element: BroadsetElement, ctx: PreflightContext): readonly PreflightDiagnostic[] {
  if (!ctx.enforceAllowedFonts || !isTextLikeElement(element)) {
    return [];
  }

  const fontFamily = element.style.fontFamily;

  if (fontFamily === undefined || fontFamily === '') {
    return [];
  }

  const normalized = fontFamily.toLowerCase();

  if (SYSTEM_FALLBACK_FONTS.has(normalized) || ctx.allowedFontFamilies.has(normalized)) {
    return [];
  }

  return [
    {
      rule: 'missing-font',
      severity: 'warning',
      elementName: element.name,
      message: `"${element.name}" uses font "${fontFamily}" which is not in the allowed fonts list`,
    },
  ];
}

const PREFLIGHT_RULES: readonly RuleCheck[] = [
  checkTitleSafe,
  checkDpiResolution,
  checkBleed,
  checkSmallText,
  checkColorMode,
  checkUnsupportedProperty,
  checkMissingFont,
];

export function runPreflightDiagnostics(
  document: BroadsetDocument,
  config: PreflightConfig,
): readonly PreflightDiagnostic[] {
  const ctx: PreflightContext = {
    canvasWidth: document.canvas.width,
    canvasHeight: document.canvas.height,
    isPrint: document.documentMode === 'print',
    bleedMm: config.bleedMarginMm ?? DEFAULT_BLEED_MARGIN_MM,
    allowedFontFamilies: new Set((config.allowedFonts ?? []).map((font) => font.family.toLowerCase())),
    enforceAllowedFonts: config.allowedFonts !== undefined,
  };

  return document.elements.flatMap((element) => PREFLIGHT_RULES.flatMap((rule) => rule(element, ctx)));
}
