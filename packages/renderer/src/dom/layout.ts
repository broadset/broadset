import {
  type BroadsetElement,
  type BroadsetElementStyle,
  resolveStyleColor,
  resolveStyleFilter,
} from '@broadset/model';

import { applyBackgroundStyle } from '../background';
import type { RendererRecord } from '../core/contracts';
import { buildElementTransform } from '../screen-renderer/transforms';

export function toPixelValue(value: number): string {
  return `${String(value)}px`;
}

function resolveClipPathValue(maskType: string | undefined, customClipPath: string | undefined): string {
  if (maskType === 'none' || maskType === undefined || customClipPath === undefined) return '';
  if (customClipPath.trim() === '') return '';

  return customClipPath;
}

function formatPadding(style: BroadsetElementStyle): string {
  if (style.padding === undefined) {
    return '0px';
  }

  return style.padding.map((value) => toPixelValue(value)).join(' ');
}

function formatBorderRadius(element: BroadsetElement, style: BroadsetElementStyle): string {
  if (element.type === 'ellipse') {
    return '50%';
  }

  if (style.borderRadius === undefined) {
    return '';
  }

  return style.borderRadius.map((value) => toPixelValue(value)).join(' ');
}

/**
 * Applies element geometry, opacity, clipping, typography, and background
 * styling to the three-layer host structure produced by
 * `DOMScreenRenderer.getOrCreateRecord`.
 *
 * The split between `host` (geometry + mix-blend-mode), `opacityHost`
 * (opacity target), and `contentHost` (everything else) is deliberate:
 *
 * - `mix-blend-mode` MUST live on the outermost per-element host so the
 *   element blends against sibling elements behind it. Placing it on an
 *   inner node (inside `opacityHost`, which creates a new stacking context
 *   when opacity < 1) would isolate the blend to that stacking context and
 *   paint as a no-op.
 * - Parented elements use model-space coordinates relative to their parent's
 *   top-left. Applying parent padding on the same host shifts that
 *   coordinate origin, so containers with children set `padding: 0`.
 */
export function applyElementLayout(record: RendererRecord, element: BroadsetElement, hasChildren: boolean): void {
  const { contentHost, host, opacityHost } = record;
  const { style } = element;
  const transforms = buildElementTransform(element, style);

  host.style.position = 'absolute';
  host.style.left = toPixelValue(element.position.x);
  host.style.top = toPixelValue(element.position.y);
  host.style.width = toPixelValue(element.width);
  host.style.height = toPixelValue(element.height);
  host.style.transform = transforms;
  host.style.transformOrigin = 'center center';
  host.style.pointerEvents = 'none';
  host.style.mixBlendMode = style.mixBlendMode ?? '';

  opacityHost.style.width = '100%';
  opacityHost.style.height = '100%';
  // Guard against undefined/NaN opacity: `String(undefined)` is the literal
  // "undefined", which is an invalid CSS value and silently drops the
  // opacity style. Default to fully opaque (1) when the style payload
  // omits it.
  opacityHost.style.opacity =
    typeof style.opacity === 'number' && Number.isFinite(style.opacity) ? String(style.opacity) : '1';

  contentHost.style.position = 'relative';
  contentHost.style.display = 'block';
  contentHost.style.width = '100%';
  contentHost.style.height = '100%';
  contentHost.style.boxSizing = 'border-box';
  contentHost.style.overflow = style.clipChildren === true ? 'hidden' : 'visible';

  const maskValue = resolveClipPathValue(style.maskType, style.customClipPath);

  contentHost.style.clipPath = maskValue;
  contentHost.style.padding = hasChildren ? '0px' : formatPadding(style);
  contentHost.style.borderRadius = formatBorderRadius(element, style);
  contentHost.style.borderWidth = style.borderWidth === undefined ? '' : toPixelValue(style.borderWidth);
  contentHost.style.borderStyle = style.borderWidth === undefined ? '' : (style.borderStyle ?? 'solid');
  contentHost.style.borderColor = resolveStyleColor(style.borderColor, { resolveTheme: false }) ?? '';
  contentHost.style.boxShadow = style.boxShadow ?? '';
  contentHost.style.filter = resolveStyleFilter(style.filter, { resolveTheme: false }) ?? '';
  contentHost.style.backdropFilter = resolveStyleFilter(style.backdropFilter, { resolveTheme: false }) ?? '';
  contentHost.style.isolation = style.isolation ?? '';
  contentHost.style.color = resolveStyleColor(style.fontColor, { resolveTheme: false }) ?? '';
  contentHost.style.fontFamily = style.fontFamily ?? '';
  contentHost.style.fontSize = style.fontSize === undefined ? '' : toPixelValue(style.fontSize);
  contentHost.style.fontWeight = style.fontWeight === undefined ? '' : String(style.fontWeight);
  contentHost.style.fontStyle = style.fontStyle ?? '';
  contentHost.style.letterSpacing = style.letterSpacing === undefined ? '' : toPixelValue(style.letterSpacing);
  contentHost.style.lineHeight = style.lineHeight === undefined ? '' : String(style.lineHeight);
  contentHost.style.textAlign = style.textAlignment ?? '';
  contentHost.style.textDecoration = style.textDecoration ?? '';
  contentHost.style.textTransform = style.textTransform ?? '';
  contentHost.style.fontVariationSettings = style.fontVariationSettings ?? '';
  contentHost.style.whiteSpace = element.type === 'ticker' ? 'nowrap' : 'normal';

  applyBackgroundStyle(contentHost, style);
}
