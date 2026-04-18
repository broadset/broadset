import type { BroadsetDocument, BroadsetElement, FontDefinition } from '@broadset/model';

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

// eslint-disable-next-line sonarjs/cognitive-complexity -- cc=44; covers every preflight check category in one pass; see lint-strictness-plan.md Phase 4 followup.
export function runPreflightDiagnostics(
  document: BroadsetDocument,
  config: PreflightConfig,
): readonly PreflightDiagnostic[] {
  const issues: PreflightDiagnostic[] = [];
  const { canvas, documentMode, elements } = document;
  const isPrint = documentMode === 'print';
  const bleedMm = config.bleedMarginMm ?? DEFAULT_BLEED_MARGIN_MM;

  const allowedFontFamilies: ReadonlySet<string> = new Set(
    (config.allowedFonts ?? []).map((font) => font.family.toLowerCase()),
  );

  for (const element of elements) {
    const isTextLike = element.type === 'text' || element.type === 'ticker' || element.type === 'clock';

    if (
      (isTextLike || element.type === 'image' || element.type === 'svg') &&
      isElementOutsideTitleSafe(element, canvas.width, canvas.height)
    ) {
      issues.push({
        rule: 'title-safe',
        severity: 'warning',
        elementName: element.name,
        message: `"${element.name}" extends beyond the title-safe area`,
      });
    }

    if (element.type === 'image' && (element.width > MIN_DPI_DIMENSION_PX || element.height > MIN_DPI_DIMENSION_PX)) {
      issues.push({
        rule: 'dpi-resolution',
        severity: 'info',
        elementName: element.name,
        message: `"${element.name}" is rendered at ${String(Math.round(Math.max(element.width, element.height)))}px — recommend source resolution of at least 1.5× rendered size`,
      });
    }

    if (isPrint && isElementBeyondBleed(element, canvas.width, canvas.height, bleedMm)) {
      issues.push({
        rule: 'bleed',
        severity: 'warning',
        elementName: element.name,
        message: `"${element.name}" extends beyond canvas bounds + ${String(bleedMm)}mm bleed margin`,
      });
    }

    if (isPrint && isTextLike) {
      const fontSize = element.style.fontSize ?? 0;

      if (fontSize > 0 && fontSize < MIN_PRINT_FONT_SIZE_PT) {
        issues.push({
          rule: 'small-text',
          severity: 'warning',
          elementName: element.name,
          message: `"${element.name}" has font size ${String(fontSize)}pt — minimum recommended is ${String(MIN_PRINT_FONT_SIZE_PT)}pt for print`,
        });
      }
    }

    if (isPrint) {
      const bgColor = element.style.backgroundColor;
      const borderColor = element.style.borderColor;

      if (isFluorescentColor(bgColor) || isFluorescentColor(borderColor)) {
        issues.push({
          rule: 'color-mode',
          severity: 'info',
          elementName: element.name,
          message: `"${element.name}" uses a fluorescent or out-of-gamut color that may not reproduce accurately in print`,
        });
      }
    }

    if (isPrint) {
      for (const property of SCREEN_ONLY_STYLE_PROPERTIES) {
        const value = element.style[property];

        if (typeof value === 'number' && value !== 0) {
          issues.push({
            rule: 'unsupported-property',
            severity: 'warning',
            elementName: element.name,
            message: `"${element.name}" uses "${property}" which is not supported in print mode`,
          });
        }
      }
    }

    if (isTextLike && config.allowedFonts !== undefined) {
      const fontFamily = element.style.fontFamily;

      if (fontFamily !== undefined && fontFamily !== '') {
        const normalized = fontFamily.toLowerCase();

        if (!SYSTEM_FALLBACK_FONTS.has(normalized) && !allowedFontFamilies.has(normalized)) {
          issues.push({
            rule: 'missing-font',
            severity: 'warning',
            elementName: element.name,
            message: `"${element.name}" uses font "${fontFamily}" which is not in the allowed fonts list`,
          });
        }
      }
    }
  }

  return issues;
}
