import type { projectFormatV1 } from '@broadset/model';

import { xmlAttribute } from './xml';

const RGB_CHANNEL_MAX = 255;

function formatNumber(value: number): string {
  if (!Number.isFinite(value) || Object.is(value, -0)) return '0';

  return String(value);
}

function resolveSwatchColor(
  color: projectFormatV1.ColorValue,
  project: projectFormatV1.BroadsetProjectV1,
): projectFormatV1.ConcreteColorValue | undefined {
  if (color.kind === 'color') return color;

  const swatch: projectFormatV1.Swatch | undefined = project.resources.swatches.find(({ id }) => id === color.swatchId);

  return swatch?.kind === 'process' ? swatch.color : swatch?.alternateColor;
}

function resolvePaintColor(
  paint: projectFormatV1.Paint,
  project: projectFormatV1.BroadsetProjectV1,
): projectFormatV1.ConcreteColorValue | undefined {
  if (paint.kind === 'solid') return resolveSwatchColor(paint.color, project);
  if (paint.kind !== 'gradient') return undefined;

  for (const stop of paint.gradient.stops) {
    const color = resolveSwatchColor(stop.color, project);

    if (color !== undefined) return { ...color, alpha: color.alpha * stop.opacity };
  }

  return undefined;
}

function cssColor(color: projectFormatV1.ConcreteColorValue | undefined): string | undefined {
  if (color?.space !== 'srgb') return undefined;

  const [red = 0, green = 0, blue = 0] = color.channels;
  const channels = [red, green, blue].map((channel) => Math.round(channel * RGB_CHANNEL_MAX));
  const rgb = `${String(channels[0])}, ${String(channels[1])}, ${String(channels[2])}`;

  return color.alpha < 1 ? `rgba(${rgb}, ${formatNumber(color.alpha)})` : `rgb(${rgb})`;
}

function firstEnabledFill(appearance: projectFormatV1.Appearance): projectFormatV1.FillLayer | undefined {
  return appearance.fills.find(({ enabled }) => enabled);
}

function firstEnabledStroke(appearance: projectFormatV1.Appearance): projectFormatV1.StrokeLayer | undefined {
  return appearance.strokes.find(({ enabled }) => enabled);
}

export function appearanceAttributes(
  appearance: projectFormatV1.Appearance,
  project: projectFormatV1.BroadsetProjectV1,
): string {
  const fill: projectFormatV1.FillLayer | undefined = firstEnabledFill(appearance);
  const stroke: projectFormatV1.StrokeLayer | undefined = firstEnabledStroke(appearance);
  const fillColor = fill === undefined ? undefined : cssColor(resolvePaintColor(fill.paint, project));
  const strokeColor = stroke === undefined ? undefined : cssColor(resolvePaintColor(stroke.paint, project));
  let attributes = xmlAttribute('fill', fillColor ?? 'none');

  if (fill !== undefined) attributes += xmlAttribute('fill-opacity', formatNumber(fill.opacity));

  attributes += xmlAttribute('stroke', strokeColor ?? 'none');

  if (stroke !== undefined) {
    attributes += xmlAttribute('stroke-opacity', formatNumber(stroke.opacity));
    attributes += xmlAttribute('stroke-width', formatNumber(stroke.width));
    attributes += xmlAttribute('stroke-linecap', stroke.cap);
    attributes += xmlAttribute('stroke-linejoin', stroke.join);
    attributes += xmlAttribute('stroke-miterlimit', formatNumber(stroke.miterLimit));

    if (stroke.dash.length > 0) {
      attributes += xmlAttribute('stroke-dasharray', stroke.dash.map(formatNumber).join(' '));
      attributes += xmlAttribute('stroke-dashoffset', formatNumber(stroke.dashOffset));
    }
  }

  if (appearance.opacity < 1) attributes += xmlAttribute('opacity', formatNumber(appearance.opacity));

  return attributes;
}

export function textColorAttribute(
  color: projectFormatV1.ColorValue,
  project: projectFormatV1.BroadsetProjectV1,
): string {
  return xmlAttribute('fill', cssColor(resolveSwatchColor(color, project)) ?? 'none');
}

export function svgNumber(value: number): string {
  return formatNumber(value);
}
